# Local web, backend, and Android setup

The admin web app and backend run on the development computer. The Android app can connect through an emulator, USB forwarding, or the computer's Wi-Fi address. There is no hosted web target in this local setup.

## Start the backend

Use Node.js 22 or newer. In `apps/backend`, create `.env` from `.env.example` once, fill in the Firebase project ID, web API key, owner UID, and Firebase Admin credentials, then run:

```powershell
npm.cmd ci
npm.cmd run dev
```

The API listens on `http://localhost:3000/api`. Keep the credentials private and do not commit `.env`.

## Start the web app

In a second terminal, from `apps/web`, run:

```powershell
npm.cmd run dev
```

Open `http://localhost:5173`. The local web server proxies `/api` requests to the backend on port 3000.

## Connect Android

Use one of the local Android launch profiles in `.vscode/launch.json`, or run Flutter with the matching address:

```powershell
# Android emulator
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api

# Physical Android phone on the same Wi-Fi; replace with the computer's Wi-Fi IP
flutter run --dart-define=API_BASE_URL=http://192.168.1.4:3000/api
```

For USB or Wi-Fi runs, `AndroidFiles/scripts/local-android.ps1` can check the local catalog and launch the app. Keep the backend running and the phone connected to the same Wi-Fi when using that mode.

To install a debug APK that keeps using Wi-Fi after you unplug USB, connect the phone by USB for installation and run this from `AndroidFiles`:

```powershell
.\scripts\local-android.ps1 -Connection WiFi -BuildApk -Install
```

That APK points to the computer's Wi-Fi IP. After installation, USB is no longer needed for the API connection. Keep the computer and backend running, allow inbound TCP port 3000 on the computer's private network in Windows Firewall, and avoid guest Wi-Fi that blocks devices from reaching each other. Rebuild the APK if the computer's Wi-Fi IP changes. An APK built with `-Connection USB` depends on ADB forwarding and will lose its API connection when USB is unplugged.

## Firebase data

This setup runs the web app and API locally, but it still connects to the Firebase project configured in `apps/backend/.env`. Firestore reads and writes therefore still count against that project's quota. To keep all data local, the backend and Android configuration must be switched to Firebase Emulator Suite separately.
