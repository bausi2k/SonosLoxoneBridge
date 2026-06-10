# Changes SonosLoxoneBridge

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/bausi2k)

## [0.5.9] - 2026-06-10
- **Gruppen- und Preset-Verbesserungen**:
  - **Gruppen-Visualisierung im UI**: Anzeige von Gruppierungsstatus und Mitgliedern direkt auf den Lautsprecherkarten im UI (Link-Symbol für Gruppenmitglieder mit Verweis auf den Koordinator; Gruppen-Symbol für Koordinatoren mit Angabe der Anzahl der Mitglieder).
  - **Preset-Steuerung per HTTP-GET**: Unterstützung für die direkte Steuerung von Preset-Gruppen über den Pfad `/:preset_name/say` (und andere Inbound-Befehle). Die Bridge leitet Befehle, die an einen Preset-Namen gerichtet sind, automatisch an das als Koordinator definierte Gerät weiter.
  - **Presets editieren**: Hinzufügen einer Bearbeiten-Schaltfläche (Edit) bei den Preset-Karten, um bestehende Gruppenkonfigurationen direkt im Editor-Formular anzupassen.

## [0.5.8] - 2026-06-03
- **Dynamische Dokumentation für Sonos-Favoriten**:
  - Dynamisches Auslesen und Anzeigen aller Sonos-Systemfavoriten direkt innerhalb der GET-Favoritendokumentation im "Anleitung"-Tab.
  - Bereitstellung von direkt klickbaren und kopierbaren HTTP-GET-Links mit den exakten, URL-kodierten Namen deiner Favoriten (inklusive Sonderzeichen wie Klammern, Umlauten und des Grad-Zeichens `°`).

## [0.5.7] - 2026-06-03
- **Bugfix für Dropdown-Chevrons im Darkmode**:
  - CSS-Fehler behoben, bei dem das Dropdown-Pfeilsymbol (Carrot) im Darkmode sich über die gesamte Breite des Select-Feldes wiederholte.
  - Umstellung des CSS-Shorthands `background` auf `background-color` bei `.dark-mode .form-group select` und dessen `:focus`-Zustand, um das Zurücksetzen von SVG-Hintergrundeigenschaften (`background-repeat`, `background-position`) zu verhindern.

## [0.5.6] - 2026-06-03
- **Priorisierte Befehlswarteschlange (Priority Queue)**:
  - Implementierung einer raumweisen sequentiellen Befehlswarteschlange zur Vermeidung von UPnP-Koncurrency-Konflikten bei hochfrequenten Aufrufen (z. B. schnellen TTS-Sprachansagen).
  - Unterstützung für Priorisierung über den URL-Parameter `?prio=true` / `?prio=1` bei HTTP GET und `"priority": true` / `"prio": true` bei HTTP POST (Befehl reiht sich vorne in die Warteschlange ein).
  - Sofortiger Abbruch und Bereinigung aller ausstehenden Befehle bei Eingang eines `pause`-Befehls.
  - Erweiterung der API-Dokumentation im Web-UI zur Erläuterung der Warteschlange und der Priorisierung.

## [0.5.5] - 2026-05-31
- **Bugfix für mobile Layout-Verschiebung (iOS/WebKit)**:
  - Behebung von horizontalem Überlauf (Scrollview) auf dem iPhone durch das Hinzufügen von Layout-Einschränkungen (`min-width: 0`, `box-sizing: border-box`) für die Lautsprecher-Karten und deren Footer.
  - Dynamische Anpassung des Lautstärke-Schiebereglers und des Spalten-Grids auf kleinen Viewports mittels modernem CSS (`minmax(min(100%, 320px), 1fr)`).

## [0.5.4] - 2026-05-30
- **Paralleles Polling, Pause-Robustheit & CSS-Optimierungen**:
  - Umstellung des Hintergrund-Pollings auf `Promise.allSettled()`, damit Timeouts von Offline-Geräten nicht das gesamte Polling blockieren.
  - Fehlerbehandlung bei `/pause` für bereits gestoppte oder Live-Stream abspielende Lautsprecher (Abfangen von UPnPError `701` mit automatischem Fallback auf `Stop`).
  - Webkit CSS-Verbesserungen für Safari/Chrome: Hardware-Beschleunigung für Glassmorphism-Karten, flüssigere Schieberegler-Aktualisierungen und einheitliche Scrollbars.

