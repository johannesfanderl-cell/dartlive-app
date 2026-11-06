#!/bin/bash
# Einmalig ausführen:  bash ~/dartlive/einrichten.sh
# Danach startet der Server im Terminal einfach mit:  dart
# Stürzt der Server ab, startet er nach 3 Sekunden von selbst neu. Beenden mit Strg + C.
MARK="# Dart Live Startbefehl"
if grep -q "$MARK" ~/.bashrc 2>/dev/null; then
  echo "Der Befehl 'dart' ist schon eingerichtet."
else
  cat >> ~/.bashrc <<'EOS'

# Dart Live Startbefehl
dart() {
  cd ~/dartlive || return
  echo "Dart Live startet … (Beenden mit Strg + C)"
  while true; do
    node server.js
    code=$?
    if [ $code -eq 130 ] || [ $code -eq 143 ]; then break; fi
    echo "Server wurde beendet (Code $code) – Neustart in 3 Sekunden …"
    sleep 3 || break
  done
}
EOS
  echo "Fertig! Bitte das Terminal schließen und neu öffnen. Danach startet der Server mit:  dart"
fi
