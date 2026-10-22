// USB link with the car through Web Serial (Chrome, Edge).

const sleep = ms => new Promise(r => setTimeout(r, ms));

class SerialPortIO {
  constructor(port) {
    this.port = port;
    this.rx = [];
    this.waiters = [];
    this.reading = false;
  }

  async open(baudRate) {
    await this.port.open({baudRate, bufferSize: 4096});
    this.writer = this.port.writable.getWriter();
    this.reading = true;
    this.readLoopDone = this.readLoop();
  }

  async readLoop() {
    while (this.reading && this.port.readable) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const {value, done} = await this.reader.read();
          if (done)
            break;
          for (const b of value)
            this.rx.push(b);
          this.wake();
        }
      } catch (e) {
        // Port closed or device unplugged.
        this.reading = false;
      } finally {
        this.reader.releaseLock();
      }
    }
  }

  wake() {
    const w = this.waiters;
    this.waiters = [];
    w.forEach(f => f());
  }

  async close() {
    this.reading = false;
    try {
      await this.reader?.cancel();
    } catch (e) { /* already closed */ }
    await this.readLoopDone;
    try {
      this.writer.releaseLock();
      await this.port.close();
    } catch (e) { /* already closed */ }
  }

  flush() {
    this.rx = [];
  }

  async write(bytes) {
    await this.writer.write(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes));
  }

  // Waits until n bytes are available and returns them.
  async read(n, timeout) {
    const t0 = performance.now();
    while (this.rx.length < n) {
      const left = timeout - (performance.now() - t0);
      if (left <= 0 || !this.reading)
        throw new Error('timeout');
      await new Promise(r => {
        this.waiters.push(r);
        setTimeout(r, left);
      });
    }
    return this.rx.splice(0, n);
  }

  async readLine(timeout) {
    let s = '';
    for (;;) {
      const [b] = await this.read(1, timeout);
      if (b === 10)
        return s.replace(/\r$/, '');
      s += String.fromCharCode(b);
    }
  }

  // Skips lines until one starts with one of the prefixes.
  async expectLine(prefixes, timeout) {
    const t0 = performance.now();
    for (;;) {
      const left = timeout - (performance.now() - t0);
      const line = await this.readLine(Math.max(1, left));
      if (prefixes.some(p => line.startsWith(p)))
        return line;
    }
  }
}

class CarLink {
  constructor(onLine) {
    this.io = null;
    this.port = null;
    this.onLine = onLine || (() => {});
    this.busy = false;
  }

  static supported() {
    return 'serial' in navigator;
  }

  get connected() {
    return !!this.io;
  }

  async choosePort() {
    this.port = await navigator.serial.requestPort();
  }

  // Opening the port resets the board, so wait for the firmware to boot.
  async connect() {
    if (!this.port)
      await this.choosePort();
    this.io = new SerialPortIO(this.port);
    await this.io.open(115200);
    this.port.addEventListener('disconnect', () => this.dropped());
    for (let attempt = 0; attempt < 6; attempt++) {
      await sleep(attempt ? 500 : 1800);
      this.io.flush();
      await this.io.write([0x3F]);  // '?'
      try {
        const line = await this.io.expectLine(['ADEEPTBLOCS'], 700);
        this.version = Number(line.split(' ')[1]);
        return true;
      } catch (e) { /* not booted yet */ }
    }
    return false;  // connected, but our firmware does not answer
  }

  dropped() {
    this.io = null;
    this.onLine('disconnected');
  }

  async disconnect() {
    if (this.io) {
      const io = this.io;
      this.io = null;
      await io.close();
    }
  }

  async exclusive(fn) {
    if (this.busy)
      throw new Error('La voiture est occupée.');
    this.busy = true;
    try {
      return await fn(this.io);
    } finally {
      this.busy = false;
    }
  }

  // Sends a program image. toRam = run it once without replacing the saved program.
  async sendProgram(bytes, toRam = false) {
    return this.exclusive(async io => {
      io.flush();
      await io.write([toRam ? 0x58 : 0x50, bytes.length & 0xFF, bytes.length >> 8]);
      let sum = 0;
      for (let i = 0; i < bytes.length; i += 32) {
        const chunk = bytes.subarray(i, i + 32);
        chunk.forEach(b => { sum = (sum + b) & 0xFF; });
        await io.write(chunk);
        if (chunk.length === 32) {
          const [ack] = await io.read(1, 2000);
          if (ack !== 0x2E)  // '.'
            throw new Error('réponse inattendue de la voiture');
        }
      }
      await io.write([sum]);
      const line = await io.expectLine(['OK', 'ERR'], 3000);
      if (!line.startsWith('OK'))
        throw new Error(line);
    });
  }

