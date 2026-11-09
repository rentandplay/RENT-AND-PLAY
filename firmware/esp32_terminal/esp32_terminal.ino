#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>

// =============================================================================
// 1. HARDWARE CONFIGURATION (PINOUTS)
// =============================================================================
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_I2C_ADDRESS 0x3C

// Connect OLED SDA to GPIO 21, SCL to GPIO 22
#define OLED_SDA 21
#define OLED_SCL 22

// Verified Hardware Pinouts:
// Push button: GPIO35 to GND (active LOW). Add a 10k external pull-up
// from GPIO35 to 3.3V: classic ESP32 GPIO34-39 have no internal pull-ups.
#define BUTTON_PIN       35

// Buzzers: Active Buzzer on D32, Passive Buzzer on D23
#define ACTIVE_BUZZER    32
#define PASSIVE_BUZZER   23

// Status LEDs: LED1 on D27, LED2 on D14
#define LED1_PIN         27
#define LED2_PIN         14

// Fairy Lights (LED String): D25 (via current-limiting resistor)
#define FAIRY_LIGHT_PIN  25

// =============================================================================
// 2. NETWORK & TERMINAL CONFIGURATION
// =============================================================================
const char* WIFI_SSID = "rnld_pstr";
const char* WIFI_PASSWORD = "lalamove";

// Backend API URL (Production cloud URL on Render):
const char* API_BASE_URL = "https://rent-and-play.onrender.com/api";
// const char* API_BASE_URL = "http://192.168.1.7:3000/api";

// Terminal credentials provisioned in Supabase:
const char* TERMINAL_ID = "TERM-01";
const char* TERMINAL_KEY = "r6R0LbDKNCfTAvtoQkK545VGWZjifr_uQXi3jWnFAYg";

// =============================================================================
// 3. GLOBAL OBJECTS & STATE
// =============================================================================
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

enum TerminalState {
  STATE_CONNECTING_WIFI,
  STATE_IDLE,
  STATE_PENDING_CONFIRMATION,
  STATE_CONFIRMING,
  STATE_SUCCESS,
  STATE_ERROR
};

TerminalState currentState = STATE_CONNECTING_WIFI;

// Current pending transaction data
String currentRequestId = "";
String lastAlertedRequestId = "";
bool currentIsTest = false;
String currentRentalCode = "";
String currentItemName = "";
String currentTransactionType = "";
String currentTerminalMode = "";
String currentVerificationCode = "";
int currentInspectionRevision = 0;

unsigned long lastPollTime = 0;
const unsigned long POLL_INTERVAL_MS = 3000;

// Button state with Hardware Interrupt support (Active LOW)
volatile bool buttonTriggered = false;
bool buttonArmed = true;
unsigned long lastButtonPressTime = 0;

void IRAM_ATTR handleButtonInterrupt() {
  buttonTriggered = true;
}

// =============================================================================
// 4. BUZZER & LED FEEDBACK
// =============================================================================
void beep(int frequencyHz, int durationMs) {
  digitalWrite(ACTIVE_BUZZER, HIGH);
  tone(PASSIVE_BUZZER, frequencyHz, durationMs);
  delay(durationMs);
  digitalWrite(ACTIVE_BUZZER, LOW);
  noTone(PASSIVE_BUZZER);
}

void soundStartup() {
  digitalWrite(LED1_PIN, HIGH);
  digitalWrite(FAIRY_LIGHT_PIN, HIGH);
  digitalWrite(ACTIVE_BUZZER, HIGH);
  tone(PASSIVE_BUZZER, 1000, 150);
  delay(150);
  digitalWrite(ACTIVE_BUZZER, LOW);
  noTone(PASSIVE_BUZZER);
  delay(60);
  digitalWrite(LED2_PIN, HIGH);
  digitalWrite(ACTIVE_BUZZER, HIGH);
  tone(PASSIVE_BUZZER, 1500, 200);
  delay(200);
  digitalWrite(ACTIVE_BUZZER, LOW);
  noTone(PASSIVE_BUZZER);
  digitalWrite(LED1_PIN, LOW);
  digitalWrite(LED2_PIN, LOW);
  digitalWrite(FAIRY_LIGHT_PIN, LOW);
}

