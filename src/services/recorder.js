// src/services/recorder.js
// Full replacement — robust chunk handling and error logs

let mediaRecorder = null;
let chunks = [];
let currentStream = null;
let isRecording = false;

const listeners = {
  onStatusChange: null,
};

function notifyStatus(status, message) {
  console.log('[Recorder]', status, message || '');
  if (typeof listeners.onStatusChange === 'function') {
    listeners.onStatusChange(status, message);
  }
}

export function setOnStatusChangeListener(cb) {
  listeners.onStatusChange = cb;
}

function getSupportedMimeType() {
  const candidates = [
    "video/webm; codecs=vp9,opus",
    "video/webm; codecs=vp8,opus",
    "video/webm"
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export async function startRecordingForSource(sourceId) {
  try {
    if (isRecording) return;

    // close previous stream
    if (currentStream) {
      currentStream.getTracks().forEach(t => t.stop());
      currentStream = null;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
        }
      }
    });

    if (!stream || stream.getTracks().length === 0) {
      notifyStatus("error", "Screen stream has no tracks. macOS permissions missing.");
      return;
    }

    currentStream = stream;
    chunks = [];

    const mimeType = getSupportedMimeType();
    mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onerror = (event) => {
      console.error("[Recorder] MediaRecorder error:", event.error);
      notifyStatus("error", event.error?.message);
    };

    mediaRecorder.onstop = async () => {
      try {
        if (!chunks.length) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        if (!chunks.length) {
          notifyStatus("error", "No media captured. Keep recording a bit longer or fix OS permissions.");
          return;
        }

        const blob = new Blob(chunks, { type: "video/webm" });
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        window.electronAPI.sendRecordingBuffer({
          buffer,
          meta: {
            app: window.currentMeetingApp || "unknown",
            title: window.currentMeetingTitle || "unknown",
            startedAt: window.recordingStartedAt || new Date().toISOString()
          }
        });

        notifyStatus("idle", "Recording saved and sent.");
      } catch (err) {
        console.error("[Recorder] onstop error:", err);
        notifyStatus("error", "Failed to finalize recording.");
      } finally {
        if (currentStream) currentStream.getTracks().forEach(t => t.stop());
        currentStream = null;
        chunks = [];
        mediaRecorder = null;
        isRecording = false;
      }
    };

    mediaRecorder.start(1000);
    isRecording = true;
    window.recordingStartedAt = new Date().toISOString();
    notifyStatus("recording", "Recording started.");

  } catch (err) {
    console.error("[Recorder] Failed to start:", err);
    notifyStatus("error", "Failed to start recording. Check permissions.");
  }
}

export function stopRecording() {
  if (!isRecording || !mediaRecorder) return;
  try {
    if (typeof mediaRecorder.requestData === 'function') {
      try {
        mediaRecorder.requestData();
      } catch (requestError) {
        console.warn('[Recorder] requestData failed', requestError);
      }
    }
    mediaRecorder.stop();
  } catch (err) {
    console.error("[Recorder] stop error:", err);
    notifyStatus("error", "Unable to stop recording.");
  }
}

export function getIsRecording() {
  return isRecording;
}
