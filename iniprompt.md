# Rolle & Ziel
Du agierst als Senior Fullstack Entwickler. Ziel ist die Erstellung eines eigenen Node.js Projekts namens "SonosLoxoneBridge", das die veraltete "node-sonos-http-api" ersetzt. Das Projekt läuft lokal als Docker-Container und steuert Sonos-Geräte direkt im LAN (keine Sonos-Cloud API!).

## Architektur & Tech-Stack
- **Backend:** Node.js (Express oder Fastify)
- **Sonos-Anbindung:** Da Sonos keine offizielle lokale API anbietet, nutze eine etablierte, moderne UPnP-Bibliothek wie `@svrooij/sonos` für die direkte LAN-Kommunikation mit den Speakern.
- **Frontend:** Schlichtes UI (Status, Play/Pause, Volume) + Settings Panel (Ports, Loxone-UDP-IP, Logging-Konfiguration)
- **Persistenz:** Config-Dateien (JSON) lokal speichern (wichtig für Docker-Volume-Mapping!)

## Anforderungen (Inbound von Loxone -> Bridge)
Per HTTP (Unterstützung von GET-Requests für 100%ige Abwärtskompatibilität zu bestehenden Loxone-Strukturen):
- `/<raum>/volume/<wert>` (Unterstützung von relativen Werten wie +1, -5 sowie Absolutwerten wie 30)
- `/<raum>/play` und `/<raum>/pause`
- `/<raum>/favorite/<name>` (Favoriten lokal abrufen und playback starten)
- `/<raum>/say/<text>/<volume>` (TTS-Integration via z.B. `google-tts-api`. Die Bridge muss den Text in ein MP3 umwandeln, dieses temporär via HTTP bereitstellen und dem Sonos-Speaker die lokale URL zum Abspielen übergeben).

## Anforderungen (Outbound von Bridge -> Loxone)
Per UDP-Befehl an die in den Settings hinterlegte Loxone-Miniserver-IP (Virtual Input):
- Playback-Status (Digital 1/0) bei Statusänderung senden
- Aktuelle Lautstärke bei Änderung senden
- Feature: Export-Funktion einer `Loxone-ExportXML` zur einfachen Einbindung der virtuellen Eingänge in Loxone (Beispielstruktur liegt in ./examples).

## Dev-Guidelines
- Git ist initialisiert, Remote Repo: https://github.com/bausi2k/SonosLoxoneBridge
- Erstelle eine passende `.gitignore` für Node.js/Docker.
- Führe eine `CHANGES.md` für alle Anpassungen.
- Schreibe saubere, für Menschen lesbare Kommentare.
- Bei Unklarheiten stelle kurze, prägnante Fragen mit Beispielen. Keine ausschweifenden Erklärungen.