# Dry-Fire Aim Coach

Android-Chrome–first web app for tracking aim stability during dry-fire practice with a laser bore sighter and a WitMotion BLE accelerometer.

## How it works
- **Camera** uses the rear camera (`getUserMedia`) and tracks the bright red laser dot via a centroid-weighted red-dominance filter.
- **Microphone** listens for the sharp transient of the trigger click (peak ≫ rolling baseline).
- **Bluetooth Low Energy** connects to a WitMotion BWT901BLE5.0 / WT901BLE sensor (service `0000ffe5-…`, notify `0000ffe4-…`) and parses the default `0x55 0x61` packet for accel + gyro.
- A shot is registered when either the mic or the IMU detects a click; the app records the laser-to-target deviation and a "jerk" score from recent gyro magnitude.

## Requirements
- **Android Chrome** (Web Bluetooth is enabled on Android Chrome; not available on iOS Safari or desktop Firefox).
- HTTPS (GitHub Pages provides this by default).
- A WitMotion BLE sensor in default output mode.
- A red laser bore sighter (other colors will need a color threshold change).

## Usage
1. Open the GitHub Pages URL on your Android phone in Chrome.
2. Tap **Camera** and grant permission. Aim the phone so the bore-sight laser shows on a wall/target.
3. Tap **Mic** and grant permission.
4. Tap **BLE IMU**, pick your WitMotion sensor from the chooser, and confirm.
5. Tap the video to set the bullseye, then squeeze the trigger.

## Known Android Chrome limitations
- Web Bluetooth on Android Chrome requires Location permission to scan; you may see an OS-level prompt.
- Some Android builds throttle BLE notifications in the background — keep the tab in the foreground and screen on.
- iOS (Safari/Chrome) does **not** support Web Bluetooth — this app won't connect to BLE on iPhone/iPad.
- If your specific WitMotion variant uses non-default UUIDs or a custom protocol, the GATT discovery will fail; the app will surface a clear error instead of silently failing.
