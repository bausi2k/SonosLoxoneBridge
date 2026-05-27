# SonosLoxoneBridge

Eine moderne, leichtgewichtige und vollständig lokale Node.js-Brücke zur bidirektionalen Integration von Sonos-Lautsprechern mit dem Loxone Miniserver – komplett ohne Cloud-Zwang. 

Dieses Projekt dient als moderner Ersatz für die veraltete `node-sonos-http-api`. Es bietet eine REST-API für eingehende Befehle (Inbound), sendet Statusänderungen sofort via UDP an Loxone (Outbound) und verfügt über eine ansprechende Web-Oberfläche im Premium Glassmorphism-Design zur Steuerung und Konfiguration.

---

## Features

- **Lokale UPnP-Steuerung**: Arbeitet direkt im lokalen Netzwerk (LAN) über das Sonos-UPnP-Protokoll – keine Sonos Cloud-API oder Registrierung erforderlich.
- **Automatische Erkennung**: Findet Sonos-Lautsprecher automatisch im Netzwerk (SSDP). Eine neue Netzwerksuche kann jederzeit über die Schaltfläche **"Aktualisieren"** in der Web-Oberfläche ausgelöst werden. Fallback auf statische IP-Adressen wird ebenfalls unterstützt (wichtig für eingeschränkte Netzwerkumgebungen).
- **Zustandssynchronisierung (Hybrid-Ansatz)**:
  - Sendet Status-Updates (Playback-State 0/1 und Lautstärke 0-100) sofort nach Steuerung via API per UDP an Loxone.
  - Abgleich alle 5 Sekunden (Fallback-Polling), falls Änderungen direkt über die offizielle Sonos-App vorgenommen werden.
- **Eingebaute TTS-Engine**:
  - Nutzt `google-tts-api` (kein Cloud-Billing oder API-Schlüssel notwendig).
  - Spielt Ansagen über die Sonos-Funktion `PlayNotification()`. Dadurch wird der vorherige Wiedergabezustand (Warteschlange, Track-Position, Lautstärke) nach Ende der Durchsage automatisch wiederhergestellt.
  - Automatischer Cleanup-Job zur Bereinigung temporärer Sprachdateien.
- **Premium Web-Dashboard**:
  - **Neues Apple Glassmorphism-Design**: Minimalistischer, moderner Look mit flüssig animierten Hintergrund-Blobs und responsivem Spalten-Layout in hellen (Linen) und dunklen (Titanium) Themes. Kräftige orange Highlights runden das Premium-Gefühl ab.
  - **Mobile- & Responsive-Optimierung**: Vollständig optimiert für schmale Mobilgeräte (wie iPhone 17 Pro und iPhone SE). Stacking-Mechanismen für Steuerelemente im Footer und angepasste Icon-/Button-Größen verhindern horizontalen Überlauf und bieten erstklassigen Touch-Komfort.
  - **Zentrierte Player-Cards**: Fokus auf das Album-Artwork (Quadratische 1:1 Ansicht) mit eleganten Hover-Effekten und integrierten Titel- und Interpreten-Infos.
  - **Erweiterte Steuerung**: Direktes Toggling von Wiedergabemodi (Zufallswiedergabe (Shuffle), Wiederholen (Repeat)) sowie Vorwärts- und Rückwärts-Titelsteuerung (Next / Previous).
  - **Diagnose-Overlay**: Ein Klick auf das Info-Symbol zeigt dynamisch geladene Hardware-Diagnosedaten des Lautsprechers (Modellname, Seriennummer, Softwareversion, MAC-Adresse) ohne Layout-Verschiebung an.
  - **System-Protokoll (Log-Konsole)**: Ein interaktives Terminal im Einstellungsmenü spiegelt in Echtzeit Server-Protokolle wider (inklusive farblicher Hervorhebung für Warnungen/Fehler, Kopier- und Löschfunktion).
- **Audio- & Stream-Fallbacks**: Automatisches Laden und Abspielen des ersten Favoriten oder Umschalten auf die Warteschlange bei leeren Medienregistern (Behebung von `UPnPError 701`).
- **Lokaler Album-Art Proxy**: Der integrierte Endpunkt `/api/art` holt Cover-Bilder von den Lautsprechern im LAN und streamt sie sicher zum Browser, um CORS- und Netzwerk-Zugriffsbeschränkungen zu umgehen.
- **Einfache Loxone-Integration**: Generiert vollautomatisch eine passende XML-Importvorlage für virtuelle Loxone-UDP-Eingangsbefehle.

---

## Systemvoraussetzungen

- **Node.js**: v24.x oder höher (empfohlen, v18.x+ unterstützt)
- **Docker & Docker Compose**: Für den Container-Betrieb (empfohlen)

