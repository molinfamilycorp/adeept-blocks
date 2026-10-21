// Minimal Arduino API for running the firmware on a computer (tools/hosttest).
#pragma once
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <deque>
#include <string>
#include <avr/pgmspace.h>

typedef uint8_t byte;
using std::round;
using std::fabs;
using std::floor;
using std::fmod;
using std::lround;

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define CHANGE 1
#define A0 14
#define A1 15
#define A2 16
#define A3 17
#define A6 20
#define A7 21

template <class T, class L, class H> T constrain(T v, L lo, H hi) { return v < lo ? lo : v > hi ? hi : v; }
inline long abs(long v) { return v < 0 ? -v : v; }

uint32_t millis();
uint32_t micros();
void delay(uint32_t ms);
void delayMicroseconds(uint32_t us);
void pinMode(uint8_t, uint8_t);
void digitalWrite(uint8_t, uint8_t);
int digitalRead(uint8_t);
int analogRead(uint8_t);
uint32_t pulseIn(uint8_t, uint8_t, uint32_t);
void tone(uint8_t, unsigned int, unsigned long = 0);
void noTone(uint8_t);
long random(long lo, long hi);
void randomSeed(unsigned long);
inline void noInterrupts() {}
inline void interrupts() {}
inline int digitalPinToInterrupt(int p) { return p; }
inline void attachInterrupt(int, void (*)(), int) {}
char *ltoa(long v, char *buf, int base);
char *dtostrf(double v, signed char width, unsigned char prec, char *buf);

class __FlashStringHelper;
#define F(s) (reinterpret_cast<const __FlashStringHelper *>(s))

struct HostSerial {
  std::deque<uint8_t> in;
  std::string out;
  void begin(long) {}
  int available() { return in.size(); }
  int peek() { return in.empty() ? -1 : in.front(); }
  int read() { if (in.empty()) return -1; int c = in.front(); in.pop_front(); return c; }
  void write(uint8_t c) { out += (char)c; }
  void print(const char *s) { out += s; }
  void print(const __FlashStringHelper *s) { out += (const char *)s; }
  void print(char c) { out += c; }
  void print(int v) { out += std::to_string(v); }
  void print(long v) { out += std::to_string(v); }
  void print(double v) { char b[32]; snprintf(b, sizeof b, "%.2f", v); out += b; }
  template <class T> void println(T v) { print(v); out += "\r\n"; }
};
extern HostSerial Serial;
