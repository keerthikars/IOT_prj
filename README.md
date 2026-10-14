# Smart Battery Cap — BLE + Firebase dashboard

## Included files
- `src/main.jsx`: complete React dashboard, Web Bluetooth connection, status/history/alerts UI and optional Firebase uploads.
- `src/styles.css`: responsive light/dark dashboard styling.
- `esp32_firmware/Smart_Battery_Cap_BLE.ino`: ESP32-C3 firmware with float sensor, LED, buzzer, OLED and BLE notifications.
- `.env.example`: Firebase web config template.

## 1. Install and run dashboard
1. Extract this folder to a short path such as `D:\Battery proj\Smart-Battery-Cap-Full-Replacement`.
2. Open that folder in VS Code.
3. Open Terminal and run:
   ```bash
   npm install
   npm run dev
   ```
4. Open the `http://localhost:5173` URL shown by Vite in Chrome or Edge.
5. Click **Connect Smart Cap** and select `Smart Battery Cap`.

## 2. Upload ESP32 firmware
1. Install the ESP32 board package in Arduino IDE and select the ESP32-C3 board that matches your board.
2. Install libraries `Adafruit SSD1306` and `Adafruit GFX Library`.
3. The BLE APIs `BLEDevice.h`, `BLEServer.h`, `BLEUtils.h`, and `BLE2902.h` are supplied with the Espressif Arduino ESP32 core.
4. Open `esp32_firmware/Smart_Battery_Cap_BLE.ino`, verify the board pin labels, and upload.
5. Keep the service and characteristic UUIDs unchanged unless you also update the React code.

## 3. Enable Firebase cloud storage
1. Create a Firebase project at https://console.firebase.google.com/ and register a Web App.
2. Create a Realtime Database and copy the Web App configuration.
3. Copy `.env.example` to `.env` in the project root and fill in the values. `VITE_FIREBASE_DATABASE_URL` must be the exact database URL shown by Firebase.
4. Restart the Vite server after editing `.env` (`Ctrl+C`, then `npm run dev`).
5. Configure Firebase Authentication and secure Realtime Database rules before using this with real data. Do not leave public read/write rules enabled. If cloud is not configured, BLE monitoring still works locally.

## Data flow and limitations
- ESP32-C3 → BLE → browser dashboard → Firebase Realtime Database.
- Cloud uploads only happen while the dashboard is open, BLE is connected, and the laptop has internet. This setup does not provide independent cloud reporting while the laptop/browser is off.
- The float switch is a threshold sensor (LOW/NORMAL), not a continuous percentage sensor.
- Firmware assumes GPIO 4 reads LOW for the low-level condition. If your float switch is opposite, invert the `waterLow` condition in the `.ino` file.
- Firmware assumes OLED SDA=GPIO9 and SCL=GPIO8 as used in the recent wiring. Verify your soldered connections before upload.
- Do not connect the inverter battery voltage directly to ESP32. Do not put a generic float switch into battery electrolyte unless chemical compatibility and installation safety are confirmed. Preserve battery venting. This is an educational prototype, not a certified safety system.

## Suggested starter database rules
The `database.rules.json` file contains starter rules requiring Firebase Authentication. In Firebase Console, enable **Authentication → Sign-in method → Anonymous** before testing cloud writes. These are prototype rules: all signed-in users can read/write the shared `battery` path, so tighten them to your own user/device permissions before public deployment.
