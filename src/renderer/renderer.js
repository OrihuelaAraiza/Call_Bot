import {
  startRecordingForSource,
  stopRecording,
  getIsRecording,
  setOnStatusChangeListener
} from '../services/recorder.js';

const statusEl = document.getElementById('status');
const detailEl = document.getElementById('meetingDetail');
const startBtn = document.getElementById('startRecording');
const stopBtn = document.getElementById('stopRecording');
const autoStartToggle = document.getElementById('autoStartToggle');
const logEl = document.getElementById('log');
const errorEl = document.getElementById('error');
const sourceSelect = document.getElementById('sourceSelect');
const refreshSourcesBtn = document.getElementById('refreshSources');
const checkPermissionsBtn = document.getElementById('checkPermissions');
const requestMicBtn = document.getElementById('requestMicrophone');
const permissionStatusEl = document.getElementById('permissionStatus');

let autoStartEnabled = false;
let meetingStatus = { isInMeeting: false, app: null, title: null };
let availableSources = [];
let lastPermissionStatus = null;

function isRecording() {
  return getIsRecording();
}

async function listAvailableSources() {
  return window.electronAPI.getDesktopSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 }
  });
}

function log(message) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent = `[${time}] ${message}\n${logEl.textContent}`;
}

function setError(message = '') {
  errorEl.textContent = message;
}

function updateStatus(status) {
  const meetingLabel = status.isInMeeting
    ? `Meeting detected: ${status.app || 'Unknown'}`
    : 'No meeting detected';
  statusEl.textContent = isRecording() ? 'Recording in progress…' : meetingLabel;
  detailEl.textContent = status.title || (status.isInMeeting ? 'Meeting window active' : 'Waiting for a meeting');
}

function updateButtons() {
  startBtn.disabled = isRecording();
  stopBtn.disabled = !isRecording();
}

function renderPermissionStatus(status) {
  if (!permissionStatusEl) return;
  lastPermissionStatus = status;
  permissionStatusEl.innerHTML = '';

  if (!status) {
    const li = document.createElement('li');
    li.textContent = 'Unable to read permission status.';
    li.style.color = '#dc2626';
    permissionStatusEl.appendChild(li);
    return;
  }

  const entries = [
    ['screen', status.screen],
    ['microphone', status.microphone],
    ['accessibility', status.accessibility]
  ];

  entries.forEach(([label, value]) => {
    const li = document.createElement('li');
    const normalized = (value || 'unknown').toLowerCase();
    li.textContent = `${label.replace(/^[a-z]/, (c) => c.toUpperCase())}: ${normalized}`;
    li.style.color = normalized === 'granted' ? '#15803d' : '#dc2626';
    permissionStatusEl.appendChild(li);
  });

  if (requestMicBtn) {
    const micGranted = (status?.microphone || '').toLowerCase() === 'granted';
    requestMicBtn.disabled = micGranted;
  }
}

async function refreshPermissionStatus({ silent } = {}) {
  try {
    const status = await window.electronAPI.getPermissionStatus();
    renderPermissionStatus(status);
    if (!silent) {
      log('Permission status refreshed.');
    }
  } catch (error) {
    console.error('Unable to retrieve permission status', error);
    renderPermissionStatus(null);
    if (!silent) {
      setError('Unable to read permission status. Check console logs.');
    }
  }
}

async function requestMicrophoneAccess() {
  try {
    const result = await window.electronAPI.requestMicrophonePermission();
    if (result === 'granted') {
      log('Microphone access granted.');
    } else {
      setError('Microphone access denied. Enable it in System Settings > Privacy & Security > Microphone.');
      log('Microphone access denied by system.');
    }
    await refreshPermissionStatus({ silent: true });
  } catch (error) {
    console.error('Unable to request microphone access', error);
    setError('Unable to prompt for microphone access. Check console logs.');
  }
}

setOnStatusChangeListener((status, message) => {
  if (status === 'error') {
    setError(message || 'Recorder error.');
    log(`Recorder error: ${message || 'Unknown'}`);
  } else if (status === 'recording') {
    setError('');
  } else if (status === 'idle') {
    setError('');
  }
  updateButtons();
});

async function hydrateSettings() {
  try {
    const settings = await window.electronAPI.getSettings();
    autoStartEnabled = Boolean(settings.autoStartOnMeeting);
    autoStartToggle.checked = autoStartEnabled;
  } catch (error) {
    console.error('Failed to load settings', error);
  }
}