  // Runs a program once without saving it, and waits until it is over.
  // Returns the last line: END, STOP or an error.
  async runOnce(bytes, timeout = 20000) {
    await this.sendProgram(bytes, true);
    return this.exclusive(io => io.expectLine(['END', 'STOP', 'ERR'], timeout));
  }

  async run() {
    return this.exclusive(async io => io.write([0x52]));  // 'R'
  }

  async stop() {
    if (this.io)
      await this.io.write([0x53]);  // 'S'
  }

  async sensors() {
    return this.exclusive(async io => {
      io.flush();
      await io.write([0x44]);  // 'D'
      const line = await io.expectLine(['D '], 1000);
      const [dist, l, m, r, light, battery, key] = line.slice(2).split(' ').map(Number);
      return {dist, line: [l, m, r], light, battery, key};
    });
  }
}

// Flashing the firmware with the STK500v1 protocol of the Arduino bootloader.

function parseIntelHex(text) {
  const mem = new Uint8Array(32768).fill(0xFF);
  let size = 0;
  let base = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith(':'))
      continue;
    const bytes = line.slice(1).match(/../g).map(h => parseInt(h, 16));
    const [n, hi, lo, type] = bytes;
    const sum = bytes.reduce((a, b) => (a + b) & 0xFF, 0);
    if (sum !== 0)
      throw new Error('fichier hex abîmé');
    if (type === 0) {
      const addr = base + (hi << 8 | lo);
      mem.set(bytes.slice(4, 4 + n), addr);
      size = Math.max(size, addr + n);
    } else if (type === 2) {
      base = (bytes[4] << 8 | bytes[5]) << 4;
    } else if (type === 4) {
      base = (bytes[4] << 8 | bytes[5]) << 16;
    } else if (type === 1) {
      break;
    }
  }
  return mem.subarray(0, size);
}

class Stk500 {
  constructor(io) {
    this.io = io;
  }

  async cmd(bytes, replyLen = 0, timeout = 400) {
    await this.io.write([...bytes, 0x20]);
    const r = await this.io.read(2 + replyLen, timeout);
    if (r[0] !== 0x14 || r[r.length - 1] !== 0x10)
      throw new Error('réponse bootloader invalide');
    return r.slice(1, 1 + replyLen);
  }

  async sync() {
    for (let i = 0; i < 8; i++) {
      this.io.flush();
      try {
        await this.cmd([0x30], 0, 250);
        return true;
      } catch (e) {
        await sleep(50);
      }
    }
    return false;
  }
}

async function resetBoard(port) {
  await port.setSignals({dataTerminalReady: false, requestToSend: false});
  await sleep(250);
  await port.setSignals({dataTerminalReady: true, requestToSend: true});
  await sleep(50);
}

// Writes the firmware. progress(fraction, message) is called along the way.
async function flashFirmware(port, hexText, progress) {
  const image = parseIntelHex(hexText);
  for (const baud of [115200, 57600]) {
    const io = new SerialPortIO(port);
    await io.open(baud);
    try {
      progress(0, `Connexion au chargeur (${baud} bauds)…`);
      await resetBoard(port);
      const stk = new Stk500(io);
      if (!(await stk.sync()))
        continue;
      const sig = await stk.cmd([0x75], 3);
      if (sig[0] !== 0x1E || sig[1] !== 0x95 || sig[2] !== 0x0F)
        throw new Error('Ce n\'est pas un ATmega328P (signature ' + sig.map(b => b.toString(16)).join(' ') + ').');
      await stk.cmd([0x50]);  // enter programming mode
      const PAGE = 128;
      const pages = Math.ceil(image.length / PAGE);
      for (let p = 0; p < pages; p++) {
        const page = new Uint8Array(PAGE).fill(0xFF);
        page.set(image.subarray(p * PAGE, (p + 1) * PAGE));
        const word = p * PAGE / 2;
        await stk.cmd([0x55, word & 0xFF, word >> 8]);
        await stk.cmd([0x64, 0x00, PAGE, 0x46, ...page], 0, 1000);
        progress((p + 1) / pages * 0.8, 'Écriture…');
      }
      for (let p = 0; p < pages; p++) {
        const word = p * PAGE / 2;
        await stk.cmd([0x55, word & 0xFF, word >> 8]);
        const back = await stk.cmd([0x74, 0x00, PAGE, 0x46], PAGE, 1000);
        const want = image.subarray(p * PAGE, (p + 1) * PAGE);
        for (let i = 0; i < want.length; i++)
          if (back[i] !== want[i])
            throw new Error('La vérification a échoué à l\'adresse ' + (p * PAGE + i) + '.');
        progress(0.8 + (p + 1) / pages * 0.2, 'Vérification…');
      }
      await stk.cmd([0x51]);  // leave programming mode, the firmware starts
      return;
    } finally {
      await io.close();
    }
  }
  throw new Error('Le chargeur de la carte ne répond pas. Retire le module WiFi ESP8266 et réessaie.');
}
