#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
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
// Push Button: D35 (Active LOW with INPUT_PULLUP)
#define BUTTON_PIN       35

// Buzzers: Active Buzzer on D32, Passive Buzzer on D23
#define ACTIVE_BUZZER    32
#define PASSIVE_BUZZER   23

// Status LEDs: LED1 on D27, LED2 on D14
#define LED1_PIN         27
#define LED2_PIN         14

// =============================================================================
// 2. NETWORK & TERMINAL CONFIGURATION
// =============================================================================
const char* WIFI_SSID = "PLDTHOMEFIBR61930";
const char* WIFI_PASSWORD = "PLDTWIFIwu5ft";

// IP address of your laptop running the backend server (detected: 192.168.1.4)
const char* API_BASE_URL = "http://192.168.1.4:3000/api";

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
String currentRentalCode = "";
String currentItemName = "";
String currentTransactionType = "";
String currentTerminalMode = "";
String currentVerificationCode = "";
int currentInspectionRevision = 0;

unsigned long lastPollTime = 0;
const unsigned long POLL_INTERVAL_MS = 3000;

// Button debouncing (Active LOW: unpressed = HIGH, pressed = LOW)
int lastButtonReading = HIGH;
int stableButtonState = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long DEBOUNCE_DELAY_MS = 40;

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
  beep(1000, 120);
  delay(50);
  digitalWrite(LED2_PIN, HIGH);
  beep(1500, 150);
  digitalWrite(LED1_PIN, LOW);
  digitalWrite(LED2_PIN, LOW);
}

void soundAlert() {
  for (int i = 0; i < 2; i++) {
    digitalWrite(LED1_PIN, HIGH);
    beep(2000, 180);
    digitalWrite(LED1_PIN, LOW);
    delay(80);
  }
  digitalWrite(LED1_PIN, HIGH);
}

void soundSuccess() {
  digitalWrite(LED1_PIN, LOW);
  digitalWrite(LED2_PIN, HIGH);
  beep(1200, 120);
  delay(60);
  beep(1800, 250);
}

void soundError() {
  digitalWrite(LED1_PIN, HIGH);
  digitalWrite(LED2_PIN, LOW);
  beep(400, 400);
  digitalWrite(LED1_PIN, LOW);
}

// =============================================================================
// 5. OLED DISPLAY SCREENS
// =============================================================================
void showConnectingScreen() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("RENT & PLAY TERMINAL");
  display.println("--------------------");
  display.println("Connecting to Wi-Fi:");
  display.println(WIFI_SSID);
  display.println("\nPlease wait...");
  display.display();
}

void showIdleScreen() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("== RENT & PLAY ==");
  display.println("Counter Kiosk Station");
  display.println("--------------------");
  display.print("Terminal: ");
  display.println(TERMINAL_ID);
  display.print("Wi-Fi IP: ");
  display.println(WiFi.localIP());
  display.println("Status: READY / IDLE");
  display.display();
}

void showPendingScreen(const String& code, const String& type, const String& mode, const String& itemName, const String& pin) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  if (mode == "SHOP_DISPATCH") {
    display.println("! RESORT DISPATCH !");
  } else if (type == "RETURN") {
    display.println("! RETURN INTAKE !");
  } else {
    display.println("! COUNTER HANDOVER !");
  }
  display.println("--------------------");
  String cleanItem = itemName.length() > 20 ? itemName.substring(0, 20) : itemName;
  display.println(cleanItem.length() > 0 ? cleanItem : "Equipment Unit");
  display.print("ID: ");
  display.println(code);
  display.print("PIN: ");
  display.println(pin);
  display.println("[PRESS GPIO35 BUTTON]");
  display.display();
}

void showConfirmingScreen() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 10);
  display.println("   CONFIRMING...    ");
  display.println("--------------------");
  display.println("Sending confirmation");
  display.println("to cloud database...");
  display.display();
}

void showSuccessScreen() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 5);
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