async function handleMeetingStatus(status) {
  meetingStatus = status || { isInMeeting: false };
  updateStatus(meetingStatus);
  updateButtons();

  if (autoStartEnabled && meetingStatus.isInMeeting && !isRecording()) {
    try {
      await startRecordingFlow('auto-start');
    } catch (error) {
      console.error('Auto-start failed', error);
    }
  }

  if (autoStartEnabled && !meetingStatus.isInMeeting && isRecording()) {
    await stopRecordingFlow('auto-stop');
  }
}

async function startRecordingFlow(reason = 'manual') {
  setError();
  try {
    const selected = sourceSelect.value;
    if (!selected) {
      setError('Select a screen/window to capture.');
      return;
    }

    window.currentMeetingApp = meetingStatus.app || 'unknown';
    window.currentMeetingTitle = meetingStatus.title || 'unknown';
    window.recordingStartedAt = new Date().toISOString();

    await startRecordingForSource(selected);
    window.electronAPI.startRecordingNotice(meetingStatus);
    updateButtons();
    log(`Recording started (${reason}) on source: ${selected}`);
  } catch (error) {
    console.error('Unable to start recording', error);
    handleMediaError(error);
  }
}

async function stopRecordingFlow(reason = 'manual-stop') {
  try {
    stopRecording();
    window.electronAPI.stopRecordingNotice();
    updateButtons();
    log(`Recording stop requested (${reason}).`);
  } catch (error) {
    console.error('Unable to stop recording', error);
    setError('Unable to stop recording. Check console logs for details.');
  }
}

function handleMediaError(error) {
  if (!error) {
    setError('Unknown recording error.');
    return;
  }

  if (error.name === 'NotAllowedError') {
    setError('Permission denied. Please allow screen and microphone access.');
    return;
  }

  if (error.message) {
    setError(error.message);
    return;
  }

  setError('An unexpected error occurred.');
}

async function refreshSources(selectedId) {
  try {
    availableSources = await listAvailableSources();
    sourceSelect.innerHTML = '';
    availableSources.forEach((source) => {
      const option = document.createElement('option');
      option.value = source.id;
      option.textContent = `${source.name} (${source.id.split(':')[0]})`;
      sourceSelect.appendChild(option);
    });

    if (availableSources.length === 0) {
      const option = document.createElement('option');
      option.textContent = 'No sources available';
      option.disabled = true;
      sourceSelect.appendChild(option);
      sourceSelect.disabled = true;
    } else {
      sourceSelect.disabled = false;
    }

    if (selectedId) {
      sourceSelect.value = selectedId;
    }
  } catch (error) {
    console.error('Unable to list sources', error);
    setError('Unable to read screens/windows.');
  }
}

function wireEvents() {
  startBtn.addEventListener('click', () => startRecordingFlow());
  stopBtn.addEventListener('click', () => stopRecordingFlow());
  refreshSourcesBtn.addEventListener('click', () => refreshSources(sourceSelect.value));
  if (checkPermissionsBtn) {
    checkPermissionsBtn.addEventListener('click', () => refreshPermissionStatus({ silent: false }));
  }
  if (requestMicBtn) {
    requestMicBtn.addEventListener('click', () => requestMicrophoneAccess());
  }

  autoStartToggle.addEventListener('change', async (event) => {
    autoStartEnabled = event.target.checked;
    await window.electronAPI.setSettings({ autoStartOnMeeting: autoStartEnabled });
    log(`Auto-start ${autoStartEnabled ? 'enabled' : 'disabled'}.`);
  });

  window.electronAPI.onMeetingStatus((status) => handleMeetingStatus(status));

  window.electronAPI.onRecordingFinished((payload) => {
    if (payload?.mp4Path) {
      log(`Recording converted and saved to: ${payload.mp4Path}`);
    } else {
      log('Recording finished.');
    }
    updateButtons();
  });
}

async function bootstrap() {
  await hydrateSettings();
  wireEvents();
  await refreshSources();
  await refreshPermissionStatus({ silent: true });

  const initialStatus = await window.electronAPI.requestInitialStatus();
  if (initialStatus) {
    handleMeetingStatus(initialStatus);
  }
}

bootstrap();