void soundAlert() {
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED1_PIN, HIGH);
    digitalWrite(FAIRY_LIGHT_PIN, HIGH);
    digitalWrite(ACTIVE_BUZZER, HIGH);
    tone(PASSIVE_BUZZER, 1800, 150);
    delay(150);
    digitalWrite(ACTIVE_BUZZER, LOW);
    noTone(PASSIVE_BUZZER);
    digitalWrite(LED1_PIN, LOW);
    digitalWrite(FAIRY_LIGHT_PIN, LOW);
    delay(100);
  }
  digitalWrite(LED1_PIN, HIGH);
  digitalWrite(FAIRY_LIGHT_PIN, HIGH);
}

void soundSuccess() {
  digitalWrite(LED1_PIN, LOW);
  digitalWrite(LED2_PIN, HIGH);
  // Jingle Bells chorus, played by the passive buzzer. The active buzzer's
  // fixed pitch stays off so it does not mask the melody.
  const int melody[] = {
    330, 330, 330, 330, 330, 330, 330, 392, 262, 294, 330,
    349, 349, 349, 349, 349, 330, 330, 330, 330, 294, 294, 330, 294, 392
  };
  const int beats[] = {
    1, 1, 2, 1, 1, 2, 1, 1, 1, 1, 4,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2
  };
  digitalWrite(ACTIVE_BUZZER, LOW);
  for (size_t i = 0; i < sizeof(melody) / sizeof(melody[0]); i++) {
    const int durationMs = beats[i] * 160;
    digitalWrite(FAIRY_LIGHT_PIN, HIGH);
    tone(PASSIVE_BUZZER, melody[i], durationMs);
    delay(durationMs);
    noTone(PASSIVE_BUZZER);
    digitalWrite(FAIRY_LIGHT_PIN, LOW);
    delay(25);
  }
  digitalWrite(FAIRY_LIGHT_PIN, LOW);
}

void soundError() {
  digitalWrite(LED1_PIN, HIGH);
  digitalWrite(LED2_PIN, LOW);
  digitalWrite(FAIRY_LIGHT_PIN, LOW);
  beep(400, 400);
  digitalWrite(LED1_PIN, LOW);
}

// =============================================================================
// 5. OLED DISPLAY SCREENS
// =============================================================================
void soundHardwareTest() {
  Serial.println("[TEST] Playing hardware test melody with LEDs & Fairy Lights!");

  // Melody: First phrases of Twinkle Twinkle Little Star (14 notes, crisp ~3.5 seconds)
  int melody[] = {
    262, 262, 392, 392, 440, 440, 392,
    349, 349, 330, 330, 294, 294, 262
  };

  int durations[] = {
    200, 200, 200, 200, 200, 200, 400,
    200, 200, 200, 200, 200, 200, 450
  };

  int numNotes = sizeof(melody) / sizeof(melody[0]);
  for (int i = 0; i < numNotes; i++) {
    // If button is clicked anytime during the song, exit early to confirm instantly!
    if (buttonTriggered || digitalRead(BUTTON_PIN) == LOW) {
      buttonTriggered = true;
      Serial.println("[TEST] Button pressed during melody! Confirming...");
      break;
    }

    // Dance LEDs and Fairy Lights with each note
    if (i % 2 == 0) {
      digitalWrite(LED1_PIN, HIGH);
      digitalWrite(LED2_PIN, LOW);
      digitalWrite(FAIRY_LIGHT_PIN, HIGH);
    } else {
      digitalWrite(LED1_PIN, LOW);
      digitalWrite(LED2_PIN, HIGH);
      digitalWrite(FAIRY_LIGHT_PIN, LOW);
    }

    // Active buzzer accent on phrase end
    if ((i + 1) % 7 == 0) {
      digitalWrite(ACTIVE_BUZZER, HIGH);
      digitalWrite(FAIRY_LIGHT_PIN, HIGH);
    }

    tone(PASSIVE_BUZZER, melody[i], durations[i]);

    // Non-blocking wait: check button every 10ms for immediate reaction
    unsigned long noteStart = millis();
    while (millis() - noteStart < (unsigned long)durations[i]) {
      if (buttonTriggered || digitalRead(BUTTON_PIN) == LOW) {
        buttonTriggered = true;
        break;
      }
      delay(10);
    }

    digitalWrite(ACTIVE_BUZZER, LOW);
    noTone(PASSIVE_BUZZER);
    if (buttonTriggered) break;

    delay(35);
  }

  noTone(PASSIVE_BUZZER);
  digitalWrite(ACTIVE_BUZZER, LOW);

  // Keep alert LED1 & Fairy Lights on waiting for confirmation button
  if (!buttonTriggered) {
    digitalWrite(LED1_PIN, HIGH);
    digitalWrite(LED2_PIN, LOW);
    digitalWrite(FAIRY_LIGHT_PIN, HIGH);
  }
}

