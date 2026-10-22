// Runs the firmware on a computer with fake hardware, to test the USB protocol
// and the bytecode interpreter against programs compiled by the editor.
//
// Usage: hosttest <program.hex> [X | K<nec command in hex>]   (the image as hex bytes separated by spaces)
// Prints what the car would do: motors, sounds, lights, eyes, screen.

#include "Arduino.h"
#include "../../firmware/AdeeptBlocs/AdeeptBlocs.ino"

#include <fstream>
#include <sstream>
#include <vector>

HostSerial Serial;
HostWire Wire;
HostEEPROM EEPROM;

static uint64_t nowUs;
static int motorState[4];
static uint16_t pcaOn[16], pcaOff[16];

static void logf(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
static void logf(const char *fmt, ...)
{
  va_list ap;
  va_start(ap, fmt);
  printf("[%7.3f s] ", nowUs / 1e6);
  vprintf(fmt, ap);
  printf("\n");
  va_end(ap);
}

// Remote control: holdKeyCmd is pressed from 1 s to 3 s (one frame, then a repeat code every 108 ms),
// then the program is stopped at 4 s.
static int holdKeyCmd = -1;
static uint64_t nextIrUs = 1000000;

static void remote()
{
  if (holdKeyCmd >= 0 && nowUs > 4000000 && Serial.in.empty()) {
    Serial.in.push_back('S');  // stop the endless program
    holdKeyCmd = -1;
  }
  if (holdKeyCmd < 0 || nowUs < nextIrUs || nowUs > 3000000)
    return;
  if (nextIrUs == 1000000) {
    irValue = 0x0000FF00UL | (uint32_t)holdKeyCmd << 16 | (uint32_t)(0xFF ^ holdKeyCmd) << 24;
    irNew = true;
  } else {
    irRepeat = true;
  }
  nextIrUs += 108000;
}

uint32_t micros() { nowUs += 20; remote(); return nowUs; }
uint32_t millis() { nowUs += 20; remote(); return nowUs / 1000; }
void delay(uint32_t ms) { nowUs += ms * 1000ULL; }
void delayMicroseconds(uint32_t us) { nowUs += us; }
void pinMode(uint8_t, uint8_t) {}
void digitalWrite(uint8_t, uint8_t) {}
int digitalRead(uint8_t pin) { return pin == PIN_LINE_M ? 1 : pin == PIN_IR ? 1 : 0; }
int analogRead(uint8_t) { return 600; }
uint32_t pulseIn(uint8_t, uint8_t, uint32_t) { nowUs += 3000; return 1765; }  // 30 cm
void tone(uint8_t, unsigned int f, unsigned long) { logf("tone %u Hz", f); }
void noTone(uint8_t) {}
long random(long lo, long hi) { return lo + std::rand() % (hi - lo); }
void randomSeed(unsigned long) {}
char *ltoa(long v, char *buf, int) { snprintf(buf, 16, "%ld", v); return buf; }
char *dtostrf(double v, signed char w, unsigned char p, char *buf) { snprintf(buf, 24, "%*.*f", w, p, v); return buf; }
void Servo::write(int a) { logf("head servo %d", a); }
void Adafruit_NeoPixel::show()
{
  std::string s;
  for (int i = 0; i < NUM_RGB; i++) {
    char b[20];
    snprintf(b, sizeof b, " %d,%d,%d", px[i][0], px[i][1], px[i][2]);
    s += b;
  }
  logf("leds%s", s.c_str());
}

// SSD1306 emulation

static uint8_t fb[8][128];
static int col0, col1, page0, page1, col, page;
static std::vector<uint8_t> pendingCmd;

static void oledCommand(uint8_t c)
{
  pendingCmd.push_back(c);
  uint8_t op = pendingCmd[0];
  size_t need = (op == 0x21 || op == 0x22) ? 3 : (op == 0xD5 || op == 0xA8 || op == 0xD3 || op == 0x8D ||
                op == 0x20 || op == 0xDA || op == 0x81 || op == 0xD9 || op == 0xDB) ? 2 : 1;
  if (pendingCmd.size() < need)
    return;
  if (op == 0x21) { col0 = col = pendingCmd[1]; col1 = pendingCmd[2]; }
  if (op == 0x22) { page0 = page = pendingCmd[1]; page1 = pendingCmd[2]; }
  pendingCmd.clear();
}

static void oledWrite(uint8_t d)
{
  fb[page & 7][col & 127] = d;
  if (++col > col1) {
    col = col0;
    if (++page > page1)
      page = page0;
  }
}

static std::string oledText(int line)
{
  std::string s;
  for (int i = 0; i < 10; i++) {
    int x0 = 4 + 12 * i;
    char best = '?';
    for (int ch = 32; ch < 127; ch++) {
      bool same = true;
      for (int c = 0; c < 5 && same; c++) {
        uint16_t wide = fb[2 * line][x0 + 2 * c] | fb[2 * line + 1][x0 + 2 * c] << 8;
        uint8_t bits = 0;
        for (int b = 0; b < 8; b++)
          if (wide & (1 << (2 * b)))
            bits |= 1 << b;
        same = bits == FONT5X7[(ch - 32) * 5 + c];
      }
      if (same) {
        best = ch;
        break;
      }
    }
    s += best;
  }
  while (!s.empty() && s.back() == ' ')
    s.pop_back();
  return s;
}

uint8_t HostWire::endTransmission()
{
  nowUs += 25 * (n + 2);  // about 22.5 us per byte at 400 kHz, plus start and address
  remote();
  if (addr == OLED_ADDR) {
    if (buf[0] == 0x00)
      for (int i = 1; i < n; i++) oledCommand(buf[i]);
    else
      for (int i = 1; i < n; i++) oledWrite(buf[i]);
    if (buf[0] == 0x40 && n == 13 && page == page0 && col == col0)
      for (int l = 0; l < 4; l++)
        if (2 * l == page0)
          logf("screen line %d: \"%s\"", l + 1, oledText(l).c_str());
  } else if (addr == PCA_ADDR && n == 2 && buf[0] == 0xFE) {
    logf("pca prescaler %d (%.0f Hz)", buf[1], 25e6 / 4096 / (buf[1] + 1));
  } else if (addr == PCA_ADDR && n == 5) {
    int ch = (buf[0] - 6) / 4;
    pcaOn[ch] = buf[1] | buf[2] << 8;
    pcaOff[ch] = buf[3] | buf[4] << 8;
    if (ch == 6 || ch == 7)
      logf("pca servo CH%d pulse %d/4096", ch, pcaOff[ch] & 0x1000 ? 0 : pcaOff[ch]);
    int m[4];
    for (int i = 0; i < 4; i++) {
      auto val = [](int c) { return pcaOn[c] & 0x1000 ? 4095 : pcaOff[c] & 0x1000 ? 0 : pcaOff[c]; };
      m[i] = (val(MOTOR_CH[i][0]) - val(MOTOR_CH[i][1])) * 100 / 4095;
    }
    if (memcmp(m, motorState, sizeof m)) {
      memcpy(motorState, m, sizeof m);
      logf("motors %d %d %d %d", m[0], m[1], m[2], m[3]);
    }
  } else if (addr == MATRIX_ADDR && n == 17) {
    uint8_t rows[16] = {0};
    for (int i = 0; i < 8; i++) {
      uint16_t v = buf[1 + 2 * i] | buf[2 + 2 * i] << 8;
      for (int r = 0; r < 16; r++)
        if (v & (1 << r))
          rows[r] |= 1 << (7 - i);
    }
    int face = -1;
    for (int f = 0; f < NUM_FACES; f++)
      if (!memcmp(rows, FACES[f], 16))
        face = f;
    static int lastFace = -2;
    if (face != lastFace)
      logf("eyes %s", face >= 0 ? std::to_string(face).c_str() : "(off/other)");
    lastFace = face;
  }
  return 0;
}

int main(int argc, char **argv)
{
  if (argc < 2) {
    fprintf(stderr, "usage: hosttest program.hex\n");
    return 2;
  }
  std::ifstream f(argv[1]);
  std::vector<uint8_t> prog;
  std::string tok;
  while (f >> tok)
    prog.push_back(std::stoi(tok, nullptr, 16));

  setup();
  Serial.in.push_back('?');
  // "X" as second argument: run once from RAM, like the calibration buttons.
  bool ram = argc > 2 && argv[2][0] == 'X';
  // "K18" as second argument: hold the remote key with NEC command 0x18 (up).
  if (argc > 2 && argv[2][0] == 'K')
    holdKeyCmd = std::stoi(argv[2] + 1, nullptr, 16);
  Serial.in.push_back(ram ? 'X' : 'P');
  Serial.in.push_back(prog.size() & 0xFF);
  Serial.in.push_back(prog.size() >> 8);
  uint8_t sum = 0;
  for (uint8_t b : prog) {
    Serial.in.push_back(b);
    sum += b;
  }
  Serial.in.push_back(sum);
  if (!ram)
    Serial.in.push_back('R');
  for (int i = 0; i < 3; i++)
    Serial.in.push_back('D');  // the settings window reads the sensors meanwhile
  for (int i = 0; i < 200 && nowUs < 6000000 && Serial.out.find("END") == std::string::npos && Serial.out.find("STOP") == std::string::npos; i++)
    loop();
  printf("--- serial output ---\n%s", Serial.out.c_str());
  return Serial.out.find("END") != std::string::npos ? 0 : 1;
}
