# Changes SonosLoxoneBridge

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/bausi2k)

## [0.4.1] - 2026-05-28
- **Persistierung & Docker-Verbesserungen**:
  - Hinzufügen von Volume-Mappings für `/app/presets` (Gruppen-Presets) und `/app/public/clips` (eigene Audio-Benachrichtigungen) in `docker-compose.yml`, um Datenverlust beim Neuerstellen des Containers zu verhindern.
  - Entfernung des veralteten `version`-Tags in `docker-compose.yml`.
  - Aktualisierung der `README.md` zur exakten Übereinstimmung mit der neuen Docker-Compose-Struktur.
  - Einbindung des "Buy Me A Coffee"-Spendenbuttons in die `README.md` und `CHANGES.md`.

## [0.4.0] - 2026-05-28
- **Interaktiver Raum-Alias-Manager**:
  - Ersatz des JSON-Textfeldes in den Einstellungen durch eine benutzerfreundliche UI mit Dropdown-Auswahl der Lautsprecher und Direkt-Eingabe.
  - Live-Syntaxprüfung für zulässige Zeichen (nur Alphanumerisch und Unterstriche) bei Alias-Namen.
  - Dynamisches Hinzufügen und Entfernen von Mappings direkt im Webinterface.
- **GitHub Actions Workflow für Container-Build**:
  - Automatisches Erstellen von Multi-Plattform Docker-Images (`amd64`, `arm64`) bei Tag-Push und Veröffentlichung in der GitHub Packages Registry (`ghcr.io`).
  - Automatisches Erstellen von Releases basierend auf den Änderungseinträgen in `CHANGES.md`.
- **Behebung von Test-Hängern**:
  - Fehlerbehebung bei der Testausführung, indem Sleep-Timer aus Presets beim Beenden der Test-Suite gecancelt werden.

## [0.3.0] - 2026-05-27
- **Robustes Offline-Handling für batteriebetriebene Lautsprecher**:
  - Automatisches Erkennen von Netzwerk-Timeouts (`ETIMEDOUT`, `EHOSTUNREACH`, `ECONNREFUSED` etc.) bei batteriebetriebenen Lautsprechern.
  - Implementierung eines exponentiellen Backoffs (Polling-Aussetzung), um die Batterien zu schonen.
  - Verhinderung von API-Hängern (z. B. bei Favoriten-Abfragen) durch sofortige Rückgabe leerer Ergebnisse für Offline-Geräte.
  - Integration von Platzhaltern für statisch definierte Lautsprecher, die beim Systemstart offline sind.
- **Erweiterte Loxone- & Preset-Integration**:
  - Unterstützung von jishi-Presets zur Definition von Raumgruppen, Lautstärken, Wiedergabemodi und Sleep-Timern via UI und API.
  - Neue Inbound-Befehle wie `/tunein/play/:stationId`, `/leave`, `/clip/:file/:volume?` und preset-gestützte API.
- **Stabilisierung der Testumgebung**:
  - Vermeidung von Race Conditions bei asynchronen Hintergrund-Updates und Optimierung der Test-Lifecycle-Isolation.

## [0.2.0] - 2026-05-26
- **Mobiles Responsive Design**:
  - Optimierung des Player-Layouts für schmale Mobilgeräte (wie iPhone 17 Pro und iPhone SE) zur Behebung von horizontalem Überlaufen.
  - Implementierung eines automatischen vertikalen Stackings der Footer-Aktionen (`favorites-dropdown` und `btn-tts-trigger`) auf Handys.
  - Skalierung und Anpassung der Buttons sowie Abstände in der Steuerungskomponente (`.media-controls-section`) auf mobilen Viewports.
  - Absicherung der Tab-Navigation auf mobilen Endgeräten gegen unerwünschte Zeilenumbrüche.
- **Fehlerbehebungen**:
  - Korrektur von CSS play-pause Button-Overrides (Behebung der Desktop `!important` Sperre in mobilen CSS-Stilen).

## [0.1.0] - 2026-05-21
- Initialisiertes Git-Repository auf Branch `feature/bridge-implementation`.
- Erstellte `.gitignore` für Node.js/Docker.
- Konfigurierte `.gitkeep` für temporäre TTS-Verzeichnisse.
- Implementiert: Settings-Verwaltung (`src/settings.js`) zur JSON-basierten Einstellungs-Persistierung (Standard-Port 8888, standardmäßig Deutsch).
- Hinzugefügt: Unit-Tests für Settings (`tests/settings.test.js`).
- Implementiert: Loxone-Integration (`src/loxone.js`) zum Senden von UDP-Status-Paketen an Loxone (Play-Zustand und Volume-Änderungen) und zur Generierung der Loxone XML-Import-Vorlage für virtuelle Eingänge.
- Hinzugefügt: Unit-Tests für Loxone (`tests/loxone.test.js`).
- Implementiert: TTS-Synthese (`src/tts.js`) zur Umwandlung von Ansagetexten in MP3-Dateien (mit automatischer Begrenzung auf 200 Zeichen) und automatischem Bereinigungs-Job zur Vermeidung von Speicherüberlauf.
- Hinzugefügt: Unit-Tests für TTS (`tests/tts.test.js`).
- Implementiert: Sonos-Integration (`src/sonos.js`) zur Verwaltung der Lautsprecher via SSDP Auto-Discovery oder statischen IPs, Durchführung von Aktionen (Play, Pause, relative/absolute Lautstärke, Favoriten-Wiedergabe, TTS-Ausgabe via `PlayNotification`) sowie Hintergrund-Status-Polling.
- Hinzugefügt: Unit-Tests für Sonos (`tests/sonos.test.js`).
- Implementiert: Express-Server (`src/app.js`) zur Bereitstellung der Loxone HTTP GET API und der Frontend REST API (Status, Settings, Favoriten-Auflistung, manuelle Steuerung, XML-Vorlage-Download). Integriert automatischen TTS-Bereinigungs-Job.
- Hinzugefügt: Integrationstests für Express-Routen (`tests/app.test.js`) inkl. `/api/control` Post-Endpoint.
- Implementiert: Premium Web-Interface Logik (`public/js/app.js`) mit Status-Polling, Slider-Debouncing, TTS-Modal und Einstellungs-Validierung.
- Implementiert: Containerisierung mit `Dockerfile` und `docker-compose.yml` (für `network_mode: host` and Volumen-Mapping).
- Aktualisiert: `.gitignore` zur Berücksichtigung des `examples/`-Ordners.
- Hinzugefügt: Ausführliche und strukturierte `README.md`-Dokumentation im Projekt-Root.
- Aktualisiert: Node.js-Basis-Image im `Dockerfile` auf Version `24-alpine`.
- Behoben: Problem im Sonos-Treiber (`src/sonos.js`), bei dem die Lautstärke nicht abgerufen werden konnte (da die Methode `device.GetVolume` nicht existiert und stattdessen `device.RenderingControlService.GetVolume` verwendet werden muss).
- Behoben: Fehler im Frontend (`public/js/app.js`), durch den der Lade-Spinner dauerhaft angezeigt wurde. Die Suche läuft nun manuell per Klick auf den Aktualisierungs-Button.

