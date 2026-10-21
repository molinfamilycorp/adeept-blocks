// Runs the bytecode in the browser, with the same semantics as the firmware, and
// draws the car seen from above.

const ARENA_W = 240;  // cm
const ARENA_H = 160;
const CAR_LEN = 24;
const CAR_WID = 18;
const TUNES = [
  [[523, 120], [659, 120], [784, 120], [1047, 400]],
  [[392, 300], [370, 300], [349, 300], [330, 700]],
  [[880, 150], [660, 150], [880, 150], [660, 150], [880, 150], [660, 150]],
  [[262, 250], [262, 250], [294, 500], [262, 500], [349, 500], [330, 1000],
   [262, 250], [262, 250], [294, 500], [262, 500], [392, 500], [349, 1000],
   [262, 250], [262, 250], [523, 500], [440, 500], [349, 500], [330, 500], [294, 1000],
   [466, 250], [466, 250], [440, 500], [349, 500], [392, 500], [349, 1000]],
  [[2000, 60], [1500, 60], [2500, 60], [1800, 60], [3000, 80], [0, 60], [2200, 60], [2800, 100]],
  [[600, 80], [800, 80], [1000, 80], [1200, 80], [1000, 80], [800, 80],
   [600, 80], [800, 80], [1000, 80], [1200, 80], [1000, 80], [800, 80]],
];

class StopSignal extends Error {}

