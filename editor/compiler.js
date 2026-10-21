// Compiles the block program to the bytecode run by firmware/AdeeptBlocs (see bytecode.h).

const BC = {
  VERSION: 1, HEADER: 16, MAX_SIZE: 1024, MAX_VARS: 32,
  FLAG_INVERT_HEAD: 0x02, FLAG_START_WITH_OK: 0x04,
};

const OP = {
  END: 0x00, PUSHB: 0x01, PUSHW: 0x02, PUSHF: 0x03, LOAD: 0x04, STORE: 0x05,
  ADD: 0x10, SUB: 0x11, MUL: 0x12, DIV: 0x13, MOD: 0x14, NEG: 0x15, ABS: 0x16, ROUND: 0x17, RANDOM: 0x18,
  LT: 0x20, LE: 0x21, GT: 0x22, GE: 0x23, EQ: 0x24, NE: 0x25, AND: 0x26, OR: 0x27, NOT: 0x28,
  JMP: 0x30, JZ: 0x31, JNZ: 0x32, WAIT: 0x33, HALT: 0x34,
  MOVE: 0x40, TURN: 0x41, STRAFE: 0x42, DRIVE: 0x43, SPEED: 0x44, MOTORS: 0x45, WHEEL: 0x46,
  BEEP: 0x50, TONE: 0x51, TUNE: 0x52,
  LEDS: 0x60, LED: 0x61, BRIGHT: 0x62,
  HEAD: 0x68,
  CLS: 0x70, TEXT: 0x71, NUM: 0x72, TEXTNUM: 0x73, FACE: 0x74, FACE_OFF: 0x75,
  DIST: 0x80, LINE: 0x81, LIGHT: 0x82, KEY: 0x83, BATTERY: 0x84, TIMER: 0x85, TIMER_RESET: 0x86,
};

const DRIVE_STOP = 0;

class CompileError extends Error {
  constructor(message, blockId) {
    super(message);
    this.blockId = blockId;
  }
}

// Screen text: ASCII only, no accents.
function screenText(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '?').slice(0, 10);
}

class Emitter {
  constructor() {
    this.code = [];
    this.sourceMap = [];  // [pc, blockId] of each statement
  }

  here() {
    return this.code.length;
  }

  emit(...bytes) {
    for (const b of bytes)
      this.code.push(b & 0xFF);
  }

  word(v) {
    this.emit(v & 0xFF, v >> 8);
  }

  jump(op, target = 0) {
    this.emit(op);
    const at = this.here();
    this.word(target);
    return at;
  }

  patch(at, target) {
    this.code[at] = target & 0xFF;
    this.code[at + 1] = target >> 8;
  }

  push(v) {
    v = Number(v);
    if (!Number.isFinite(v))
      v = 0;
    if (Number.isInteger(v) && v >= -128 && v <= 127) {
      this.emit(OP.PUSHB, v);
    } else if (Number.isInteger(v) && v >= -32768 && v <= 32767) {
      this.emit(OP.PUSHW);
      this.word(v & 0xFFFF);
    } else {
      const buf = new DataView(new ArrayBuffer(4));
      buf.setFloat32(0, v, true);
      this.emit(OP.PUSHF, buf.getUint8(0), buf.getUint8(1), buf.getUint8(2), buf.getUint8(3));
    }
  }
}

class Compiler {
  constructor(ws) {
    this.ws = ws;
    this.e = new Emitter();
    this.vars = new Map();
    for (const v of ws.getVariableMap().getAllVariables())
      this.vars.set(v.getId(), this.vars.size);
    this.nextTemp = this.vars.size;
  }

  temp(block) {
    if (this.nextTemp >= BC.MAX_VARS)
      throw new CompileError('Trop de variables et de boucles « répéter ».', block.id);
    return this.nextTemp++;
  }

  varIndex(block) {
    const id = block.getFieldValue('VAR');
    if (!this.vars.has(id))
      throw new CompileError('Variable inconnue.', block.id);
    const i = this.vars.get(id);
    if (i >= BC.MAX_VARS)
      throw new CompileError('Trop de variables.', block.id);
    return i;
  }

  // Pushes the value plugged into an input, or `fallback` if the input is empty.
  value(block, name, fallback = 0) {
    const target = block.getInputTargetBlock(name);
    if (!target)
      this.e.push(fallback);
    else
      this.expr(target);
  }

  binary(block, op) {
    this.value(block, 'A');
    this.value(block, 'B');
    this.e.emit(op);
  }