void showConnectingScreen() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("RENT & PLAY TERMINAL");
  display.println("--------------------");
  display.println("Connecting...");
  display.println("Please wait.");
  display.display();
}

void showIdleScreen() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("== RENT & PLAY ==");
  display.println("Counter Terminal");
  display.println("--------------------");
  display.print("Terminal: ");
  display.println(TERMINAL_ID);
  display.println("Ready for requests");
  display.println("Start in the app.");
  display.display();
}

void showPendingScreen(const String& code, const String& type, const String& mode, const String& itemName, const String& pin) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  if (currentIsTest) {
    display.println("== TERMINAL CHECK ==");
    display.println("--------------------");
    display.println("Check lights & sound.");
    display.println("Press button when");
    display.println("you hear and see them.");
    display.display();
    return;
  }
  if (mode == "SHOP_DISPATCH") {
    display.println("READY FOR DELIVERY");
  } else if (type == "RETURN") {
    display.println("CONFIRM RETURN");
  } else {
    display.println("CONFIRM HANDOVER");
  }
  display.println("--------------------");
  String cleanItem = itemName.length() > 20 ? itemName.substring(0, 20) : itemName;
  display.println(cleanItem.length() > 0 ? cleanItem : "Equipment Unit");
  display.print("Ref: ");
  display.println(code);
  display.print("Code: ");
  display.println(pin);
  display.println("Match code in app.");
  display.println("Then press button.");
  display.display();
}

void showConfirmingScreen() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 10);
  display.println("   CONFIRMING...    ");
  display.println("--------------------");
  display.println("Saving confirmation.");
  display.println("Please wait...");
  display.display();
}

void showSuccessScreen() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 5);
  if (currentIsTest) {
    display.println("  CHECK CONFIRMED   ");
    display.println("====================");
    display.println("Button received.");
    display.println("Check complete.");
    display.display();
    return;
  }
  display.println("    CONFIRMED!      ");
  display.println("====================");
  if (currentTerminalMode == "SHOP_DISPATCH") {
    display.println("Unit Out for Delivery");
    display.println("Timer starts on scan");
  } else if (currentTransactionType == "RETURN") {
    display.println("Return Completed &");
    display.println("Inventory Updated!");
  } else {
    display.println("Handover Confirmed!");
    display.println("Rental Timer Started");
  }
  display.println("\nStatus: VERIFIED");
  display.display();
}

void showErrorScreen(const String& errMessage, int code = 0) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("CONNECTION / REQUEST");
  display.println("--------------------");
  display.println(errMessage);
  if (code != 0) { display.print("Code: "); display.println(code); } else { display.println("Check status in app."); }
  display.display();
}