## [0.5.3] - 2026-05-29
- **Favoriten-Wiedergabe mit absoluter Lautstärke**:
  - Unterstützung für optionale absolute Lautstärke beim Abspielen von Favoriten (`/:raum/favorite/:name/:volume?`).
  - Einstellen der Lautstärke vor dem Abspielen des Favoriten-Streams, um unerwünschtes anfängliches Aufbrüllen zu vermeiden.
  - Dokumentation und dynamischer Befehls-Generator im UI um den Lautstärkeparameter erweitert.

## [0.5.2] - 2026-05-29
- **Längeres Synchronisations-Intervall & Polling-Sperrlogik**:
  - Das periodische Update-Intervall für Loxone UDP-Daten wurde auf 30 Sekunden erhöht.
  - Implementierung einer Selbstsperrlogik (`isPolling`), um konkurrierende Update-Zyklen bei Netzwerkverzögerungen oder langsamen Lautsprecher-Antworten auszuschließen.

## [0.5.1] - 2026-05-29
- **Ausschluss von Bild-Proxy-Anfragen aus den Logs**:
  - `/api/art` Anfragen werden nicht mehr im System-Protokoll registriert, um ein Zuspielen/Spammen durch das automatische UI-Polling zu vermeiden.

## [0.5.0] - 2026-05-29
- **TuneIn S2-Support, Lautsprecher-Befehlsübersicht & Log-Verbesserungen**:
  - Unterstützung für das moderne S2-TuneIn-Streamingformat (`sid=303`) mit automatischem Fallback auf das klassische S1-Format (`sid=254`) bei Fehlern.
  - Dynamischer Befehls-Generator im Tab "Anleitung": Ermöglicht die Auswahl eines aktiven Lautsprechers, um fertige, kopierbare und klickbare HTTP-URLs inklusive Namen und individueller Sonos-Favoriten anzuzeigen.
  - Optimierung des Log-Fensters: Störende Leerzeilen wurden durch den Wechsel auf ein Div-Element und Entfernen von `pre-wrap` entfernt.
  - Native Hover-Tooltips für Log-Zeilen hinzugefügt, um die ungekürzten Textmeldungen bei Mouseover bequem anzuzeigen.

## [0.4.6] - 2026-05-28
- **Kompaktes Log-Layout (Single-Line)**:
  - Redesign der System-Protokolle im Dashboard: Jeder Log-Eintrag belegt initial genau 1 Zeile (platzsparend & übersichtlich).
  - Interaktives Togglesystem: Detaillierte JSON-Payloads (z.B. HTTP-Details) lassen sich bei Bedarf per Klick auf die jeweilige Zeile aufklappen.
  - Deutlich verbesserter Farbkontrast (optimierte Badge- und Textfarben) auf dunklem Hintergrund zur verbesserten Lesbarkeit.

## [0.4.5] - 2026-05-28
- **Bugfix für TTS-Berechtigung**:
  - Freigabe der Berechtigungen für das temporäre TTS-Verzeichnis (`/app/public/temp/tts` auf `chmod 777`) im Dockerfile, um Schreibfehler (`EACCES`) beim Generieren von Sprachansagen unter benutzerdefinierten Host-UserIDs (wie UID 1036) zu vermeiden.

## [0.4.4] - 2026-05-28
- **Bugfix für leeres SQLite-Protokoll**:
  - Behebung von leeren Log-Anzeigen im Web-UI bei aktivierter SQLite-Datenbank durch Normalisierung der Groß-/Kleinschreibung bei SQL-Filterabfragen.

## [0.4.3] - 2026-05-28
- **UI-Lautstärkensteuerung, SQLite-Logging & Bugfix**:
  - Behebung eines `ReferenceError: roomAliases is not defined` Fehlers beim Speichern der Einstellungen im Frontend.
  - Hinzufügen von +/- Buttons im UI zur Anpassung der Lautstärke in 2%-Schritten.
  - Optionales, persistentes Logging via SQLite (`statistics.db`) im config-Ordner (standardmäßig deaktiviert für materialschonenden RAM-Betrieb auf Raspberry Pis).
  - Strukturierte, granular nach Inbound/Outbound/System filterbare Log-Tabs im Dashboard.
  - Alphabetische Sortierung der Sonos-Lautsprecher (aufsteigend) im UI.
  - Option zum Ausführen des Containers als spezifischer Host-User (`user: "1036:100"`) in der `docker-compose.yml` zur Vermeidung von `EACCES` Permission-Fehlern.

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

