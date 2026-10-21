// AdeeptBlocs: firmware for the Adeept 4WD Smart Car Kit for Arduino (ADA038).
//
// It is flashed once. Afterwards, block programs built in the web editor
// (editor/index.html) are sent over USB, stored in EEPROM and run by the small
// bytecode interpreter below, even after the USB cable is unplugged.
//
// Pin map and I2C addresses come from Adeept's Adeept_Car_For_Arduino.cpp.
// Only the Adafruit NeoPixel library is needed: the PCA9685 motor driver, the
// SSD1306 screen, the VK16K33 LED matrix and the NEC infrared receiver are
// driven directly.

#include <Wire.h>
#include <EEPROM.h>
#include <Servo.h>
#include <Adafruit_NeoPixel.h>
#include "font5x7.h"
#include "faces.h"
#include "bytecode.h"

#define FW_VERSION 1

#define PIN_IR      2
#define PIN_BUZZER  3
#define PIN_LINE_L  4
#define PIN_LINE_M  5
#define PIN_LINE_R  6
#define PIN_TRIG    7
#define PIN_ECHO    8
#define PIN_LIGHT   A0
#define PIN_HEAD    A1
#define PIN_RGB     A3  // WS2812 data line, shared with the battery divider
#define NUM_RGB     7

#define PCA_ADDR    0x5F
#define OLED_ADDR   0x3C
#define MATRIX_ADDR 0x70

#define MAX_STACK   16
#define MAX_VARS    32
#define RAM_PROG    192

Adafruit_NeoPixel pixels(NUM_RGB, PIN_RGB, NEO_GRB + NEO_KHZ800);
Servo head;

// PCA9685 motor driver