void showErrorScreen(const String& errMessage) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("   ! ERROR OCCURRED !");
  display.println("--------------------");
  display.println(errMessage);
  display.println("\nRetrying idle state...");
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

  WiFiClient client;
  HTTPClient http;
  String url = String(API_BASE_URL) + "/terminals/" + TERMINAL_ID + "/pending";

  http.begin(client, url);
  http.addHeader("Authorization", String("Bearer ") + TERMINAL_KEY);
  http.addHeader("Accept", "application/json");

  int httpCode = http.GET();
  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (!error) {
      JsonArray requests = doc["requests"].as<JsonArray>();
      if (requests.size() > 0) {
        JsonObject req = requests[0];
        String incomingId = req["id"].as<String>();
        bool isNewRequest = (incomingId != currentRequestId) || (currentState != STATE_PENDING_CONFIRMATION);

        currentRequestId = incomingId;
        currentRentalCode = req["rental_code"] | "";
        currentItemName = req["item_name"] | "Equipment";
        currentTransactionType = req["transaction_type"] | "RENTAL";
        currentTerminalMode = req["terminal_mode"] | (currentTransactionType == "RETURN" ? "RETURN" : "HANDOVER");
        currentVerificationCode = req["verification_code"] | "";
        currentInspectionRevision = req["inspection_revision"] | 0;

        currentState = STATE_PENDING_CONFIRMATION;
        digitalWrite(LED1_PIN, HIGH);

        if (isNewRequest) {
          Serial.printf("[POLL] New pending request: %s (%s) mode=%s\n", currentRentalCode.c_str(), currentRequestId.c_str(), currentTerminalMode.c_str());
          soundAlert();
          showPendingScreen(currentRentalCode, currentTransactionType, currentTerminalMode, currentItemName, currentVerificationCode);
        }
      } else {
        if (currentState != STATE_IDLE) {
          currentRequestId = "";
          currentState = STATE_IDLE;
          digitalWrite(LED1_PIN, LOW);
          digitalWrite(LED2_PIN, LOW);
          showIdleScreen();
        }
      }
    }
  } else {
    Serial.printf("[HTTP] Poll failed, code: %d\n", httpCode);
  }
  http.end();
}

void postConfirmation() {
  currentState = STATE_CONFIRMING;
  showConfirmingScreen();

  WiFiClient client;
  HTTPClient http;
  String url = String(API_BASE_URL) + "/terminals/" + TERMINAL_ID + "/confirm";

  http.begin(client, url);
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
  if (httpCode == HTTP_CODE_OK) {
    Serial.println("[HTTP] Confirmation succeeded!");
    currentState = STATE_SUCCESS;
    currentRequestId = "";
    soundSuccess();
    showSuccessScreen();
    delay(2500);
    digitalWrite(LED2_PIN, LOW);
    currentState = STATE_IDLE;
    showIdleScreen();
  } else {
    String err = http.getString();
    Serial.printf("[HTTP] Confirmation failed (%d): %s\n", httpCode, err.c_str());
    currentState = STATE_ERROR;
    currentRequestId = "";
    soundError();
    showErrorScreen("Failed: HTTP " + String(httpCode));
    delay(2500);
    currentState = STATE_IDLE;
    showIdleScreen();
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

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(ACTIVE_BUZZER, OUTPUT);
  pinMode(PASSIVE_BUZZER, OUTPUT);
  pinMode(LED1_PIN, OUTPUT);
  pinMode(LED2_PIN, OUTPUT);

  digitalWrite(ACTIVE_BUZZER, LOW);
  digitalWrite(LED1_PIN, LOW);
  digitalWrite(LED2_PIN, LOW);
  noTone(PASSIVE_BUZZER);

  // Initialize I2C and OLED Screen
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDRESS)) {
    Serial.println("[ERROR] SSD1306 OLED allocation failed. Check wiring!");
  } else {
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
    currentState = STATE_IDLE;
    showIdleScreen();
    pollPendingRequests();
  } else {
    Serial.println("\n[WIFI] Failed to connect. Check SSID/Password.");
    showErrorScreen("Wi-Fi Connection Failed!");
  }
}

void loop() {
  // 1. Maintain Wi-Fi connection
  if (WiFi.status() != WL_CONNECTED) {
    showConnectingScreen();
    WiFi.reconnect();
    delay(1000);
    return;
  }

  // 2. Poll backend every 3s in IDLE or PENDING_CONFIRMATION state (keeps heartbeat alive & syncs queue)
  if (currentState == STATE_IDLE || currentState == STATE_PENDING_CONFIRMATION) {
    unsigned long now = millis();
    if (now - lastPollTime >= POLL_INTERVAL_MS) {
      lastPollTime = now;
      pollPendingRequests();
    }
  }

  // 3. Handle Physical Button (GPIO 35 Active LOW)
  int reading = digitalRead(BUTTON_PIN);

  if (reading != lastButtonReading) {
    lastDebounceTime = millis();
  }
  lastButtonReading = reading;

  if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY_MS) {
    if (reading != stableButtonState) {
      stableButtonState = reading;

      // Button pressed (LOW)
      if (stableButtonState == LOW) {
        Serial.println("[BUTTON] Physical button pressed (GPIO 35 LOW)!");
        beep(1000, 120); // Immediate audible click feedback

        // If currently idle, poll immediately in case a request was just dispatched on the web
        if (currentState == STATE_IDLE) {
          pollPendingRequests();
        }

        if (currentState == STATE_PENDING_CONFIRMATION && currentRequestId.length() > 0) {
          Serial.println("[BUTTON] Confirming pending verification request...");
          digitalWrite(LED1_PIN, LOW);
          digitalWrite(LED2_PIN, HIGH);
          postConfirmation();
        } else {
          Serial.println("[BUTTON] No pending verification request in queue right now.");
        }
      }
    }
  }

  delay(15);
}
