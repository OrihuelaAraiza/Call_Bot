const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  desktopCapturer,
  systemPreferences
} = require('electron');
const path = require('path');
const fs = require('fs');

const MeetingDetector = require('./src/services/meetingDetector');
const { ensureSettingsFile, getSettings, saveSettings } = require('./src/config/settingsStore');

const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow;
let tray;
let detector;
let isRecording = false;
let currentStatus = { isInMeeting: false, app: null, title: null };
const recordingsDir = path.join(__dirname, 'recordings');

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

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
  const meetingLabel = status.isInMeeting ? `In meeting (${status.app || 'unknown'})` : 'Idle';
  const recordingLabel = isRecording ? ' • Recording' : '';
  tray.setToolTip(`Sales Call Assistant - ${meetingLabel}${recordingLabel}`);
}

function normalizeRecordingBuffer(payload) {
  if (!payload) {
    return null;
  }
  if (Buffer.isBuffer(payload)) {
    return payload;
  }
  if (payload instanceof Uint8Array) {
    return Buffer.from(payload);
  }
  if (payload?.buffer instanceof ArrayBuffer) {
    return Buffer.from(payload.buffer);
  }
  if (Array.isArray(payload)) {
    return Buffer.from(payload);
  }
  if (payload?.type === 'Buffer' && Array.isArray(payload.data)) {
    return Buffer.from(payload.data);
  }
  return null;
}

function handleIpc() {
  ipcMain.handle('meeting:getStatus', () => ({ ...currentStatus, isRecording }));

  ipcMain.handle('settings:get', () => getSettings());

  ipcMain.handle('settings:set', (_, payload) => saveSettings(payload));

  ipcMain.handle('DESKTOP_CAPTURER_GET_SOURCES', (_, options) =>
    desktopCapturer.getSources(options || { types: ['screen', 'window'] })
  );

  ipcMain.handle('permissions:getStatus', () => getPermissionStatus());
  ipcMain.handle('permissions:requestMicrophone', async () => {
    try {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      return granted ? 'granted' : 'denied';
    } catch (error) {
      console.error('Microphone permission request failed', error);
      throw error;
    }
  });

  ipcMain.on('meeting:startRecording', (_, meta) => {
    isRecording = true;
    currentStatus = { ...currentStatus, meetingMeta: meta };
    sendStatusUpdate();
  });

  ipcMain.on('meeting:stopRecording', () => {
    isRecording = false;
    sendStatusUpdate();
  });

  ipcMain.on('recording:buffer', async (_event, payload) => {
    console.log('[Main] Received recording buffer.');
    try {
      await saveAndConvert(payload);
    } catch (error) {
      console.error('[Main] Failed to save/convert recording', error);
    }
  });
}

function getPermissionStatus() {
  const normalize = (status) => status || 'unknown';
  const screen = (() => {
    try {
      return normalize(systemPreferences.getMediaAccessStatus('screen'));
    } catch (error) {
      return 'unknown';
    }
  })();

  const microphone = (() => {
    try {
      return normalize(systemPreferences.getMediaAccessStatus('microphone'));
    } catch (error) {
      return 'unknown';
    }
  })();

  const accessibility = (() => {
    try {
      return systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied';
    } catch (error) {
      return 'unknown';
    }
  })();

  return { screen, microphone, accessibility };
}

function timestamp() {
  return new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
}

function convertWebmToMp4(webmPath) {
  return new Promise((resolve, reject) => {
    const mp4Path = webmPath.replace(/\.webm$/i, '.mp4');

    ffmpeg(webmPath)
      .outputOptions('-movflags', 'faststart')
      .toFormat('mp4')
      .on('end', () => {
        console.log('[FFmpeg] Converted:', mp4Path);
        resolve(mp4Path);
      })
      .on('error', (err) => {
        console.error('[FFmpeg] Error:', err);
        reject(err);
      })
      .save(mp4Path);
  });
}

async function saveAndConvert({ buffer, meta }) {
  const recordingBuffer = normalizeRecordingBuffer(buffer);
  if (!recordingBuffer || recordingBuffer.length === 0) {
    throw new Error('Recording stream produced an empty buffer.');
  }

  const fname = `${timestamp()}_${meta?.app || 'unknown'}.webm`;
  const webmPath = path.join(recordingsDir, fname);

  await fs.promises.writeFile(webmPath, recordingBuffer);
  console.log('[Main] Saved .webm at:', webmPath);

  try {
    const mp4Path = await convertWebmToMp4(webmPath);

    if (mainWindow) {
      mainWindow.webContents.send('recording:finished', { mp4Path, meta });
    }

    console.log('[Main] Final .mp4 ready:', mp4Path);
  } catch (err) {
    console.error('[Main] Convert error:', err);
  }
}

app.whenReady().then(() => {
  ensureRecordingsDir();
  ensureSettingsFile();
  createMainWindow();
  createTray();
  setupMeetingDetector();
  handleIpc();
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
