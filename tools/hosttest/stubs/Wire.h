#pragma once
#include "Arduino.h"
struct HostWire {
  uint8_t addr;
  uint8_t buf[64];
  int n;
  void begin() {}
  void setClock(long) {}
  void beginTransmission(uint8_t a) { addr = a; n = 0; }
  void write(uint8_t b) { if (n < 64) buf[n++] = b; }
  void write(const uint8_t *d, uint8_t k) { for (int i = 0; i < k; i++) write(d[i]); }
  uint8_t endTransmission();
};
extern HostWire Wire;
