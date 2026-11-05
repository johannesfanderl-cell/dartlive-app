# Dart Live – TV Riedenburg

Live-Eingabe an 5 Tablets und Anzeige auf den Fernsehern. Läuft ohne Internet im WLAN „TVR Dart“.

## Server starten (Chromebook, Linux-Terminal)

    cd ~/dartlive
    node server.js

Das Terminal-Fenster offen lassen. Beenden mit Strg + C.

## Adressen (Chromebook-IP 192.168.68.222, Port 3000)

- Tablet Scheibe 1–5:  http://192.168.68.222:3000/1  bis  /5
- Fernseher 1 (Scheiben 1–3):  http://192.168.68.222:3000/tv1
- Fernseher 2 (Scheiben 4–5):  http://192.168.68.222:3000/tv2
- Monitor an Scheibe 1–5 (nur Spielstand, für die App):  http://192.168.68.222:3000/m1  bis  /m5
- Alle 5 Scheiben:  http://192.168.68.222:3000/tv
- Auswahlseite:  http://192.168.68.222:3000/

## Am Tablet
Namen eingeben (zuletzt benutzte antippen), 301/501/701, Gewinn-Legs, Double Out, Beginner → Spiel starten.
Pro Aufnahme die Summe der 3 Darts eintippen und OK (oder Schnelltaste). Überworfen wird automatisch erkannt.
Bei Double Out fragt das Tablet beim Checkout, ob mit einem Doppel beendet wurde. Keine Checkout-Hinweise.
„Rückgängig“ nimmt die letzte Aufnahme zurück. Spielstände bleiben bei einem Server-Neustart erhalten.

## Training (am Tablet über „Training & Bestenliste“ oder direkt /t1 bis /t5)
JDC Challenge (offizielle Wertung), Around the Clock (Single/Double/Triple), Bob's 27,
Checkout-Training (ab 61/81/101/121, 10 Versuche), Count Up (10/20 Aufnahmen), Cricket, Swedish Killer.
1–6 Spieler. Ergebnisse landen in der Bestenliste (data/results.json).
Bestenliste für den Fernseher: http://192.168.68.222:3000/bestenliste

## Turnier (z. B. Vereinsmeisterschaft)
- Turnierleitung: http://192.168.68.222:3000/turnier  (Spieler eintragen, Gesetzte antippen, Gruppen auslosen, starten)
- Fernseher: http://192.168.68.222:3000/turnier-tv  (Tabellen, laufende/nächste Spiele, K.-o.-Baum)
- Die Tablets zeigen das zugeteilte Spiel automatisch an („… beginnt“ nach dem Ausbullen antippen).
  Das Ergebnis geht nach Spielende automatisch an die Turnierleitung, danach wird das nächste Spiel zugeteilt.
- Ergebnisse können in der Turnierleitung korrigiert oder Spiele zurückgesetzt werden.

## Liga-Heimspiel (6 Einzel, 3 Doppel, 6 Einzel – Spielbericht Bezirk Niederbayern)
- Verwaltung: http://192.168.68.222:3000/liga  (Teams, 6 Spieler je Team mit Pass-Nr., Doppel festlegen, Auswechslungen)
- Fernseher: http://192.168.68.222:3000/liga-tv   ·   Spielbericht zum Drucken/PDF: http://192.168.68.222:3000/liga-bericht
- Die Tablets bekommen die Spiele automatisch zugeteilt (Doppel erst nach Spiel 1–6, Spiele 10–15 nach den Doppeln).

## Statistik
- http://192.168.68.222:3000/statistik  (Average, 100+/140+/180, High Finish, bestes Leg, Saison/Spielart filtern)
- Ehrentafel für den Fernseher: http://192.168.68.222:3000/statistik-tv
- Beim Checkout fragt das Tablet, mit dem wievielten Dart gecheckt wurde (für den genauen Average).
