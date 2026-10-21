#pragma once
#include "Arduino.h"
#define NEO_GRB 0
#define NEO_KHZ800 0
struct Adafruit_NeoPixel {
  uint8_t px[16][3];
  Adafruit_NeoPixel(int, int, int) {}
  void begin() {}
  void setBrightness(uint8_t) {}
  void setPixelColor(int i, uint8_t r, uint8_t g, uint8_t b) { px[i][0] = r; px[i][1] = g; px[i][2] = b; }
  void show();
};