static void pcaWrite(uint8_t reg, uint8_t val)
{
  Wire.beginTransmission(PCA_ADDR);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

static void pcaBegin()
{
  pcaWrite(0x00, 0x10);  // MODE1: sleep, needed to change the prescaler
  pcaWrite(0xFE, 5);     // 25 MHz / (4096 * 1 kHz) - 1
  pcaWrite(0x00, 0x20);  // wake up, register auto-increment
  delay(1);
  pcaWrite(0x00, 0xA0);  // restart PWM channels
}

static void pcaSet(uint8_t ch, uint16_t v)
{
  Wire.beginTransmission(PCA_ADDR);
  Wire.write(0x06 + 4 * ch);
  if (v >= 4095) {
    Wire.write(0); Wire.write(0x10); Wire.write(0); Wire.write(0);  // full on
  } else if (v == 0) {
    Wire.write(0); Wire.write(0); Wire.write(0); Wire.write(0x10);  // full off
  } else {
    Wire.write(0); Wire.write(0); Wire.write(v & 0xFF); Wire.write(v >> 8);
  }
  Wire.endTransmission();
}

// M1, M2 are on the left side, M3, M4 on the right side.
static const uint8_t MOTOR_CH[4][2] = {{15, 14}, {12, 13}, {11, 10}, {8, 9}};

static void motor(uint8_t m, int speed)
{
  speed = constrain(speed, -100, 100);
  uint16_t v = (uint32_t)abs(speed) * 4095 / 100;
  pcaSet(MOTOR_CH[m][0], speed > 0 ? v : 0);
  pcaSet(MOTOR_CH[m][1], speed < 0 ? v : 0);
}

// Program header, see bytecode.h

struct Config {
  uint8_t flags;
  uint16_t len;
  uint16_t ms90;
  uint16_t cmps10;
  uint8_t moveSpeed;
  uint8_t turnSpeed;
  uint8_t nvars;
};

static Config cfg;
static bool fromRam;
static uint8_t ramProg[RAM_PROG];

static uint8_t progByte(uint16_t a)
{
  return fromRam ? ramProg[a] : EEPROM.read(a);
}

static uint16_t progWord(uint16_t a)
{
  return progByte(a) | (uint16_t)progByte(a + 1) << 8;
}

static bool loadConfig()
{
  if (progByte(0) != 'A' || progByte(1) != 'B' || progByte(2) != BC_VERSION)
    return false;
  cfg.flags = progByte(3);
  cfg.len = progWord(4);
  cfg.ms90 = progWord(6);
  cfg.cmps10 = progWord(8);
  cfg.moveSpeed = progByte(10);
  cfg.turnSpeed = progByte(11);
  cfg.nvars = progByte(12);
  uint16_t room = fromRam ? RAM_PROG : EEPROM.length();
  if (cfg.len > room - BC_HEADER || cfg.nvars > MAX_VARS)
    return false;
  uint8_t sum = 0;
  for (uint16_t i = 0; i < cfg.len; i++)
    sum += progByte(BC_HEADER + i);
  return sum == progByte(13);
}

static void wheels(int m1, int m2, int m3, int m4)
{
  if (cfg.flags & FLAG_INVERT_MOTORS) {
    m1 = -m1; m2 = -m2; m3 = -m3; m4 = -m4;
  }
  motor(0, m1);
  motor(1, m2);
  motor(2, m3);
  motor(3, m4);
}

static void sides(int left, int right)
{
  wheels(left, left, right, right);
}

static void stopMotors()
{
  wheels(0, 0, 0, 0);
}

// NEC infrared receiver on INT0, decoded from edge timings

static const uint8_t IR_CODES[17] PROGMEM = {
  0x19, 0x45, 0x46, 0x47, 0x44, 0x40, 0x43, 0x07, 0x15, 0x09,  // 0..9
  0x16, 0x0D,                                                  // * #
  0x18, 0x52, 0x08, 0x5A, 0x1C                                 // up down left right ok
};
#define KEY_STAR 10
#define KEY_OK   16

static volatile uint32_t irLastEdge, irBits, irValue;
static volatile uint8_t irState, irCount;
static volatile bool irNew, irRepeat;
static int8_t lastKey = -1;
static uint32_t lastKeyMs;

static void irIsr()
{
  uint32_t now = micros();
  uint32_t d = now - irLastEdge;
  irLastEdge = now;
  if (digitalRead(PIN_IR)) {
    // Rising edge: a mark (output low) of length d just ended.
    if (d > 8000 && d < 10000)
      irState = 1;
    return;
  }
  // Falling edge: a space of length d just ended.
  if (irState == 1) {
    if (d > 4000 && d < 5000) {
      irState = 2;
      irCount = 0;
      irBits = 0;
    } else {
      if (d > 1900 && d < 2700)
        irRepeat = true;
      irState = 0;
    }
  } else if (irState == 2) {
    if (d > 300 && d < 850)
      irBits >>= 1;
    else if (d > 1300 && d < 2000)
      irBits = (irBits >> 1) | 0x80000000UL;
    else {
      irState = 0;
      return;
    }
    if (++irCount == 32) {
      irValue = irBits;
      irNew = true;
      irState = 0;
    }
  }
}

// Returns true when a new key press (not a repeat) arrived.
static bool irService()
{
  bool fresh = false;
  noInterrupts();
  bool gotNew = irNew, gotRepeat = irRepeat;
  uint32_t v = irValue;
  irNew = irRepeat = false;
  interrupts();
  if (gotNew) {
    uint8_t cmd = v >> 16, inv = v >> 24;
    if ((uint8_t)(cmd ^ inv) == 0xFF) {
      lastKey = -1;
      for (uint8_t k = 0; k < 17; k++)
        if (pgm_read_byte(&IR_CODES[k]) == cmd)
          lastKey = k;
      lastKeyMs = millis();
      fresh = lastKey >= 0;
    }
  } else if (gotRepeat && lastKey >= 0) {
    lastKeyMs = millis();
  }
  return fresh;
}

static bool keyHeld(int8_t k)
{
  return lastKey == k && millis() - lastKeyMs < 200;
}

// SSD1306 OLED, text only, double size font: 4 lines of 10 characters

static void oledCmd(uint8_t c)
{
  Wire.beginTransmission(OLED_ADDR);
  Wire.write(0x00);
  Wire.write(c);
  Wire.endTransmission();
}

static void oledWindow(uint8_t c0, uint8_t c1, uint8_t p0, uint8_t p1)
{
  oledCmd(0x21); oledCmd(c0); oledCmd(c1);
  oledCmd(0x22); oledCmd(p0); oledCmd(p1);
}

static void oledData(const uint8_t *d, uint8_t n)
{
  Wire.beginTransmission(OLED_ADDR);
  Wire.write(0x40);
  Wire.write(d, n);
  Wire.endTransmission();
}

static void oledClear()
{
  uint8_t z[16] = {0};
  oledWindow(0, 127, 0, 7);
  for (uint8_t i = 0; i < 64; i++)
    oledData(z, 16);
}

static void oledBegin()
{
  static const uint8_t init[] PROGMEM = {
    0xAE, 0xD5, 0x80, 0xA8, 0x3F, 0xD3, 0x00, 0x40, 0x8D, 0x14, 0x20, 0x00,
    0xA1, 0xC8, 0xDA, 0x12, 0x81, 0xCF, 0xD9, 0xF1, 0xDB, 0x40, 0xA4, 0xA6, 0xAF
  };
  for (uint8_t i = 0; i < sizeof(init); i++)
    oledCmd(pgm_read_byte(&init[i]));
  oledClear();
}

// line: 0..3. The text is padded with spaces so the old content disappears.
static void oledLine(uint8_t line, const char *s)
{
  line &= 3;
  oledWindow(4, 123, 2 * line, 2 * line + 1);
  for (uint8_t half = 0; half < 2; half++) {
    bool ended = false;
    for (uint8_t i = 0; i < 10; i++) {
      char c = ended ? 0 : s[i];
      if (!c) {
        ended = true;
        c = ' ';
      }
      if (c < 32 || c > 126)
        c = '?';
      uint8_t buf[12];
      for (uint8_t col = 0; col < 5; col++) {
        uint8_t bits = pgm_read_byte(&FONT5X7[(c - 32) * 5 + col]);
        uint16_t wide = 0;
        for (uint8_t b = 0; b < 8; b++)
          if (bits & (1 << b))
            wide |= 3 << (2 * b);
        uint8_t v = half ? wide >> 8 : wide & 0xFF;
        buf[2 * col] = buf[2 * col + 1] = v;
      }
      buf[10] = buf[11] = 0;
      oledData(buf, 12);
    }
  }
}

static void formatNumber(float v, char *out)
{
  if (fabs(v - round(v)) < 0.005) {
    ltoa(lround(v), out, 10);
    return;
  }
  dtostrf(v, 0, 2, out);
  char *e = out + strlen(out) - 1;
  while (*e == '0')
    *e-- = 0;
}

// VK16K33 8x16 LED matrix (two 8x8 eyes), same layout as Adeept's VK16K33 library

static void matrixCmd(uint8_t c)
{
  Wire.beginTransmission(MATRIX_ADDR);
  Wire.write(c);
  Wire.endTransmission();
}

static void matrixShow(const uint8_t *rows, bool progmem)
{
  uint16_t buf[8] = {0};
  for (uint8_t r = 0; r < 16; r++) {
    uint8_t v = progmem ? pgm_read_byte(&rows[r]) : rows[r];
    for (uint8_t col = 0; col < 8; col++)
      if (v & (1 << col))
        buf[7 - col] |= 1 << r;
  }
  Wire.beginTransmission(MATRIX_ADDR);
  Wire.write(0x00);
  for (uint8_t i = 0; i < 8; i++) {
    Wire.write(buf[i] & 0xFF);
    Wire.write(buf[i] >> 8);
  }
  Wire.endTransmission();
}

static void matrixBegin()
{
  matrixCmd(0x21);  // oscillator on
  matrixCmd(0x81);  // display on, no blink
  matrixCmd(0xEF);  // full brightness
}

static void showFace(uint8_t f)
{
  if (f < NUM_FACES)
    matrixShow(FACES[f], true);
}

static void clearFace()
{
  uint8_t z[16] = {0};
  matrixShow(z, false);
}

// Sensors

static float distanceCm()
{
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  uint32_t t = pulseIn(PIN_ECHO, HIGH, 12000);  // 12 ms: about 2 m
  if (t == 0)
    return 200;
  return t * 0.017;
}

// 1 when the sensor sees the black line.
static int lineSensor(uint8_t which)
{
  static const uint8_t pins[3] = {PIN_LINE_L, PIN_LINE_M, PIN_LINE_R};
  return digitalRead(pins[which % 3]);
}

// The light module compares two photoresistors: -100 = light on the left, +100 = on the right.
static int lightDirection()
{
  long v = analogRead(PIN_LIGHT);
  return constrain((v - 512) * 100 / 400, -100, 100);
}

static int batteryPercent()
{
  pinMode(PIN_RGB, INPUT);
  long adc = 0;
  for (uint8_t i = 0; i < 5; i++)
    adc += analogRead(PIN_RGB);
  pinMode(PIN_RGB, OUTPUT);
  float volts = adc / 5 / 1024.0 * 5 * 5.5;
  return constrain((int)((volts - 6) / (8.4 - 6) * 100), 0, 100);
}

static void setHead(int angle)
{
  if (!head.attached())
    head.attach(PIN_HEAD);
  if (cfg.flags & FLAG_INVERT_HEAD)
    angle = -angle;
  head.write(constrain(90 - angle, 0, 180));
}

static void ledsAll(uint8_t r, uint8_t g, uint8_t b)
{
  for (uint8_t i = 0; i < NUM_RGB; i++)
    pixels.setPixelColor(i, r, g, b);
  pixels.show();
}

// Interruptible waiting: '*' on the remote or 'S' on USB stops the program.

static bool stopRequested;
static void reportSensors();

static bool poll()
{
  if (irService() && lastKey == KEY_STAR)
    stopRequested = true;
  while (Serial.available()) {
    int c = Serial.peek();
    if (c == 'S') {
      Serial.read();
      stopRequested = true;
    } else if (c == 'D') {
      // Reading the sensors does not disturb the running program.
      Serial.read();
      reportSensors();
    } else if (c == '?' || c == 'P' || c == 'X' || c == 'R') {
      // The editor talks to us: stop and leave the command for the idle loop.
      stopRequested = true;
      break;
    } else {
      Serial.read();
    }
  }
  return stopRequested;
}

static bool sleepMs(uint32_t ms)
{
  uint32_t t0 = millis();
  while (millis() - t0 < ms)
    if (poll())
      return false;
  return true;
}

// Sound

struct Note {
  uint16_t freq;
  uint16_t ms;
};

static const Note TUNE_WIN[] PROGMEM = {{523, 120}, {659, 120}, {784, 120}, {1047, 400}};
static const Note TUNE_SAD[] PROGMEM = {{392, 300}, {370, 300}, {349, 300}, {330, 700}};
static const Note TUNE_ALARM[] PROGMEM = {{880, 150}, {660, 150}, {880, 150}, {660, 150}, {880, 150}, {660, 150}};
static const Note TUNE_BIRTHDAY[] PROGMEM = {
  {262, 250}, {262, 250}, {294, 500}, {262, 500}, {349, 500}, {330, 1000},
  {262, 250}, {262, 250}, {294, 500}, {262, 500}, {392, 500}, {349, 1000},
  {262, 250}, {262, 250}, {523, 500}, {440, 500}, {349, 500}, {330, 500}, {294, 1000},
  {466, 250}, {466, 250}, {440, 500}, {349, 500}, {392, 500}, {349, 1000}
};
static const Note TUNE_ROBOT[] PROGMEM = {{2000, 60}, {1500, 60}, {2500, 60}, {1800, 60}, {3000, 80}, {0, 60}, {2200, 60}, {2800, 100}};
static const Note TUNE_SIREN[] PROGMEM = {
  {600, 80}, {800, 80}, {1000, 80}, {1200, 80}, {1000, 80}, {800, 80},
  {600, 80}, {800, 80}, {1000, 80}, {1200, 80}, {1000, 80}, {800, 80}
};

struct Tune {
  const Note *notes;
  uint8_t count;
};

static const Tune TUNES[] = {
  {TUNE_WIN, 4}, {TUNE_SAD, 4}, {TUNE_ALARM, 6},
  {TUNE_BIRTHDAY, 25}, {TUNE_ROBOT, 8}, {TUNE_SIREN, 12}
};

static bool playNote(uint16_t freq, uint32_t ms)
{
  if (freq >= 31)
    tone(PIN_BUZZER, freq);
  bool ok = sleepMs(ms);
  noTone(PIN_BUZZER);
  return ok && sleepMs(20);
}

static void playTune(uint8_t id)
{
  if (id >= sizeof(TUNES) / sizeof(TUNES[0]))
    return;
  for (uint8_t i = 0; i < TUNES[id].count; i++) {
    uint16_t f = pgm_read_word(&TUNES[id].notes[i].freq);
    uint16_t ms = pgm_read_word(&TUNES[id].notes[i].ms);
    if (!playNote(f, ms))
      return;
  }
}

// Movements measured in cm and degrees are timed with the calibration from the header.

static void timedMove(int m1, int m2, int m3, int m4, uint32_t ms)
{
  wheels(m1, m2, m3, m4);
  bool ok = sleepMs(ms);
  stopMotors();
  if (ok)
    sleepMs(120);  // let the car settle before the next block
}

static void moveCm(float cm)
{
  int s = cm >= 0 ? cfg.moveSpeed : -cfg.moveSpeed;
  timedMove(s, s, s, s, fabs(cm) * 10000.0 / cfg.cmps10);
}

static void strafeCm(float cm)
{
  // Mecanum wheels: positive = to the right.
  int s = cm >= 0 ? -cfg.moveSpeed : cfg.moveSpeed;
  timedMove(-s, s, -s, s, fabs(cm) * 10000.0 / cfg.cmps10);
}

static void turnDeg(float deg)
{
  // Positive = clockwise (to the right).
  int s = deg >= 0 ? cfg.turnSpeed : -cfg.turnSpeed;
  timedMove(s, s, -s, -s, fabs(deg) * cfg.ms90 / 90.0);
}

static void driveMode(uint8_t mode, int speed)
{
  switch (mode) {
  case DRIVE_FORWARD:     sides(speed, speed); break;
  case DRIVE_BACKWARD:    sides(-speed, -speed); break;
  case DRIVE_SPIN_LEFT:   sides(-speed, speed); break;
  case DRIVE_SPIN_RIGHT:  sides(speed, -speed); break;
  case DRIVE_STRAFE_LEFT: wheels(-speed, speed, -speed, speed); break;
  case DRIVE_STRAFE_RIGHT: wheels(speed, -speed, speed, -speed); break;
  case DRIVE_CURVE_LEFT:  sides(speed / 3, speed); break;
  case DRIVE_CURVE_RIGHT: sides(speed, speed / 3); break;
  default:                stopMotors(); break;
  }
}

// Bytecode interpreter

static float stack[MAX_STACK];
static uint8_t sp;
static float vars[MAX_VARS];
static uint16_t pc;

static void push(float v)
{
  if (sp < MAX_STACK)
    stack[sp++] = v;
}

static float pop()
{
  return sp ? stack[--sp] : 0;
}

static uint8_t fetch()
{
  return progByte(BC_HEADER + pc++);
}

static uint16_t fetchWord()
{
  uint16_t v = fetch();
  return v | (uint16_t)fetch() << 8;
}

static float randomBetween(float a, float b)
{
  if (a > b) {
    float t = a; a = b; b = t;
  }
  if (a == floor(a) && b == floor(b))
    return random((long)a, (long)b + 1);
  return a + (b - a) * random(0, 10001) / 10000.0;
}

static void runProgram()
{
  if (!loadConfig())
    return;
  Serial.println(F("RUN"));
  sp = 0;
  pc = 0;
  for (uint8_t i = 0; i < MAX_VARS; i++)
    vars[i] = 0;
  stopRequested = false;
  int driveSpeed = 60;
  uint8_t lastDrive = DRIVE_STOP;
  uint32_t timer0 = millis();
  char text[24];

  oledClear();
  clearFace();
  ledsAll(0, 0, 0);
  pixels.setBrightness(50);

  while (pc < cfg.len && !poll()) {
    uint8_t op = fetch();
    float a, b;
    switch (op) {
    case OP_END:
      pc = cfg.len;
      break;
    case OP_PUSHB:
      push((int8_t)fetch());
      break;
    case OP_PUSHW:
      push((int16_t)fetchWord());
      break;
    case OP_PUSHF: {
      uint32_t raw = fetchWord();
      raw |= (uint32_t)fetchWord() << 16;
      float f;
      memcpy(&f, &raw, 4);
      push(f);
      break;
    }
    case OP_LOAD:
      push(vars[fetch() % MAX_VARS]);
      break;
    case OP_STORE:
      vars[fetch() % MAX_VARS] = pop();
      break;

    case OP_ADD: b = pop(); a = pop(); push(a + b); break;
    case OP_SUB: b = pop(); a = pop(); push(a - b); break;
    case OP_MUL: b = pop(); a = pop(); push(a * b); break;
    case OP_DIV: b = pop(); a = pop(); push(b == 0 ? 0 : a / b); break;
    case OP_MOD:
      b = pop(); a = pop();
      if (b == 0) {
        push(0);
      } else {
        float r = fmod(a, b);
        if (r != 0 && (r < 0) != (b < 0))
          r += b;
        push(r);
      }
      break;
    case OP_NEG: push(-pop()); break;
    case OP_ABS: push(fabs(pop())); break;
    case OP_ROUND: push(round(pop())); break;
    case OP_RANDOM: b = pop(); a = pop(); push(randomBetween(a, b)); break;

    case OP_LT: b = pop(); a = pop(); push(a < b); break;
    case OP_LE: b = pop(); a = pop(); push(a <= b); break;
    case OP_GT: b = pop(); a = pop(); push(a > b); break;
    case OP_GE: b = pop(); a = pop(); push(a >= b); break;
    case OP_EQ: b = pop(); a = pop(); push(fabs(a - b) < 1e-6); break;
    case OP_NE: b = pop(); a = pop(); push(fabs(a - b) >= 1e-6); break;
    case OP_AND: b = pop(); a = pop(); push(a != 0 && b != 0); break;
    case OP_OR: b = pop(); a = pop(); push(a != 0 || b != 0); break;
    case OP_NOT: push(pop() == 0); break;

    case OP_JMP:
      pc = fetchWord();
      break;
    case OP_JZ: {
      uint16_t t = fetchWord();
      if (pop() == 0)
        pc = t;
      break;
    }
    case OP_JNZ: {
      uint16_t t = fetchWord();
      if (pop() != 0)
        pc = t;
      break;
    }
    case OP_WAIT:
      a = pop();
      if (a > 0)
        sleepMs(a * 1000);
      break;
    case OP_HALT:
      pc = cfg.len;
      break;

    case OP_MOVE: moveCm(pop()); break;
    case OP_TURN: turnDeg(pop()); break;
    case OP_STRAFE: strafeCm(pop()); break;
    case OP_DRIVE:
      lastDrive = fetch();
      driveMode(lastDrive, driveSpeed);
      break;
    case OP_SPEED:
      driveSpeed = constrain((int)pop(), 0, 100);
      if (lastDrive != DRIVE_STOP)
        driveMode(lastDrive, driveSpeed);
      break;
    case OP_MOTORS:
      b = pop(); a = pop();
      lastDrive = DRIVE_STOP;
      sides(a, b);
      break;

    case OP_BEEP:
      playNote(1000, 150);
      break;
    case OP_TONE:
      b = pop(); a = pop();
      if (b > 0)
        playNote(constrain(a, 0, 10000), b * 1000);
      break;
    case OP_TUNE:
      playTune(fetch());
      break;

    case OP_LEDS: {
      uint8_t r = fetch(), g = fetch(), bl = fetch();
      ledsAll(r, g, bl);
      break;
    }
    case OP_LED: {
      uint8_t r = fetch(), g = fetch(), bl = fetch();
      int i = (int)pop() - 1;
      if (i >= 0 && i < NUM_RGB) {
        pixels.setPixelColor(i, r, g, bl);
        pixels.show();
      }
      break;
    }
    case OP_BRIGHT:
      pixels.setBrightness(constrain(pop(), 0, 100) * 255 / 100);
      pixels.show();
      break;

    case OP_HEAD:
      setHead(pop());
      break;

    case OP_CLS:
      oledClear();
      break;
    case OP_TEXT:
    case OP_TEXTNUM: {
      uint8_t line = fetch(), n = fetch(), k = 0;
      for (uint8_t i = 0; i < n; i++) {
        char c = fetch();
        if (k < 10)
          text[k++] = c;
      }
      text[k] = 0;
      if (op == OP_TEXTNUM) {
        if (k && k < 10)
          text[k++] = ' ';
        formatNumber(pop(), text + k);
        text[10] = 0;
      }
      oledLine(line, text);
      break;
    }
    case OP_NUM: {
      uint8_t line = fetch();
      formatNumber(pop(), text);
      text[10] = 0;
      oledLine(line, text);
      break;
    }
    case OP_FACE:
      showFace(fetch());
      break;
    case OP_FACE_OFF:
      clearFace();
      break;

    case OP_DIST: push(distanceCm()); break;
    case OP_LINE: push(lineSensor(fetch())); break;
    case OP_LIGHT: push(lightDirection()); break;
    case OP_KEY: push(keyHeld(fetch())); break;
    case OP_BATTERY: push(batteryPercent()); break;
    case OP_TIMER: push((millis() - timer0) / 1000.0); break;
    case OP_TIMER_RESET: timer0 = millis(); break;

    default:
      Serial.print(F("ERR op "));
      Serial.println(op);
      pc = cfg.len;
      break;
    }
  }
  stopMotors();
  noTone(PIN_BUZZER);
  if (head.attached())
    head.detach();
  Serial.println(stopRequested ? F("STOP") : F("END"));
}

// USB link with the editor

static int readByteTimeout(uint16_t ms)
{
  uint32_t t0 = millis();
  while (!Serial.available())
    if (millis() - t0 > ms)
      return -1;
  return Serial.read();
}

// 'P'/'X' len16 bytes... sum8. Bytes are acknowledged with '.' every 32 bytes
// because writing the EEPROM is slower than the serial line.
static bool receiveProgram(bool toRam)
{
  int lo = readByteTimeout(1000), hi = readByteTimeout(1000);
  if (lo < 0 || hi < 0)
    return false;
  uint16_t len = lo | hi << 8;
  if (len < BC_HEADER || len > (toRam ? RAM_PROG : EEPROM.length())) {
    Serial.println(F("ERR size"));
    return false;
  }
  uint8_t sum = 0;
  for (uint16_t i = 0; i < len; i++) {
    int c = readByteTimeout(2000);
    if (c < 0) {
      Serial.println(F("ERR timeout"));
      return false;
    }
    sum += c;
    if (toRam)
      ramProg[i] = c;
    else
      EEPROM.update(i, c);
    if (i % 32 == 31)
      Serial.write('.');
  }
  int check = readByteTimeout(1000);
  fromRam = toRam;
  if (check != sum || !loadConfig()) {
    fromRam = false;
    Serial.println(F("ERR checksum"));
    return false;
  }
  Serial.println(F("OK"));
  return true;
}

static void reportSensors()
{
  Serial.print(F("D "));
  Serial.print(distanceCm());
  Serial.print(' ');
  Serial.print(lineSensor(0));
  Serial.print(' ');
  Serial.print(lineSensor(1));
  Serial.print(' ');
  Serial.print(lineSensor(2));
  Serial.print(' ');
  Serial.print(lightDirection());
  Serial.print(' ');
  Serial.print(batteryPercent());
  Serial.print(' ');
  Serial.println(keyHeld(lastKey) ? lastKey : -1);
}

static void idleScreen(bool valid)
{
  oledClear();
  oledLine(0, " Adeept");
  oledLine(1, "  Blocs");
  oledLine(3, valid ? "OK=demarre" : "Aucun prog");
  showFace(valid ? 1 : 7);
}

static uint32_t autoStartAt;  // 0 = no countdown

// The screen, eyes and lights keep what the program showed last.
static void afterRun()
{
  fromRam = false;
  stopRequested = false;
  autoStartAt = 0;
}

static void handleSerial()
{
  int c = Serial.read();
  if (c < 0)
    return;
  if (c == '?' || c == 'P' || c == 'X' || c == 'R' || c == 'D' || c == 'S')
    autoStartAt = 0;
  switch (c) {
  case '?':
    Serial.print(F("ADEEPTBLOCS "));
    Serial.println(FW_VERSION);
    break;
  case 'P':
    if (receiveProgram(false)) {
      oledClear();
      oledLine(0, "Programme");
      oledLine(1, " recu !");
      oledLine(3, "OK=demarre");
      showFace(0);
      playNote(1500, 80);
      playNote(2000, 120);
    }
    break;
  case 'X':
    if (receiveProgram(true)) {
      runProgram();
      afterRun();
    }
    break;
  case 'R':
    fromRam = false;
    if (loadConfig()) {
      runProgram();
      afterRun();
    } else {
      Serial.println(F("ERR noprog"));
    }
    break;
  case 'D':
    reportSensors();
    break;
  case 'S':
    stopMotors();
    break;
  }
}

void setup()
{
  Serial.begin(115200);
  Wire.begin();
  Wire.setClock(400000L);
  pcaBegin();
  stopMotors();

  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_LINE_L, INPUT);
  pinMode(PIN_LINE_M, INPUT);
  pinMode(PIN_LINE_R, INPUT);
  pinMode(PIN_LIGHT, INPUT);
  pinMode(PIN_IR, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_IR), irIsr, CHANGE);
  randomSeed(analogRead(A6) ^ analogRead(A7) ^ micros());

  pixels.begin();
  pixels.setBrightness(50);
  ledsAll(0, 0, 0);
  oledBegin();
  matrixBegin();

  fromRam = false;
  bool valid = loadConfig();
  idleScreen(valid);
  if (valid && !(cfg.flags & FLAG_START_WITH_OK))
    autoStartAt = millis() + 3000;
}

void loop()
{
  handleSerial();
  if (irService() && lastKey == KEY_OK) {
    autoStartAt = 0;
    fromRam = false;
    if (loadConfig()) {
      runProgram();
      afterRun();
    }
  }
  if (autoStartAt) {
    // Countdown: 3 beeps, then start.
    static uint8_t shown = 0;
    int32_t left = (int32_t)(autoStartAt - millis());
    uint8_t sec = left > 0 ? left / 1000 + 1 : 0;
    if (sec != shown) {
      shown = sec;
      if (sec) {
        char s[11] = "    ";
        s[4] = '0' + sec;
        s[5] = 0;
        oledLine(2, s);
        tone(PIN_BUZZER, 1200, 80);
      }
    }
    if (left <= 0) {
      autoStartAt = 0;
      shown = 0;
      fromRam = false;
      runProgram();
      afterRun();
    }
  }
}