// =============================================================================
// 6. API CALLS TO BACKEND
// =============================================================================
void pollPendingRequests() {
  if (WiFi.status() != WL_CONNECTED) {
    currentState = STATE_CONNECTING_WIFI;
    return;
  }

  HTTPClient http;
  String url = String(API_BASE_URL) + "/terminals/" + TERMINAL_ID + "/pending";

  bool isHttps = String(API_BASE_URL).startsWith("https://");
  WiFiClientSecure secureClient;
  WiFiClient plainClient;

  if (isHttps) {
    secureClient.setInsecure();
    http.begin(secureClient, url);
  } else {
    http.begin(plainClient, url);
  }

  http.setTimeout(8000);
  http.addHeader("Authorization", String("Bearer ") + TERMINAL_KEY);
  http.addHeader("Accept", "application/json");

  int httpCode = http.GET();
  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (!error && doc["requests"].is<JsonArray>()) {
      JsonArray requests = doc["requests"].as<JsonArray>();
      if (requests.size() > 0) {
        JsonObject req = requests[0];
        String incomingId = req["id"].as<String>();
        if (incomingId.isEmpty() || !req["verification_code"].is<const char*>()) {
          currentState = STATE_ERROR;
          showErrorScreen("Please wait. Retrying.");
          http.end();
          return;
        }
        bool isNewRequest = (incomingId != currentRequestId) || (currentState != STATE_PENDING_CONFIRMATION);

        currentRequestId = incomingId;
        currentRentalCode = req["rental_code"] | "";
        currentItemName = req["item_name"] | "Equipment";
        currentTransactionType = req["transaction_type"] | "RENTAL";
        currentTerminalMode = req["terminal_mode"] | (currentTransactionType == "RETURN" ? "RETURN" : "HANDOVER");
        currentVerificationCode = req["verification_code"] | "";
        currentInspectionRevision = req["inspection_revision"] | 0;
        currentIsTest = req["is_test"] | false;

        currentState = STATE_PENDING_CONFIRMATION;
        digitalWrite(LED1_PIN, HIGH);

        if (isNewRequest) {
          // Require a new press for this request, never an earlier/held press.
          buttonTriggered = false;
          buttonArmed = digitalRead(BUTTON_PIN) == HIGH;
          Serial.printf("[POLL] New pending request: %s (%s) mode=%s\n", currentRentalCode.c_str(), currentRequestId.c_str(), currentTerminalMode.c_str());
          showPendingScreen(currentRentalCode, currentTransactionType, currentTerminalMode, currentItemName, currentVerificationCode);
          // Reconnects and failed polls may redraw the same request. Alert only
          // once per request; a refresh alone must never trigger a sound.
          if (incomingId != lastAlertedRequestId) {
            lastAlertedRequestId = incomingId;
            if (currentIsTest) soundHardwareTest();
            else soundAlert();
          }
        }
      } else {
        if (currentState != STATE_IDLE) {
          currentRequestId = "";
          currentState = STATE_IDLE;
          digitalWrite(LED1_PIN, LOW);
          digitalWrite(LED2_PIN, LOW);
          digitalWrite(FAIRY_LIGHT_PIN, LOW);
          showIdleScreen();
        }
      }
    } else {
      currentState = STATE_ERROR;
      buttonTriggered = false;
      digitalWrite(LED2_PIN, LOW);
      showErrorScreen("Please wait. Retrying.");
    }
  } else {
    Serial.printf("[HTTP] Poll failed, code: %d\n", httpCode);
    currentState = STATE_ERROR;
    buttonTriggered = false;
    digitalWrite(LED2_PIN, LOW);
    showErrorScreen(httpCode == 401 || httpCode == 403 ? "Ask staff for help." : "Please wait. Retrying.", httpCode);
  }
  http.end();
}

void postConfirmation() {
  currentState = STATE_CONFIRMING;
  showConfirmingScreen();

  HTTPClient http;
  String url = String(API_BASE_URL) + "/terminals/" + TERMINAL_ID + "/confirm";

  bool isHttps = String(API_BASE_URL).startsWith("https://");
  WiFiClientSecure secureClient;
  WiFiClient plainClient;

  if (isHttps) {
    secureClient.setInsecure();
    http.begin(secureClient, url);
  } else {
    http.begin(plainClient, url);
  }

  http.setTimeout(15000);
  http.addHeader("Authorization", String("Bearer ") + TERMINAL_KEY);
  http.addHeader("Content-Type", "application/json");

  JsonDocument bodyDoc;
  bodyDoc["requestId"] = currentRequestId;
  bodyDoc["action"] = "CONFIRM";
  bodyDoc["button"] = "OK";
  bodyDoc["verificationCode"] = currentVerificationCode;
  bodyDoc["inspectionRevision"] = currentInspectionRevision;

  String jsonBody;
  serializeJson(bodyDoc, jsonBody);

  int httpCode = http.POST(jsonBody);
  JsonDocument confirmation;
  bool accepted = false;
  if (httpCode == HTTP_CODE_OK) {
    DeserializationError error = deserializeJson(confirmation, http.getString());
    accepted = !error && confirmation["status"] == "CONFIRMED" &&
        confirmation["id"].as<String>() == currentRequestId;
  }
  if (accepted) {
    Serial.println("[HTTP] Confirmation succeeded!");
    currentState = STATE_SUCCESS;
    currentRequestId = "";
    showSuccessScreen();
    soundSuccess();
    digitalWrite(LED2_PIN, LOW);
    digitalWrite(FAIRY_LIGHT_PIN, LOW);
    currentState = STATE_IDLE;
    showIdleScreen();
    pollPendingRequests();
  } else {
    String err = http.getString();
    Serial.printf("[HTTP] Confirmation failed (%d): %s\n", httpCode, err.c_str());
    currentState = STATE_ERROR;
    currentRequestId = "";
    soundError();
    showErrorScreen("Could not verify.");
    delay(2500);
    currentState = STATE_ERROR;
  }
  http.end();
}

