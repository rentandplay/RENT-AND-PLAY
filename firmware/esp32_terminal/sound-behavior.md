# Terminal sounds

- A confirmed response for the current request plays the Jingle Bells chorus on the passive buzzer, for about six seconds. The success screen remains visible. The active buzzer stays off during the melody so its fixed pitch does not mask the notes. Requests resume after playback.
- Refreshes are silent. Each pending request sounds once per request ID during a boot session, including across temporary errors or reconnects.
- Idle button presses only refresh requests silently. A physical press requires a low input stable for 30 ms; an interrupt alone is not accepted. GPIO35 still requires its external 10k pull-up to 3.3V.
- A reboot can replay the startup sound or alert for a pending request. If idle buzzing continues after uploading this firmware, capture Serial logs and check the button pull-up, wiring and power supply to identify the cause.
- Remote sound settings are not implemented in this revision. They require firmware support plus an authenticated staff settings API/UI. Firmware can then apply server options for preinstalled melodies without another upload; new melodies or hardware behavior still require firmware support.

Compile validation does not upload the firmware or verify physical sound output. Upload the revised sketch and test the real terminal before release.
