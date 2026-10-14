/*
  Smart Battery Cap - ESP32-C3 SuperMini
  Float switch: GPIO 4 to GND, using INPUT_PULLUP
  LED: GPIO 6 through 220 ohm resistor to GND
  Active buzzer: GPIO 5 (direct drive only if its current is safe for ESP32 GPIO)
  OLED SSD1306 128x64 I2C: SDA GPIO 9, SCL GPIO 8 (as selected in this project)

  BLE service/characteristic UUIDs must match the React dashboard.
  Sensor assumption: LOW at GPIO 4 means the float switch is triggered/low water.
  Test the switch in safe water first. Verify polarity and chemical compatibility before any battery use.
*/
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define SDA_PIN 9
#define SCL_PIN 8
#define FLOAT_SENSOR_PIN 4
#define LED_PIN 6
#define BUZZER_PIN 5

#define SERVICE_UUID        "12345678-1234-1234-1234-123456789001"
#define CHARACTERISTIC_UUID "12345678-1234-1234-1234-123456789002"

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
BLECharacteristic *waterCharacteristic = nullptr;
bool deviceConnected = false;
bool previousLow = false;
unsigned long lastNotify = 0;
const unsigned long NOTIFY_INTERVAL_MS = 2000;

class BatteryServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    deviceConnected = true;
  }
  void onDisconnect(BLEServer *server) override {
    deviceConnected = false;
    BLEDevice::startAdvertising();
  }
};

void showStatus(bool waterLow) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(8, 5);
  display.println("SMART BATTERY CAP");
  display.drawLine(0, 18, 127, 18, SSD1306_WHITE);
  display.setCursor(8, 27);
  display.print("Water Level: ");
  display.println(waterLow ? "LOW" : "NORMAL");
  display.setCursor(8, 43);
  display.println(waterLow ? "ALERT: Check level" : "System is OK");
  display.setCursor(8, 55);
  display.print("BLE: ");
  display.println(deviceConnected ? "Connected" : "Advertising");
  display.display();
}

void setup() {
  pinMode(FLOAT_SENSOR_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  Wire.begin(SDA_PIN, SCL_PIN);
  bool oledReady = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  if (oledReady) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(8, 20);
    display.println("Starting BLE...");
    display.display();
  }

  BLEDevice::init("Smart Battery Cap");
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new BatteryServerCallbacks());
  BLEService *service = server->createService(SERVICE_UUID);

  waterCharacteristic = service->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_NOTIFY |
    BLECharacteristic::PROPERTY_WRITE
  );
  waterCharacteristic->addDescriptor(new BLE2902());
  waterCharacteristic->setValue("NORMAL");
  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();

  bool waterLow = (digitalRead(FLOAT_SENSOR_PIN) == LOW);
  previousLow = waterLow;
  digitalWrite(LED_PIN, waterLow ? HIGH : LOW);
  digitalWrite(BUZZER_PIN, waterLow ? HIGH : LOW);
  waterCharacteristic->setValue(waterLow ? "LOW" : "NORMAL");
  if (oledReady) showStatus(waterLow);
}

void loop() {
  bool waterLow = (digitalRead(FLOAT_SENSOR_PIN) == LOW);
  digitalWrite(LED_PIN, waterLow ? HIGH : LOW);
  digitalWrite(BUZZER_PIN, waterLow ? HIGH : LOW);

  if (waterLow != previousLow) {
    previousLow = waterLow;
    waterCharacteristic->setValue(waterLow ? "LOW" : "NORMAL");
    if (deviceConnected) waterCharacteristic->notify();
    showStatus(waterLow);
    lastNotify = millis();
  }

  // Repeat status periodically so a connected dashboard can recover after a missed notification.
  if (deviceConnected && millis() - lastNotify >= NOTIFY_INTERVAL_MS) {
    waterCharacteristic->setValue(waterLow ? "LOW" : "NORMAL");
    waterCharacteristic->notify();
    lastNotify = millis();
  }
  delay(100);
}