  expr(b) {
    const e = this.e;
    switch (b.type) {
    case 'math_number': e.push(b.getFieldValue('NUM')); break;
    case 'variables_get': e.emit(OP.LOAD, this.varIndex(b)); break;
    case 'car_distance': e.emit(OP.DIST); break;
    case 'car_obstacle': e.emit(OP.DIST); this.value(b, 'CM', 20); e.emit(OP.LT); break;
    case 'car_line': e.emit(OP.LINE, Number(b.getFieldValue('WHICH'))); break;
    case 'car_light': e.emit(OP.LIGHT); break;
    case 'car_key': e.emit(OP.KEY, Number(b.getFieldValue('KEY'))); break;
    case 'car_battery': e.emit(OP.BATTERY); break;
    case 'car_timer': e.emit(OP.TIMER); break;
    case 'op_add': this.binary(b, OP.ADD); break;
    case 'op_sub': this.binary(b, OP.SUB); break;
    case 'op_mul': this.binary(b, OP.MUL); break;
    case 'op_div': this.binary(b, OP.DIV); break;
    case 'op_mod': this.binary(b, OP.MOD); break;
    case 'op_random': this.binary(b, OP.RANDOM); break;
    case 'op_gt': this.binary(b, OP.GT); break;
    case 'op_lt': this.binary(b, OP.LT); break;
    case 'op_eq': this.binary(b, OP.EQ); break;
    case 'op_and': this.binary(b, OP.AND); break;
    case 'op_or': this.binary(b, OP.OR); break;
    case 'op_not': this.value(b, 'A'); e.emit(OP.NOT); break;
    case 'op_round': this.value(b, 'A'); e.emit(OP.ROUND); break;
    default:
      throw new CompileError('Ce bloc ne peut pas être utilisé ici.', b.id);
    }
  }

  statements(b) {
    for (; b; b = b.getNextBlock()) {
      if (!b.isEnabled())
        continue;
      this.e.sourceMap.push([this.e.here(), b.id]);
      this.statement(b);
    }
  }

  colour(b) {
    return b.getFieldValue('COLOUR').split(',').map(Number);
  }

  textOp(b, op) {
    const text = screenText(b.getFieldValue('TEXT') || '');
    this.e.emit(op, Number(b.getFieldValue('LINE')), text.length);
    for (const c of text)
      this.e.emit(c.charCodeAt(0));
  }

  statement(b) {
    const e = this.e;
    switch (b.type) {
    case 'car_move': this.value(b, 'CM', 20); e.emit(OP.MOVE); break;
    case 'car_back': this.value(b, 'CM', 20); e.emit(OP.NEG, OP.MOVE); break;
    case 'car_turn':
      this.value(b, 'DEG', 90);
      if (b.getFieldValue('DIR') === 'L')
        e.emit(OP.NEG);
      e.emit(OP.TURN);
      break;
    case 'car_uturn': e.push(180); e.emit(OP.TURN); break;
    case 'car_strafe':
      this.value(b, 'CM', 20);
      if (b.getFieldValue('DIR') === 'L')
        e.emit(OP.NEG);
      e.emit(OP.STRAFE);
      break;
    case 'car_drive':
    case 'car_drive_mecanum':
      e.emit(OP.DRIVE, Number(b.getFieldValue('MODE')));
      break;
    case 'car_stop': e.emit(OP.DRIVE, DRIVE_STOP); break;
    case 'car_speed': e.push(Number(b.getFieldValue('SPEED'))); e.emit(OP.SPEED); break;
    case 'car_motors': this.value(b, 'LEFT'); this.value(b, 'RIGHT'); e.emit(OP.MOTORS); break;

    case 'car_timer_reset': e.emit(OP.TIMER_RESET); break;
    case 'car_head': e.push(Number(b.getFieldValue('DIR'))); e.emit(OP.HEAD); break;
    case 'car_head_angle': this.value(b, 'DEG'); e.emit(OP.HEAD); break;

    case 'car_leds': e.emit(OP.LEDS, ...this.colour(b)); break;
    case 'car_led': this.value(b, 'N', 1); e.emit(OP.LED, ...this.colour(b)); break;
    case 'car_leds_off': e.emit(OP.LEDS, 0, 0, 0); break;
    case 'car_bright': this.value(b, 'PCT', 50); e.emit(OP.BRIGHT); break;

    case 'car_face': e.emit(OP.FACE, Number(b.getFieldValue('FACE'))); break;
    case 'car_face_off': e.emit(OP.FACE_OFF); break;
    case 'car_text': this.textOp(b, OP.TEXT); break;
    case 'car_textnum': this.value(b, 'VALUE'); this.textOp(b, OP.TEXTNUM); break;
    case 'car_cls': e.emit(OP.CLS); break;

    case 'car_beep': e.emit(OP.BEEP); break;
    case 'car_note': e.push(Number(b.getFieldValue('NOTE'))); this.value(b, 'SEC', 0.5); e.emit(OP.TONE); break;
    case 'car_tune': e.emit(OP.TUNE, Number(b.getFieldValue('TUNE'))); break;
    case 'car_tone': this.value(b, 'HZ', 440); this.value(b, 'SEC', 0.5); e.emit(OP.TONE); break;

    case 'car_wait': this.value(b, 'SEC', 1); e.emit(OP.WAIT); break;
    case 'car_repeat': {
      const t = this.temp(b);
      this.value(b, 'TIMES', 0);
      e.emit(OP.STORE, t);
      const top = e.here();
      e.emit(OP.LOAD, t);
      e.push(0.5);
      e.emit(OP.GT);
      const exit = e.jump(OP.JZ);
      this.statements(b.getInputTargetBlock('DO'));
      e.emit(OP.LOAD, t);
      e.push(1);
      e.emit(OP.SUB, OP.STORE, t);
      e.jump(OP.JMP, top);
      e.patch(exit, e.here());
      break;
    }
    case 'car_forever': {
      const top = e.here();
      this.statements(b.getInputTargetBlock('DO'));
      e.jump(OP.JMP, top);
      break;
    }
    case 'car_if': {
      this.value(b, 'COND');
      const skip = e.jump(OP.JZ);
      this.statements(b.getInputTargetBlock('DO'));
      e.patch(skip, e.here());
      break;
    }
    case 'car_ifelse': {
      this.value(b, 'COND');
      const toElse = e.jump(OP.JZ);
      this.statements(b.getInputTargetBlock('DO'));
      const toEnd = e.jump(OP.JMP);
      e.patch(toElse, e.here());
      this.statements(b.getInputTargetBlock('ELSE'));
      e.patch(toEnd, e.here());
      break;
    }
    case 'car_wait_until': {
      const top = e.here();
      this.value(b, 'COND');
      e.jump(OP.JZ, top);
      break;
    }
    case 'car_repeat_until': {
      const top = e.here();
      this.value(b, 'COND');
      const exit = e.jump(OP.JNZ);
      this.statements(b.getInputTargetBlock('DO'));
      e.jump(OP.JMP, top);
      e.patch(exit, e.here());
      break;
    }
    case 'car_halt': e.emit(OP.HALT); break;

    case 'variables_set':
      this.value(b, 'VALUE');
      e.emit(OP.STORE, this.varIndex(b));
      break;
    case 'math_change': {
      const i = this.varIndex(b);
      e.emit(OP.LOAD, i);
      this.value(b, 'DELTA', 1);
      e.emit(OP.ADD, OP.STORE, i);
      break;
    }
    default:
      throw new CompileError('Ce bloc ne peut pas être utilisé ici.', b.id);
    }
  }
}

