# SalesCallAssistant

SalesCallAssistant is a lightweight Electron tray application that watches for online meeting apps (Zoom, Microsoft Teams, Google Meet) and can automatically start recording your sales calls with one click.

## Requirements

- macOS or Windows
- Node.js 18+
- npm 9+

## Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/your-org/SalesCallAssistant.git

# 2. Change into the project directory
cd SalesCallAssistant

# 3. Install dependencies
npm install

# 4. Start the development build
npm run dev
```

(Optional) To build distributable packages:

```bash
npm run build
```

## How It Works

- **Meeting detection:** The background service polls the active window every few seconds using `active-win`. If the title or process matches known meeting apps (Zoom, Teams, Google Meet) the UI and tray status flip to “In meeting”.
- **Recording:** When you start a recording (manually or via auto-start) the renderer selects a screen/window source via `desktopCapturer`, creates a `MediaRecorder`, and collects audio + video chunks. Once recording stops the file is transferred to the main process and saved to the `recordings/` folder as a `.webm` file.
- **Storage:** Recordings are saved locally under `recordings/` with timestamped filenames. A hook (`onRecordingSaved`) in the main process logs where future upload logic will live.
- **Settings:** Basic preferences such as auto-start recording live in `src/config/settings.json` and are read/written through a small helper.

## Known Limitations

- The OS must grant Screen Recording and Microphone permissions for Electron.
- Meeting detection relies on heuristics; edge cases or renamed meeting windows might not trigger auto-recording.
- Uploading recordings to a backend is not implemented yet (marked with TODOs).
- Recording is currently saved as WebM. Converting to MP4 or uploading must be added separately.

## Scripts

- `npm run dev` – Launch Electron with hot reload-friendly defaults.
- `npm run build` – Package the application with `electron-builder` for macOS (DMG) and Windows (NSIS).