class Simulator {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;  // {eyes, oled, leds, onHighlight, onState}
    this.world = document.createElement('canvas');
    this.world.width = ARENA_W;
    this.world.height = ARENA_H;
    this.showTrack = true;
    this.showBox = true;
    this.trail = [];
    this.keys = new Map();  // key -> release time
    this.audio = null;
    this.running = false;
    this.home = {x: 40, y: ARENA_H / 2, heading: 0};
    this.reset();
    this.drawWorld();
    this.enableDragging();
    this.virtual = null;  // virtual clock in ms when testing, see runVirtual()
    this.lastPhysics = this.now();
    requestAnimationFrame(() => this.frame());
  }

  setHome(pose) {
    this.home = {...pose};
    this.reset();
  }

  // Drag the car to move it, mouse wheel or double click to rotate it.
  enableDragging() {
    const cv = this.canvas;
    const toArena = e => {
      const r = cv.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width * ARENA_W, (e.clientY - r.top) / r.height * ARENA_H];
    };
    const onCar = e => {
      const [x, y] = toArena(e);
      return !this.running && Math.hypot(x - this.x, y - this.y) < CAR_LEN * 0.7;
    };
    let dragging = null;
    cv.addEventListener('pointerdown', e => {
      if (!onCar(e))
        return;
      const [x, y] = toArena(e);
      dragging = [x - this.x, y - this.y];
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', e => {
      cv.style.cursor = dragging ? 'grabbing' : onCar(e) ? 'grab' : 'default';
      if (!dragging)
        return;
      const [x, y] = toArena(e);
      this.home.x = Math.max(0, Math.min(ARENA_W, x - dragging[0]));
      this.home.y = Math.max(0, Math.min(ARENA_H, y - dragging[1]));
      this.reset();
    });
    cv.addEventListener('pointerup', () => { dragging = null; });
    const rotate = deg => {
      this.home.heading = (this.home.heading + deg + 360) % 360;
      this.reset();
    };
    cv.addEventListener('wheel', e => {
      if (!onCar(e))
        return;
      e.preventDefault();
      rotate(e.deltaY > 0 ? 15 : -15);
    }, {passive: false});
    cv.addEventListener('dblclick', e => {
      if (onCar(e))
        rotate(45);
    });
  }

  reset() {
    this.x = this.home.x;
    this.y = this.home.y;
    this.heading = this.home.heading;  // degrees, 0 = towards +x, clockwise positive
    this.wheels = [0, 0, 0, 0];
    this.headAngle = 0;
    this.trail = [[this.x, this.y]];
    this.leds = Array(7).fill([0, 0, 0]);
    this.brightness = 50;
    this.face = null;
    this.oled = ['', '', '', ''];
    this.ui.eyes(null);
    this.ui.oled(this.oled);
    this.ui.leds(this.leds, this.brightness);
    this.draw();
  }

  drawWorld() {
    const w = this.world.getContext('2d', {willReadFrequently: true});
    w.fillStyle = '#fff';
    w.fillRect(0, 0, ARENA_W, ARENA_H);
    if (this.showTrack) {
      w.strokeStyle = '#000';
      w.lineWidth = 3;
      w.beginPath();
      w.ellipse(ARENA_W / 2, ARENA_H / 2, 80, 50, 0, 0, 2 * Math.PI);
      w.stroke();
    }
    if (this.showBox) {
      w.fillStyle = '#c0392b';
      w.fillRect(105, 65, 30, 30);  // inside the oval, off the track
    }
    this.worldPixels = w.getImageData(0, 0, ARENA_W, ARENA_H).data;
  }

  pixel(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= ARENA_W || y >= ARENA_H)
      return null;
    const i = 4 * (y * ARENA_W + x);
    return [this.worldPixels[i], this.worldPixels[i + 1], this.worldPixels[i + 2]];
  }

  isObstacle(x, y) {
    const p = this.pixel(x, y);
    return !p || (p[0] > 150 && p[1] < 100);
  }

  toCar(dx, dy) {
    // (dx forward, dy to the right) in car coordinates -> world coordinates
    const a = this.heading * Math.PI / 180;
    return [this.x + dx * Math.cos(a) - dy * Math.sin(a), this.y + dx * Math.sin(a) + dy * Math.cos(a)];
  }

  // Sensors

  distance() {
    this.advance();
    const a = (this.heading + this.headAngle) * Math.PI / 180;
    const [sx, sy] = this.toCar(CAR_LEN / 2, 0);
    for (let d = 0; d < 200; d += 0.5)
      if (this.isObstacle(sx + d * Math.cos(a), sy + d * Math.sin(a)))
        return Math.round(d * 10) / 10;
    return 200;
  }

  line(which) {
    this.advance();
    const [x, y] = this.toCar(CAR_LEN / 2 - 2, (which - 1) * 2);  // sensors 2 cm apart
    const p = this.pixel(x, y);
    return p && p[0] < 80 && p[1] < 80 && p[2] < 80 ? 1 : 0;
  }

  // The simulated lamp sits in the top-left corner.
  lightDirection() {
    this.advance();
    const bearing = Math.atan2(0 - this.y, 0 - this.x) * 180 / Math.PI - this.heading;
    const rel = ((bearing + 540) % 360) - 180;  // -180..180, negative = to the left
    return Math.max(-100, Math.min(100, Math.round(rel)));
  }

  keyHeld(k) {
    return (this.keys.get(k) || 0) > this.now();
  }

  pressKey(k) {
    this.keys.set(k, this.now() + 250);
    if (k === 10 && this.running)
      this.stop();
  }

  // Physics

  // Moves the car up to the present time, in small steps, whatever the frame rate:
  // a background tab only gets an animation frame now and then.
  now() {
    return this.virtual === null ? performance.now() : this.virtual;
  }

  advance() {
    const now = this.now();
    let dt = Math.min(5000, now - this.lastPhysics);
    this.lastPhysics = now;
    const s = this.settings;
    if (!s || !this.wheels.some(w => w !== 0))
      return;
    const [m1, m2, m3, m4] = this.wheels;
    const fwd = (m1 + m2 + m3 + m4) / 4 / s.moveSpeed * s.cmps / 1000;  // cm/ms
    const rot = (m1 + m2 - m3 - m4) / 4 / s.turnSpeed * 90 / s.ms90;    // deg/ms
    const left = s.mecanum ? (-m1 + m2 - m3 + m4) / 4 / s.moveSpeed * s.cmps / 1000 : 0;
    while (dt > 0) {
      const step = Math.min(dt, 5);
      dt -= step;
      this.heading += rot * step;
      const a = this.heading * Math.PI / 180;
      const nx = this.x + (fwd * Math.cos(a) + left * Math.sin(a)) * step;
      const ny = this.y + (fwd * Math.sin(a) - left * Math.cos(a)) * step;
      const [fx, fy] = [nx + Math.cos(a) * CAR_LEN / 2 * Math.sign(fwd), ny + Math.sin(a) * CAR_LEN / 2 * Math.sign(fwd)];
      if (!this.isObstacle(fx, fy) && !this.isObstacle(nx, ny)) {
        this.x = nx;
        this.y = ny;
      }
      const last = this.trail[this.trail.length - 1];
      if (Math.hypot(last[0] - this.x, last[1] - this.y) > 1)
        this.trail.push([this.x, this.y]);
    }
  }

  setWheels(w) {
    this.advance();
    this.wheels = w;
  }

  frame() {
    this.advance();
    this.draw();
    requestAnimationFrame(() => this.frame());
  }

  draw() {
    const c = this.ctx;
    const scale = this.canvas.width / ARENA_W;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = true;
    c.drawImage(this.world, 0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(scale, 0, 0, scale, 0, 0);

    // Lamp
    c.fillStyle = '#ffd43b';
    c.beginPath();
    c.arc(0, 0, 10, 0, Math.PI / 2);
    c.lineTo(0, 0);
    c.fill();

    // Trail
    c.strokeStyle = 'rgba(76,151,255,0.6)';
    c.lineWidth = 0.8;
    c.beginPath();
    this.trail.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.stroke();

    // Distance ray
    if (this.running) {
      const d = this.distance();
      const [sx, sy] = this.toCar(CAR_LEN / 2, 0);
      const a = (this.heading + this.headAngle) * Math.PI / 180;
      c.strokeStyle = 'rgba(92,177,214,0.5)';
      c.setLineDash([2, 2]);
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(sx + d * Math.cos(a), sy + d * Math.sin(a));
      c.stroke();
      c.setLineDash([]);
    }

    // Car body
    c.save();
    c.translate(this.x, this.y);
    c.rotate(this.heading * Math.PI / 180);
    c.fillStyle = '#222';
    for (const [wx, wy] of [[-7, -10], [7, -10], [-7, 10], [7, 10]])
      c.fillRect(wx - 3.5, wy - 2, 7, 4);
    c.fillStyle = '#2b6cd4';
    c.beginPath();
    c.roundRect(-CAR_LEN / 2, -CAR_WID / 2 + 1, CAR_LEN, CAR_WID - 2, 3);
    c.fill();
    // LEDs on the back
    this.leds.forEach((col, i) => {
      const k = this.brightness / 100;
      const lit = col.some(v => v);
      c.fillStyle = lit ? `rgb(${col.map(v => Math.round(80 + v * 0.7 * k + 50)).join(',')})` : '#123';
      c.beginPath();
      c.arc(-CAR_LEN / 2 + 3, -6 + i * 2, 0.9, 0, 2 * Math.PI);
      c.fill();
    });
    // Head with the ultrasonic eyes
    c.save();
    c.translate(CAR_LEN / 2 - 4, 0);
    c.rotate(this.headAngle * Math.PI / 180);
    c.fillStyle = '#ddd';
    c.fillRect(-2, -5, 5, 10);
    c.fillStyle = '#888';
    c.beginPath();
    c.arc(3, -2.5, 1.6, 0, 2 * Math.PI);
    c.arc(3, 2.5, 1.6, 0, 2 * Math.PI);
    c.fill();
    c.restore();
    c.restore();
  }

  // Interpreter

  async run(image, settings) {
    if (this.running)
      return;
    this.settings = settings;
    this.running = true;
    this.keys.clear();
    this.stopFlag = false;
    this.ui.onState(true);
    const bytes = image.bytes;
    const H = 16;
    const len = bytes[4] | bytes[5] << 8;
    const code = bytes.subarray(H, H + len);
    const marks = new Map(image.sourceMap);
    const stack = [];
    const vars = new Float32Array(32);
    const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
    let pc = 0;
    let driveSpeed = 60;
    let lastDrive = 0;
    let timer0 = this.now();
    let steps = 0;
    const pop = () => stack.length ? stack.pop() : 0;
    const push = v => stack.length < 16 && stack.push(Math.fround(v));
    const fetch = () => code[pc++];
    const fetchWord = () => { const v = code[pc] | code[pc + 1] << 8; pc += 2; return v; };

    this.oled = ['', '', '', ''];
    this.ui.oled(this.oled);
    this.ui.eyes(null);
    this.leds = Array(7).fill([0, 0, 0]);
    this.brightness = 50;
    this.ui.leds(this.leds, this.brightness);

    try {
      while (pc < len) {
        if (this.stopFlag)
          throw new StopSignal();
        if (marks.has(pc))
          this.ui.onHighlight(marks.get(pc));
        if (this.virtual !== null) {
          this.virtual += 0.05;  // an instruction takes some time on the Arduino too
          this.advance();
          if (this.virtual >= this.virtualEnd)
            throw new StopSignal();
        } else if (++steps % 200 === 0)
          await this.sleep(1);
        const op = fetch();
        let a, b;
        switch (op) {
        case OP.END: case OP.HALT: pc = len; break;
        case OP.PUSHB: push((fetch() << 24) >> 24); break;
        case OP.PUSHW: push((fetchWord() << 16) >> 16); break;
        case OP.PUSHF: push(view.getFloat32(pc, true)); pc += 4; break;
        case OP.LOAD: push(vars[fetch() % 32]); break;
        case OP.STORE: vars[fetch() % 32] = pop(); break;
        case OP.ADD: b = pop(); a = pop(); push(a + b); break;
        case OP.SUB: b = pop(); a = pop(); push(a - b); break;
        case OP.MUL: b = pop(); a = pop(); push(a * b); break;
        case OP.DIV: b = pop(); a = pop(); push(b === 0 ? 0 : a / b); break;
        case OP.MOD: {
          b = pop(); a = pop();
          if (b === 0) { push(0); break; }
          let r = a % b;
          if (r !== 0 && (r < 0) !== (b < 0)) r += b;
          push(r);
          break;
        }
        case OP.NEG: push(-pop()); break;
        case OP.ABS: push(Math.abs(pop())); break;
        case OP.ROUND: push(Math.sign(a = pop()) * Math.round(Math.abs(a))); break;
        case OP.RANDOM: {
          b = pop(); a = pop();
          if (a > b) [a, b] = [b, a];
          if (Number.isInteger(a) && Number.isInteger(b))
            push(a + Math.floor(Math.random() * (b - a + 1)));
          else
            push(a + (b - a) * Math.floor(Math.random() * 10001) / 10000);
          break;
        }
        case OP.LT: b = pop(); a = pop(); push(a < b ? 1 : 0); break;
        case OP.LE: b = pop(); a = pop(); push(a <= b ? 1 : 0); break;
        case OP.GT: b = pop(); a = pop(); push(a > b ? 1 : 0); break;
        case OP.GE: b = pop(); a = pop(); push(a >= b ? 1 : 0); break;
        case OP.EQ: b = pop(); a = pop(); push(Math.abs(a - b) < 1e-6 ? 1 : 0); break;
        case OP.NE: b = pop(); a = pop(); push(Math.abs(a - b) >= 1e-6 ? 1 : 0); break;
        case OP.AND: b = pop(); a = pop(); push(a && b ? 1 : 0); break;
        case OP.OR: b = pop(); a = pop(); push(a || b ? 1 : 0); break;
        case OP.NOT: push(pop() === 0 ? 1 : 0); break;
        case OP.JMP: pc = fetchWord(); break;
        case OP.JZ: { const t = fetchWord(); if (pop() === 0) pc = t; break; }
        case OP.JNZ: { const t = fetchWord(); if (pop() !== 0) pc = t; break; }
        case OP.WAIT: a = pop(); if (a > 0) await this.sleep(a * 1000); break;

        case OP.MOVE: {
          a = pop();
          const sp = a >= 0 ? settings.moveSpeed : -settings.moveSpeed;
          await this.timed([sp, sp, sp, sp], Math.abs(a) * 1000 / settings.cmps);
          break;
        }
        case OP.STRAFE: {
          a = pop();
          const sp = a >= 0 ? -settings.moveSpeed : settings.moveSpeed;
          await this.timed([-sp, sp, -sp, sp], Math.abs(a) * 1000 / settings.cmps);
          break;
        }
        case OP.TURN: {
          a = pop();
          const sp = a >= 0 ? settings.turnSpeed : -settings.turnSpeed;
          await this.timed([sp, sp, -sp, -sp], Math.abs(a) * settings.ms90 / 90);
          break;
        }
        case OP.DRIVE: lastDrive = fetch(); this.drive(lastDrive, driveSpeed); break;
        case OP.SPEED:
          driveSpeed = Math.max(0, Math.min(100, Math.trunc(pop())));
          if (lastDrive) this.drive(lastDrive, driveSpeed);
          break;
        case OP.MOTORS:
          b = pop(); a = pop();
          lastDrive = 0;
          this.setWheels([a, a, b, b].map(v => Math.max(-100, Math.min(100, Math.trunc(v)))));
          break;

        case OP.BEEP: await this.note(1000, 150); break;
        case OP.TONE: b = pop(); a = pop(); if (b > 0) await this.note(a, b * 1000); break;
        case OP.TUNE: {
          for (const [f, ms] of TUNES[fetch()] || [])
            await this.note(f, ms);
          break;
        }

        case OP.LEDS: { const col = [fetch(), fetch(), fetch()]; this.leds = Array(7).fill(col); this.ui.leds(this.leds, this.brightness); break; }
        case OP.LED: {
          const col = [fetch(), fetch(), fetch()];
          const i = Math.trunc(pop()) - 1;
          if (i >= 0 && i < 7) { this.leds = this.leds.slice(); this.leds[i] = col; this.ui.leds(this.leds, this.brightness); }
          break;
        }
        case OP.BRIGHT: this.brightness = Math.max(0, Math.min(100, pop())); this.ui.leds(this.leds, this.brightness); break;
        case OP.HEAD: this.headAngle = Math.max(-90, Math.min(90, pop())); await this.sleep(150); break;

        case OP.CLS: this.oled = ['', '', '', '']; this.ui.oled(this.oled); break;
        case OP.TEXT: case OP.TEXTNUM: {
          const line = fetch() & 3;
          const n = fetch();
          let s = '';
          for (let i = 0; i < n; i++) s += String.fromCharCode(fetch());
          s = s.slice(0, 10);
          if (op === OP.TEXTNUM) {
            if (s.length && s.length < 10) s += ' ';
            s = (s + formatNumber(pop())).slice(0, 10);
          }
          this.oled[line] = s;
          this.ui.oled(this.oled);
          break;
        }
        case OP.NUM: { const line = fetch() & 3; this.oled[line] = formatNumber(pop()).slice(0, 10); this.ui.oled(this.oled); break; }
        case OP.FACE: this.ui.eyes(FACE_NAMES[fetch()] || null); break;
        case OP.FACE_OFF: this.ui.eyes(null); break;

        case OP.DIST: push(this.distance()); await this.sleep(2); break;
        case OP.LINE: push(this.line(fetch())); break;
        case OP.LIGHT: push(this.lightDirection()); break;
        case OP.KEY: push(this.keyHeld(fetch()) ? 1 : 0); break;
        case OP.BATTERY: push(87); break;
        case OP.TIMER: push((this.now() - timer0) / 1000); break;
        case OP.TIMER_RESET: timer0 = this.now(); break;
        default:
          throw new Error('instruction inconnue ' + op);
        }
      }
    } catch (err) {
      if (!(err instanceof StopSignal))
        console.error(err);
    } finally {
      this.setWheels([0, 0, 0, 0]);
      this.stopSound();
      this.running = false;
      this.ui.onHighlight(null);
      this.ui.onState(false);
    }
  }

  stop() {
    this.stopFlag = true;
  }

  // Runs a program on a virtual clock, as fast as possible, for automatic tests.
  // onTick(seconds) is called every simulated second.
  async runVirtual(image, settings, seconds, onTick = () => {}) {
    this.virtual = 0;
    this.lastPhysics = 0;
    this.virtualEnd = seconds * 1000;
    let nextTick = 1000;
    const origAdvance = this.advance.bind(this);
    this.advance = () => {
      origAdvance();
      while (this.virtual >= nextTick) {
        onTick(nextTick / 1000);
        nextTick += 1000;
      }
    };
    try {
      await this.run(image, settings);
    } finally {
      delete this.advance;
      this.virtual = null;
      this.lastPhysics = this.now();
    }
  }

  sleep(ms) {
    if (this.virtual !== null) {
      for (let left = ms; left > 0; left -= 5) {
        this.virtual += Math.min(5, left);
        this.advance();
      }
      if (this.virtual >= this.virtualEnd)
        this.stopFlag = true;
      return this.stopFlag ? Promise.reject(new StopSignal()) : Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      const tick = () => {
        if (this.stopFlag)
          return reject(new StopSignal());
        if (performance.now() - t0 >= ms)
          return resolve();
        setTimeout(tick, Math.min(20, ms));
      };
      tick();
    });
  }

  drive(mode, s) {
    const W = {
      1: [s, s, s, s], 2: [-s, -s, -s, -s], 3: [-s, -s, s, s], 4: [s, s, -s, -s],
      5: [-s, s, -s, s], 6: [s, -s, s, -s],
      7: [s / 3, s / 3, s, s].map(Math.trunc), 8: [s, s, s / 3, s / 3].map(Math.trunc),
    };
    this.setWheels(W[mode] || [0, 0, 0, 0]);
  }

  async timed(wheels, ms) {
    this.setWheels(wheels);
    try {
      await this.sleep(ms);
    } finally {
      this.setWheels([0, 0, 0, 0]);
    }
    await this.sleep(120);
  }

  async note(freq, ms) {
    if (freq >= 31) {
      try {
        this.audio = this.audio || new AudioContext();
        const osc = this.audio.createOscillator();
        const gain = this.audio.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.value = 0.05;
        osc.connect(gain).connect(this.audio.destination);
        osc.start();
        this.osc = osc;
      } catch (e) {
        this.osc = null;
      }
    }
    try {
      await this.sleep(ms);
    } finally {
      this.stopSound();
    }
    await this.sleep(20);
  }

  stopSound() {
    if (this.osc) {
      this.osc.stop();
      this.osc = null;
    }
  }
}

function formatNumber(v) {
  if (Math.abs(v - Math.round(v)) < 0.005)
    return String(Math.round(v));
  return v.toFixed(2).replace(/0+$/, '');
}