// =============================================================================
// 7. SETUP & MAIN LOOP
// =============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[BOOT] Rent & Play ESP32 Terminal Initializing...");

  pinMode(BUTTON_PIN, INPUT); // GPIO35 requires the external pull-up described above.
  attachInterrupt(digitalPinToInterrupt(BUTTON_PIN), handleButtonInterrupt, FALLING);
  pinMode(ACTIVE_BUZZER, OUTPUT);
  pinMode(PASSIVE_BUZZER, OUTPUT);
  pinMode(LED1_PIN, OUTPUT);
  pinMode(LED2_PIN, OUTPUT);
  pinMode(FAIRY_LIGHT_PIN, OUTPUT);

  digitalWrite(ACTIVE_BUZZER, LOW);
  digitalWrite(FAIRY_LIGHT_PIN, LOW);
  digitalWrite(LED1_PIN, LOW);
  digitalWrite(LED2_PIN, LOW);
  noTone(PASSIVE_BUZZER);

  // Initialize I2C and OLED Screen
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDRESS)) {
    Serial.println("[ERROR] SSD1306 OLED allocation failed. Check wiring!");
  } else {
    display.setTextWrap(false); // Keep long item/reference text on its own row.
    display.clearDisplay();
    display.display();
  }

  soundStartup();
  showConnectingScreen();

  // Connect to Wi-Fi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] Connected! IP address: ");
    Serial.println(WiFi.localIP());
    pollPendingRequests();
  } else {
    Serial.println("\n[WIFI] Failed to connect. Check SSID/Password.");
    showErrorScreen("Check Wi-Fi network.");
  }
}

void loop() {
  // 1. Maintain Wi-Fi connection
  if (WiFi.status() != WL_CONNECTED) {
    currentState = STATE_CONNECTING_WIFI;
    buttonTriggered = false;
    buttonArmed = false;
    showConnectingScreen();
    WiFi.reconnect();
    delay(1000);
    return;
  }

  // 2. Handle an existing request's button before starting a network check.
  unsigned long now = millis();
  bool pinLow = digitalRead(BUTTON_PIN) == LOW;
  // Interrupt noise by itself is not a physical press. Require the input to
  // remain low through debounce before acting (especially on external-pull-up GPIO35).
  if (buttonArmed && pinLow) {
    delay(30);
    pinLow = digitalRead(BUTTON_PIN) == LOW;
  }
  bool isPressed = buttonArmed && pinLow;
  buttonTriggered = false; // Reset interrupt latch
  if (!pinLow && !isPressed) buttonArmed = true;

  if (isPressed && (now - lastButtonPressTime > 250)) {
    lastButtonPressTime = now;
    buttonArmed = false;
    Serial.println("[BUTTON] Physical click detected on GPIO 35!");

    if (currentState == STATE_PENDING_CONFIRMATION && currentRequestId.length() > 0) {
      Serial.println("[BUTTON] Confirming pending verification request...");
      digitalWrite(LED1_PIN, LOW);
      digitalWrite(LED2_PIN, LOW); // Green indicates a confirmed response, not a button press.
      digitalWrite(FAIRY_LIGHT_PIN, HIGH);
      postConfirmation();
    } else if (currentState == STATE_IDLE) {
      Serial.println("[BUTTON] Terminal is idle, manual polling triggered.");
      pollPendingRequests();
    }
  }

  // 3. Refresh requests, including recovery from a lost connection or failed response.
  if (currentState == STATE_IDLE || currentState == STATE_PENDING_CONFIRMATION ||
      currentState == STATE_ERROR || currentState == STATE_CONNECTING_WIFI) {
    if (millis() - lastPollTime >= POLL_INTERVAL_MS) {
      pollPendingRequests();
      lastPollTime = millis();
    }
  }

  delay(20);
}