---

## Installation & Schnellstart

### 1. Betrieb mit Docker Compose (Empfohlen)

Sonos-Discovery basiert auf UPnP (SSDP) über Multicast. Damit dies reibungslos funktioniert, läuft der Container standardmäßig im `network_mode: host`.

Erstellen Sie eine `docker-compose.yml` (im Repository enthalten):

```yaml
version: '3.8'

services:
  sonosloxonebridge:
    image: sonosloxonebridge:latest
    build: .
    container_name: sonosloxonebridge
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./config:/app/config
    environment:
      - NODE_ENV=production
```

Starten Sie den Container:

```bash
docker-compose up -d --build
```

Das Web-UI ist anschließend auf Ihrem Host unter `http://<host-ip>:8888` erreichbar.

### 2. Lokaler Betrieb (Entwicklung)

1. Repository klonen und Abhängigkeiten installieren:
   ```bash
   npm install
   ```
2. Anwendung starten:
   ```bash
   npm start
   ```
3. Testsuite ausführen:
   ```bash
   npm test
   ```

---

## REST API (Inbound für Loxone)

Loxone steuert die Sonos-Lautsprecher über einfache HTTP GET-Anfragen an die Brücke.

### 1. Wiedergabe starten
- **Methode**: `GET`
- **Pfad**: `/:raum/play`
- **Beispiel**: `http://192.168.1.100:8888/wohnzimmer/play`

### 2. Wiedergabe pausieren
- **Methode**: `GET`
- **Pfad**: `/:raum/pause`
- **Beispiel**: `http://192.168.1.100:8888/wohnzimmer/pause`

### 3. Lautstärke regeln
Unterstützt absolute Werte (0 bis 100) sowie relative Anpassungen (z. B. `+5`, `-10`).
- **Methode**: `GET`
- **Pfad**: `/:raum/volume/:wert`
- **Beispiele**: 
  - Lautstärke auf 25 % setzen: `http://192.168.1.100:8888/wohnzimmer/volume/25`
  - Lautstärke um 5 % erhöhen: `http://192.168.1.100:8888/wohnzimmer/volume/+5`
  - Lautstärke um 10 % senken: `http://192.168.1.100:8888/wohnzimmer/volume/-10`

### 4. Sonos-Favoriten abspielen
Spielt einen in der Sonos-App hinterlegten Favoriten (Radio-Sender, Playlist etc.) ab. Der Name wird case-insensitiv abgeglichen.
- **Methode**: `GET`
- **Pfad**: `/:raum/favorite/:name`
- **Beispiel**: `http://192.168.1.100:8888/wohnzimmer/favorite/wdr2`

### 5. Sprachansage (TTS) ausgeben
- **Methode**: `GET`
- **Pfad**: `/:raum/say/:text/:volume?`
- **Beispiel (mit Lautstärke 40 %)**: `http://192.168.1.100:8888/wohnzimmer/say/Die Waschmaschine ist fertig/40`

### 6. Weitere Steuerungsbefehle
- **TuneIn-Sender abspielen**:
  - **Methode**: `GET`
  - **Pfad**: `/:raum/tunein/play/:stationId`
  - **Beispiel**: `http://192.168.1.100:8888/kueche/tunein/play/68225` (spielt den TuneIn-Sender mit ID 68225).
- **Gruppe verlassen (Standalone)**:
  - **Methode**: `GET`
  - **Pfad**: `/:raum/leave`
  - **Beispiel**: `http://192.168.1.100:8888/kueche/leave` (trennt den Lautsprecher aus einer bestehenden Gruppe).
- **Sound-Clip abspielen**:
  - **Methode**: `GET`
  - **Pfad**: `/:raum/clip/:file/:volume?`
  - **Beispiel**: `http://192.168.1.100:8888/wohnzimmer/clip/bell.mp3/50` (spielt die Audiodatei `bell.mp3` aus `static/clips` mit 50 % Lautstärke ab).
- **Preset (Raumgruppe / Szene) aktivieren**:
  - **Methode**: `GET`
  - **Pfad**: `/preset/:name`
  - **Beispiel**: `http://192.168.1.100:8888/preset/all` (aktiviert die vordefinierte Szene `"all"` aus dem `presets`-Ordner).

### 7. Zusätzliche API-Endpunkte (für UI & Integration)

Neben den einfachen HTTP-GET-Abkürzungen für Loxone bietet die Brücke eine strukturierte REST-API:

