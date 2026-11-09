# ESP32 Counter Verification Terminal (Arduino IDE Setup)

Firmware para sa **ESP32 Counter Kiosk Verification Terminal** gamit ang **Arduino IDE**.

---

## 1. Sketch File Location
Buksan sa Arduino IDE:
📁 **`firmware/esp32_terminal/esp32_terminal.ino`**

*(Kailangan nasa loob ng folder na `esp32_terminal/` ang `.ino` file para direktang mabuksan nang walang prompt o duplication sa Arduino IDE.)*

---

## 2. Board Configuration sa Arduino IDE
1. Pumunta sa **Tools** > **Board** > **esp32** > piliin ang **ESP32 Dev Module**.
   *(Kung wala pa ang ESP32 board sa Arduino IDE, i-add sa File > Preferences > Additional boards manager URLs: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`, pagkatapos i-install ang `esp32` via Boards Manager).*
2. **Upload Speed:** `921600` (o `115200`)
3. **CPU Frequency:** `240MHz`
4. **Flash Frequency:** `80MHz`
5. **Partition Scheme:** `Default 4MB with spiffs (1.2MB APP / 1.5MB SPIFFS)`
6. **Port:** Piliin ang tamang COM Port ng nakasaksak na ESP32 (e.g. `COM3`, `COM4`, etc.).

---

## 3. Required Libraries
I-install sa **Tools** > **Manage Libraries...** (`Ctrl + Shift + I`):
- **`Adafruit SSD1306`** ni Adafruit (kasama ang mga dependencies kapag tinanong)
- **`Adafruit GFX Library`** ni Adafruit
- **`ArduinoJson`** ni Benoit Blanchon (Version 7.x)

---

## 4. Hardware Wiring & Pinouts

| Component | Pin sa ESP32 | Description |
| :--- | :--- | :--- |
| **SSD1306 OLED SDA** | **GPIO 21** | I2C Data |
| **SSD1306 OLED SCL** | **GPIO 22** | I2C Clock |
| **Tactile Push Button** | **GPIO 35** | Active LOW (Pindutin para mag-confirm) |
| **Active Buzzer** | **GPIO 32** | Beep / Alert chime |
| **Passive Buzzer** | **GPIO 23** | Tone frequency melody |
| **Status LED 1 (Blue/Amber)** | **GPIO 27** | Alert / Awaiting button press |
| **Status LED 2 (Green)** | **GPIO 14** | Success / Confirmed indicator |

---

## 5. Network & Server Settings
Bago i-upload ang sketch, i-check ang mga constants sa taas ng `esp32_terminal.ino`:

```cpp
const char* WIFI_SSID = "PLDTHOMEFIBR61930";       // Pangalan ng Wi-Fi
const char* WIFI_PASSWORD = "PLDTWIFIwu5ft";       // Password ng Wi-Fi

// Cloud Backend API URL (Render):
const char* API_BASE_URL = "https://rent-and-play.onrender.com/api";
// O kung local testing sa PC: "http://192.168.1.7:3000/api"

// Provisioned Terminal Credentials sa database:
const char* TERMINAL_ID = "TERM-01";
const char* TERMINAL_KEY = "r6R0LbDKNCfTAvtoQkK545VGWZjifr_uQXi3jWnFAYg";
```

---

## 6. Supported Verification Modes
1. **`! COUNTER HANDOVER !`** - Walk-in customer counter release (pindot ng button = start rental timer).
2. **`! RESORT DISPATCH !`** - Resort delivery departure (pindot ng button = marks unit Out for Delivery habang nakahinto ang timer hanggang marating ang resort).
3. **`! RETURN INTAKE !`** - Pagtanggap at pag-inspect ng ibinalik na equipment (pindot ng button = marks rental COMPLETED at available na ulit ang equipment).

---

## 7. Built-in Wi-Fi Setup Portal (No Re-flashing Needed)
Kapag nagpalit ng Wi-Fi password o router sa shop:
1. I-hold ang physical button (**GPIO 35**) habang nagbo-boot (o hintayin mag-fail ang Wi-Fi connection).
2. Lalabas sa OLED screen ang **`== WIFI SETUP MODE ==`** at gagawa ang ESP32 ng hotspot na **`RentPlay-TERM-01`** (o `RentPlay-TERM-02`).
3. Kumonekta sa hotspot gamit ang phone o laptop at buksan ang **`http://192.168.4.1`** sa browser.
4. Ilagay ang bagong Wi-Fi SSID at Password at pindutin ang **Save & Connect**. Sine-save ito sa ESP32 NVS (`Preferences`) kaya mananatili kahit mawalan ng kuryente.
