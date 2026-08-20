# dsh-window

Der Windows-Launcher startet die lokale DSH-Web-Oberfläche in einem eigenen
Chrome-/Edge-App-Fenster. Der DSH-Server wird auf einem freien Loopback-Port
gestartet und beim Schließen des Browserfensters sauber beendet.

## Nutzung

Im Repository-Hauptverzeichnis:

```bat
build-dsh-window.bat
```

Danach liegt `dsh-window.exe` direkt im Hauptverzeichnis. Ein Doppelklick auf
die EXE startet die gebaute DSH-Version dieses Checkouts. Für den normalen
Browserstart ohne separates App-Fenster:

```bat
start-dsh.bat
```

Die Batchdatei akzeptiert zusätzliche DSH-Argumente, zum Beispiel:

```bat
start-dsh.bat --no-open
dsh-window.exe --workspace "C:\Pfad\zum\Projekt"
```

## Voraussetzungen

- Windows
- Node.js 22.19+ und pnpm 11.7.0 zum Bauen
- Chrome, Edge oder Playwright Chromium zum Ausführen des App-Fensters

Der Build erzeugt zuerst die normalen DSH-Artefakte und verpackt danach den
Launcher als Node-SEA-Einzeldatei. Die Build-Caches und die EXE selbst bleiben
lokale, ignorierte Artefakte; ein frischer Checkout kann sie mit der Batchdatei
jederzeit reproduzieren.

Optional kann neben `dsh-window.exe` eine `config.txt` liegen. Unterstützt
werden `dsh=`, `workspace=` und `browser=`; relative Pfade beziehen sich auf
den Ordner der EXE.