- **Wiedergabe-Steuerung (`POST /api/control`)**:
  - Ermöglicht eine flexible Steuerung im JSON-Format.
  - **Payload**: `{ "room": "wohnzimmer", "action": "<action>", "value": "<wert>" }`
  - **Unterstützte Aktionen**:
    - `play`, `pause`, `next`, `previous`
    - `volume` (Wert: 0-100)
    - `favorite` (Wert: Favoritenname)
    - `playmode` (Wert: `NORMAL`, `SHUFFLE`, `REPEAT_ALL`, `REPEAT_ONE`)
    - `say` (Wert: Text oder Objekt `{ "text": "...", "volume": 40 }`)
- **System-Logs abrufen (`GET /api/logs`)**:
  - Liefert die letzten 100 Zeilen der Konsolenprotokolle des Servers.
- **System-Logs leeren (`POST /api/logs/clear`)**:
  - Leert den internen Log-Puffer auf dem Server.
- **Album-Art Proxy (`GET /api/art`)**:
  - Holt das Cover-Bild direkt von einem Sonos-Lautsprecher und streamt es an den Client (bypasst private Netzwerkrestriktionen).
  - **Parameter**: `?ip=<speaker_ip>&path=<relative_art_path>`

---

## Loxone Anbindung (Outbound via UDP)

Die Brücke sendet Statusänderungen direkt als UDP-Pakete an die konfigurierte IP-Adresse und den Port des Loxone Miniservers.

### 1. UDP-Paketformate
- **Playback-Status**: `sonos.<raum_normalisiert>.play <0/1>` (z. B. `sonos.wohnzimmer.play 1`)
- **Lautstärke-Status**: `sonos.<raum_normalisiert>.volume <0-100>` (z. B. `sonos.wohnzimmer.volume 35`)

*Hinweis zur Normalisierung*: Raumnamen werden für Loxone normalisiert (Kleinschreibung, Umlaute konvertiert (ä->ae, etc.), Sonder- und Leerzeichen entfernt). Aus `"Küche"` wird `kueche`, aus `"Living Room"` wird `livingroom`.

### 2. XML-Importvorlage für Loxone Config
Um den Einrichtungsaufwand in Loxone zu minimieren:
1. Öffnen Sie das Web-UI der Brücke (`http://<bridge-ip>:8888`).
2. Klicken Sie in der rechten Spalte unter "Loxone Integration" auf **XML-Importvorlage laden**.
3. Speichern Sie die Datei `VIU_SonosLoxoneBridge.xml` ab.
4. Öffnen Sie die **Loxone Config** Software.
5. Navigieren Sie zu `Virtuelle Eingänge`, klicken Sie auf `Virtuelle HTTP/UDP Eingänge` und wählen Sie **Vordefinierte Geräte -> Vorlage importieren**.
6. Wählen Sie die heruntergeladene XML-Datei aus. Schon sind alle Befehlserkennungen für Ihre Sonos-Lautsprecher angelegt!

---

## Konfiguration (`settings.json`)

Sämtliche Einstellungen werden im Web-UI vorgenommen und in der Datei `config/settings.json` persistiert. Ein manuelles Editieren ist in der Regel nicht erforderlich. Eine Vorlage der Konfiguration ist als `config/settings.json.example` im Repository hinterlegt. Kopieren Sie diese vor dem ersten Start und passen Sie sie nach Bedarf an.

Struktur der Konfigurationsdatei:
```json
{
  "port": 8888,
  "loxoneIp": "192.168.1.10",
  "loxonePort": 7777,
  "ttsLanguage": "de",
  "staticSpeakerIps": [
    "192.168.1.50"
  ],
  "roomAliases": {
    "wohnzimmer": "Living Room"
  }
}
```

### Erklärung der Felder:
- `port`: Port, unter dem die Brücke erreichbar ist (Standard: `8888`).
- `loxoneIp`: Die IPv4-Adresse Ihres Loxone Miniservers.
- `loxonePort`: Der in Loxone eingerichtete UDP-Eingangsport (Standard: `7777`).
- `ttsLanguage`: ISO-Code der standardmäßigen Sprachausgabe (z. B. `de`, `en`, `fr`).
- `staticSpeakerIps`: Liste von IP-Adressen (eine pro Zeile). Nützlich, wenn Docker im Bridge-Modus läuft oder SSDP-Multicast im Netzwerk blockiert ist.
- `roomAliases`: Verknüpfung von Loxone-Raumbezeichnungen mit echten Sonos-Gerätenamen. So kann der Loxone-Befehl `/wohnzimmer/...` an einen Lautsprecher gesendet werden, der in Sonos eigentlich `"Living Room"` heißt.

---

## Lizenz

Dieses Projekt ist für die private Nutzung im Smart-Home-Bereich lizenziert.
