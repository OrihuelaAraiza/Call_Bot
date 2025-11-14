const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');

const MeetingDetector = require('./src/services/meetingDetector');
const { ensureSettingsFile, getSettings, saveSettings } = require('./src/config/settingsStore');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow;
let tray;
let detector;
let isRecording = false;
let currentStatus = { isInMeeting: false, app: null, title: null };
const recordingsDir = path.join(__dirname, 'recordings');

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 580,
    show: false,
    resizable: false,
    title: 'Sales Call Assistant',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'));
  mainWindow.once('ready-to-show', () => {
    if (isDev) {
      mainWindow.show();
    }
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (process.platform === 'darwin') {
        app.dock.hide();
      }
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAALElEQVR4nGNgGAWjYBSMglEwCkb9T0wC4kiG7GdgGodB0YjGgGkAGE8BphGIMA8AywY8ONE8pOQAAAABJRU5ErkJggg=='
  );

  tray = new Tray(icon);
  tray.setToolTip('Sales Call Assistant - Idle');
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          if (process.platform === 'darwin') {
            app.dock.show();
          }
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
}

function ensureRecordingsDir() {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

function setupMeetingDetector() {
  detector = new MeetingDetector();
  detector.on('status-changed', (status) => {
    currentStatus = status;
    sendStatusUpdate();
  });
  detector.start();
}

function sendStatusUpdate() {
  const payload = { ...currentStatus, isRecording };
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('meeting:statusChanged', payload);
  }
  updateTrayTooltip(payload);
}

function updateTrayTooltip(status) {
  if (!tray) return;
  const meetingLabel = status.isInMeeting
    ? `In meeting (${status.app || 'unknown'})`
    : 'Idle';
  const recordingLabel = isRecording ? ' • Recording' : '';
  tray.setToolTip(`Sales Call Assistant - ${meetingLabel}${recordingLabel}`);
}

function handleIpc() {
  ipcMain.handle('meeting:getStatus', () => ({ ...currentStatus, isRecording }));

  ipcMain.handle('settings:get', () => getSettings());

  ipcMain.handle('settings:set', (_, payload) => saveSettings(payload));

  ipcMain.handle('DESKTOP_CAPTURER_GET_SOURCES', (_, options) =>
    desktopCapturer.getSources(options || { types: ['screen', 'window'] })
  );

  ipcMain.on('meeting:startRecording', (_, meta) => {
    isRecording = true;
    currentStatus = { ...currentStatus, meetingMeta: meta };
    sendStatusUpdate();
  });

  ipcMain.on('meeting:stopRecording', () => {
    isRecording = false;
    sendStatusUpdate();
  });

  ipcMain.handle('recorder:save', async (_, { buffer, meta }) => {
    const timestamp = new Date().toISOString().replace(/[:]/g, '-');
    const label = meta?.meetingMeta?.app || meta?.meetingMeta?.title || 'unknown';
    const filename = `${timestamp}_${label}.webm`;
    const targetPath = path.join(recordingsDir, filename);
    await fs.promises.writeFile(targetPath, buffer);
    onRecordingSaved(targetPath, meta);
    return targetPath;
  });
}

function onRecordingSaved(filePath, meta) {
  console.log(`Recording saved at: ${filePath}`);
  console.log('TODO: upload to backend with meeting metadata', meta);
  // TODO: Implement POST upload to backend (e.g., using fetch with FormData that streams the file
  // and attaches meta fields such as meeting app, start/end timestamps, etc.).
}

app.whenReady().then(() => {
  ensureRecordingsDir();
  ensureSettingsFile();
  createMainWindow();
  createTray();
  setupMeetingDetector();
  handleIpc();
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  detector?.stop();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  } else {
    mainWindow?.show();
  }
});

app.on('window-all-closed', (event) => {
  if (!app.isQuitting) {
    event.preventDefault();
  }
});
