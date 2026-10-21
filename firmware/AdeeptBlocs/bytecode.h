// Program format shared with the web editor (editor/compiler.js must agree).
//
// Header (16 bytes):
//   0-1   'A' 'B'
//   2     BC_VERSION
//   3     flags (FLAG_*)
//   4-5   code length (little endian)
//   6-7   milliseconds needed to turn 90 degrees at turnSpeed
//   8-9   speed in tenths of cm per second at moveSpeed
//   10    moveSpeed, % of motor power for "move N cm"
//   11    turnSpeed, % of motor power for "turn N degrees"
//   12    number of variables
//   13    sum of the code bytes, modulo 256
//   14-15 reserved
// Code follows. It is a stack machine on floats; jump targets are offsets in the code.
#pragma once

#define BC_VERSION 1
#define BC_HEADER  16

#define FLAG_INVERT_MOTORS 0x01
#define FLAG_INVERT_HEAD   0x02
#define FLAG_START_WITH_OK 0x04

enum {
  OP_END = 0x00,
  OP_PUSHB = 0x01,        // i8
  OP_PUSHW = 0x02,        // i16
  OP_PUSHF = 0x03,        // f32
  OP_LOAD = 0x04,         // var
  OP_STORE = 0x05,        // var

  OP_ADD = 0x10,
  OP_SUB = 0x11,
  OP_MUL = 0x12,
  OP_DIV = 0x13,
  OP_MOD = 0x14,
  OP_NEG = 0x15,
  OP_ABS = 0x16,
  OP_ROUND = 0x17,
  OP_RANDOM = 0x18,

  OP_LT = 0x20,
  OP_LE = 0x21,
  OP_GT = 0x22,
  OP_GE = 0x23,
  OP_EQ = 0x24,
  OP_NE = 0x25,
  OP_AND = 0x26,
  OP_OR = 0x27,
  OP_NOT = 0x28,

  OP_JMP = 0x30,          // u16
  OP_JZ = 0x31,           // u16
  OP_JNZ = 0x32,          // u16
  OP_WAIT = 0x33,         // pops seconds
  OP_HALT = 0x34,

  OP_MOVE = 0x40,         // pops cm, negative = backwards
  OP_TURN = 0x41,         // pops degrees, positive = right
  OP_STRAFE = 0x42,       // pops cm, positive = right (Mecanum wheels)
  OP_DRIVE = 0x43,        // u8 DRIVE_*
  OP_SPEED = 0x44,        // pops %
  OP_MOTORS = 0x45,       // pops right %, left %

  OP_BEEP = 0x50,
  OP_TONE = 0x51,         // pops seconds, Hz
  OP_TUNE = 0x52,         // u8 tune

  OP_LEDS = 0x60,         // u8 r, g, b
  OP_LED = 0x61,          // u8 r, g, b; pops LED number 1..7
  OP_BRIGHT = 0x62,       // pops %

  OP_HEAD = 0x68,         // pops degrees, -90 = left .. 90 = right

  OP_CLS = 0x70,
  OP_TEXT = 0x71,         // u8 line, u8 n, n chars
  OP_NUM = 0x72,          // u8 line; pops value
  OP_TEXTNUM = 0x73,      // u8 line, u8 n, n chars; pops value
  OP_FACE = 0x74,         // u8 face
  OP_FACE_OFF = 0x75,

  OP_DIST = 0x80,
  OP_LINE = 0x81,         // u8 0 left, 1 middle, 2 right
  OP_LIGHT = 0x82,
  OP_KEY = 0x83,          // u8 key 0..16
  OP_BATTERY = 0x84,
  OP_TIMER = 0x85,
  OP_TIMER_RESET = 0x86,
};

enum {
  DRIVE_STOP = 0,
  DRIVE_FORWARD,
  DRIVE_BACKWARD,
  DRIVE_SPIN_LEFT,
  DRIVE_SPIN_RIGHT,
  DRIVE_STRAFE_LEFT,
  DRIVE_STRAFE_RIGHT,
  DRIVE_CURVE_LEFT,
  DRIVE_CURVE_RIGHT,
};
