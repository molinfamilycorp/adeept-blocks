#pragma once
#include "Arduino.h"
struct HostEEPROM {
  uint8_t mem[1024];
  HostEEPROM() { memset(mem, 0xFF, sizeof mem); }
  uint8_t read(int a) { return mem[a & 1023]; }
  void update(int a, uint8_t v) { mem[a & 1023] = v; }
  uint16_t length() { return 1024; }
};
extern HostEEPROM EEPROM;
