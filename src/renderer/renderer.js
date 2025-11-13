import { startRecording, stopRecording, isRecording, listAvailableSources } from '../services/recorder.js';

const statusEl = document.getElementById('status');
const detailEl = document.getElementById('meetingDetail');
const startBtn = document.getElementById('startRecording');
const stopBtn = document.getElementById('stopRecording');
const autoStartToggle = document.getElementById('autoStartToggle');
const logEl = document.getElementById('log');
const errorEl = document.getElementById('error');
const sourceSelect = document.getElementById('sourceSelect');
const refreshSourcesBtn = document.getElementById('refreshSources');

let autoStartEnabled = false;
let meetingStatus = { isInMeeting: false, app: null, title: null };
let availableSources = [];

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
    const selected = sourceSelect.value || undefined;
    const { sourceName } = await startRecording(meetingStatus, selected);
    window.electronAPI.startRecordingNotice(meetingStatus);
    updateButtons();
    log(`Recording started (${reason}) on source: ${sourceName}`);
  } catch (error) {
    console.error('Unable to start recording', error);
    handleMediaError(error);
  }
}

async function stopRecordingFlow(reason = 'manual-stop') {
  try {
    const result = await stopRecording();
    window.electronAPI.stopRecordingNotice();
    updateButtons();
    if (result?.filePath) {
      log(`Recording saved to: ${result.filePath}`);
    } else {
      log(`Recording ended (${reason}).`);
    }
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

  autoStartToggle.addEventListener('change', async (event) => {
    autoStartEnabled = event.target.checked;
    await window.electronAPI.setSettings({ autoStartOnMeeting: autoStartEnabled });
    log(`Auto-start ${autoStartEnabled ? 'enabled' : 'disabled'}.`);
  });

  window.electronAPI.onMeetingStatus((status) => handleMeetingStatus(status));
}

async function bootstrap() {
  await hydrateSettings();
  wireEvents();
  await refreshSources();

  const initialStatus = await window.electronAPI.requestInitialStatus();
  if (initialStatus) {
    handleMeetingStatus(initialStatus);
  }
}

bootstrap();
