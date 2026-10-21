#pragma once
#include "Arduino.h"
struct Servo {
  bool on = false;
  void attach(int) { on = true; }
  void detach() { on = false; }
  bool attached() { return on; }
  void write(int a);
};
