#!/bin/bash
# Dart Live auf einem Raspberry Pi (oder anderem Debian/Ubuntu-Rechner) einrichten.
#
# Einrichten UND später aktualisieren – immer derselbe Befehl (Internet nötig):
#   curl -fsSL https://raw.githubusercontent.com/johannesfanderl-cell/dartlive-app/main/server/installieren.sh | bash
#
# Danach startet Dart Live bei jedem Einschalten von selbst (Port 3000).
# Die Daten im Ordner ~/dartlive/data bleiben bei Aktualisierungen erhalten.

set -e
REPO="johannesfanderl-cell/dartlive-app"
ZIEL="$HOME/dartlive"
NUTZER="$(id -un)"

say() { printf '\n\033[1;34m== %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mFehler: %s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" = "0" ] && fail "Bitte als normaler Benutzer starten (nicht mit sudo) – das Skript fragt selbst nach dem Passwort."
command -v sudo >/dev/null || fail "sudo fehlt."
command -v apt-get >/dev/null || fail "Dieses Skript ist für Raspberry Pi OS, Debian oder Ubuntu."

# ---------- 1. Programm holen ----------
say "Dart Live herunterladen"
QUELLE=""
HIER=""
# nur wenn das Skript als Datei gestartet wurde (bash installieren.sh), nicht per curl | bash
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; fi
if [ -n "$HIER" ] && [ -f "$HIER/server.js" ] && [ -d "$HIER/public" ]; then
  QUELLE="$HIER"
  echo "Verwende die Dateien aus $QUELLE"
else
  command -v curl >/dev/null || { sudo apt-get update -qq && sudo apt-get install -y -qq curl; }
  TMP="$(mktemp -d)"
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/main" -o "$TMP/dl.tgz" || fail "Download fehlgeschlagen – ist der Rechner mit dem Internet verbunden?"
  tar xzf "$TMP/dl.tgz" -C "$TMP"
  QUELLE="$(ls -d "$TMP"/*/server)"
  [ -f "$QUELLE/server.js" ] || fail "Im Download fehlt server.js."
fi
mkdir -p "$ZIEL"
if [ "$QUELLE" != "$ZIEL" ]; then
  # alles außer den Daten übernehmen
  (cd "$QUELLE" && tar cf - --exclude=./data .) | (cd "$ZIEL" && tar xf -)
fi
mkdir -p "$ZIEL/data"
echo "Installiert in $ZIEL"

# ---------- 2. Node.js ----------
say "Node.js prüfen"
node_ok() { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 18 ]; }
if ! node_ok; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq nodejs || true
fi
if ! node_ok; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
node_ok || fail "Node.js konnte nicht installiert werden."
NODE="$(command -v node)"
echo "Node.js $(node -v)"

# ---------- 3. Rechte: Uhr stellen und Ausschalten über die Verwaltungsseite ----------
say "Rechte für Uhrzeit und Ausschalten"
REGEL="/etc/sudoers.d/dartlive"
TMPR="$(mktemp)"
echo "$NUTZER ALL=(root) NOPASSWD: /usr/bin/date, /usr/bin/systemctl poweroff" > "$TMPR"
if sudo visudo -cf "$TMPR" >/dev/null; then
  sudo install -m 0440 "$TMPR" "$REGEL"
  echo "ok"
else
  echo "Hinweis: Regel konnte nicht geprüft werden – Uhr stellen und Ausschalten per Knopf gehen dann nicht."
fi
rm -f "$TMPR"

# ---------- 4. Dienst: startet bei jedem Einschalten ----------
say "Autostart einrichten"
sudo tee /etc/systemd/system/dartlive.service >/dev/null <<EOF
[Unit]
Description=Dart Live TV Riedenburg
After=network.target

[Service]
User=$NUTZER
WorkingDirectory=$ZIEL
Environment=PORT=3000
Environment=DART_PI=1
ExecStart=$NODE server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable dartlive >/dev/null 2>&1
sudo systemctl restart dartlive
sleep 2
if systemctl is-active --quiet dartlive; then echo "Dart Live läuft."; else echo "Dart Live startet nicht – Details: sudo journalctl -u dartlive -n 30"; fi

# ---------- 5. WLAN „TVR Dart“ ----------
if command -v nmcli >/dev/null && nmcli -t -f DEVICE,TYPE device 2>/dev/null | grep -q ':wifi$'; then
  if nmcli -t -f NAME connection show 2>/dev/null | grep -qx "TVR Dart"; then
    say "WLAN „TVR Dart“ ist schon eingetragen"
  elif [ -r /dev/tty ]; then
    say "WLAN „TVR Dart“ eintragen"
    printf 'Passwort für das WLAN „TVR Dart“ (leer lassen = überspringen): '
    read -r PW < /dev/tty || PW=""
    if [ -n "$PW" ]; then
      DEV="$(nmcli -t -f DEVICE,TYPE device | awk -F: '$2=="wifi"{print $1; exit}')"
      sudo nmcli connection add type wifi ifname "$DEV" con-name "TVR Dart" ssid "TVR Dart" \
        wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PW" \
        connection.autoconnect yes connection.autoconnect-priority 10 \
        802-11-wireless.cloned-mac-address permanent >/dev/null \
        && echo "Eingetragen. Im Vereinskeller verbindet sich der Pi von selbst."
    fi
  fi
fi

# ---------- 6. Zusammenfassung ----------
say "Fertig"
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "Dart Live jetzt erreichbar unter:  http://${IP:-<IP>}:3000"
echo
echo "Für den Router (feste IP 192.168.68.222 reservieren) – MAC-Adresse(n) dieses Geräts:"
for d in /sys/class/net/*; do
  n="$(basename "$d")"; [ "$n" = "lo" ] && continue
  case "$n" in wlan*|wlp*) art="WLAN";; eth*|enp*|end*) art="LAN-Kabel";; *) continue;; esac
  echo "  $art ($n):  $(cat "$d/address")"
done
echo
echo "Nützlich:  sudo systemctl status dartlive    (läuft er?)"
echo "           sudo journalctl -u dartlive -f    (Meldungen ansehen)"
echo "           sudo systemctl restart dartlive   (neu starten)"
