# Dart Live – App für die Tablets (TV Riedenburg)

Am Tablet läuft die Punkte-Eingabe, auf dem per HDMI angeschlossenen Monitor nur der Spielstand.
Die App braucht den Dart-Live-Server (Chromebook) im WLAN „TVR Dart“.

**Download der neuesten Version:** unter „Releases“ → `DartLive.apk`
(direkt: `https://github.com/<BENUTZER>/dartlive-app/releases/latest/download/DartLive.apk`)

Zwei Apps:
- DartLive.apk – Spielbetrieb (startet mit Server)
- DartTraining.apk – Trainingsmodus (startet ohne Server; Bestenliste dann nur auf dem Tablet)

„Ohne Server“ lässt sich in den Einstellungen beider Apps ein- und ausschalten.

Bedienung:
- Beim ersten Start: Scheibe (1–5) und Server-Adresse eintragen (Standard `http://192.168.68.222:3000`).
- Zurück-Taste: Menü mit „Neu laden“, „Einstellungen“, „App beenden“.

Die APK wird bei jeder Änderung automatisch von GitHub Actions gebaut (`.github/workflows/apk.yml`).