// settings: see DEFAULT_SETTINGS in app.js.
// Returns {bytes, sourceMap, size}; throws CompileError.
function compileProgram(ws, settings) {
  const starts = ws.getTopBlocks(false).filter(b => b.type === 'car_start' && b.isEnabled());
  if (starts.length === 0)
    throw new CompileError('Il manque le bloc « quand le programme démarre » (catégorie Contrôle).');
  if (starts.length > 1)
    throw new CompileError('Il ne faut qu\'un seul bloc « quand le programme démarre ».', starts[1].id);

  const c = new Compiler(ws);
  c.statements(starts[0].getNextBlock());
  c.e.emit(OP.END);
  return buildImage(c.e.code, c.nextTemp, settings, c.e.sourceMap);
}

function buildImage(code, nvars, settings, sourceMap = []) {
  const size = BC.HEADER + code.length;
  if (size > BC.MAX_SIZE)
    throw new CompileError(`Le programme est trop long pour la voiture (${size} octets sur ${BC.MAX_SIZE}).`);
  let flags = 0;
  if (settings.invertHead) flags |= BC.FLAG_INVERT_HEAD;
  if (settings.startWithOk) flags |= BC.FLAG_START_WITH_OK;
  const wheelInvert = settings.invertWheels.reduce((m, inv, i) => inv ? m | 1 << i : m, 0);
  const sum = code.reduce((a, b) => (a + b) & 0xFF, 0);
  const ms90 = Math.round(settings.ms90);
  const cmps10 = Math.max(1, Math.round(settings.cmps * 10));
  const header = [
    0x41, 0x42, BC.VERSION, flags,
    code.length & 0xFF, code.length >> 8,
    ms90 & 0xFF, ms90 >> 8,
    cmps10 & 0xFF, cmps10 >> 8,
    settings.moveSpeed, settings.turnSpeed, nvars, sum, wheelInvert, 0,
  ];
  return {bytes: Uint8Array.from([...header, ...code]), sourceMap, size};
}

// Tiny programs used by the calibration buttons.
function calibrationProgram(kind, settings) {
  const e = new Emitter();
  if (kind === 'turn') {
    e.push(360);
    e.emit(OP.TURN);
  } else if (kind === 'wheels') {
    // Each motor alone, forwards, with its name and place (as in Adeept's assembly guide) on the screen.
    const places = ['arr gauche', 'av gauche', 'av droite', 'arr droite'];
    for (let i = 0; i < 4; i++) {
      for (const [line, text] of [[0, `Roue M${i + 1}`], [1, places[i]]]) {
        e.emit(OP.TEXT, line, text.length);
        for (const c of text)
          e.emit(c.charCodeAt(0));
      }
      e.push(60);
      e.emit(OP.WHEEL, i);
      e.push(1.5);
      e.emit(OP.WAIT);
      e.push(0);
      e.emit(OP.WHEEL, i);
      e.push(0.5);
      e.emit(OP.WAIT);
    }
  } else {
    e.push(50);
    e.emit(OP.MOVE);
  }
  e.emit(OP.END);
  return buildImage(e.code, 0, settings);
}
