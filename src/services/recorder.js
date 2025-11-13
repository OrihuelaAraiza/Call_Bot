let mediaRecorder;
let recordedChunks = [];
let currentStream;
let recordingMeta = null;
let stopResolve;
let stopReject;

export function isRecording() {
  return Boolean(mediaRecorder && mediaRecorder.state === 'recording');
}

export async function listAvailableSources() {
  return window.electronAPI.getDesktopSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 }
  });
}

function matchSource(sources, meetingMeta, selectedSourceId) {
  if (!Array.isArray(sources) || !sources.length) {
    return null;
  }

  if (selectedSourceId) {
    const manual = sources.find((source) => source.id === selectedSourceId);
    if (manual) {
      return manual;
    }
  }

  if (meetingMeta?.title) {
    const titleMatch = sources.find((source) =>
      source.name?.toLowerCase().includes(meetingMeta.title.toLowerCase())
    );
    if (titleMatch) {
      return titleMatch;
    }
  }

  if (meetingMeta?.app) {
    const appMatch = sources.find((source) =>
      source.name?.toLowerCase().includes(meetingMeta.app.toLowerCase())
    );
    if (appMatch) {
      return appMatch;
    }
  }

  return sources[0];
}

function stopTracks() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }
}

export async function startRecording(meetingMeta = {}, selectedSourceId) {
  if (isRecording()) {
    throw new Error('Recording already in progress.');
  }

  const sources = await listAvailableSources();
  const targetSource = matchSource(sources, meetingMeta, selectedSourceId);
  if (!targetSource) {
    throw new Error('No capture sources are available. Please share permissions and retry.');
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop'
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: targetSource.id
        }
      }
    });

    currentStream = stream;
    recordedChunks = [];
    recordingMeta = {
      startedAt: Date.now(),
      meetingMeta,
      sourceName: targetSource.name
    };

    const options = {};
    if (window.MediaRecorder && typeof window.MediaRecorder.isTypeSupported === 'function') {
      if (window.MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
        options.mimeType = 'video/webm; codecs=vp9';
      } else if (window.MediaRecorder.isTypeSupported('video/webm; codecs=vp8')) {
        options.mimeType = 'video/webm; codecs=vp8';
      }
    } else {
      // TODO: Provide fallback encoding when MediaRecorder is unavailable on older platforms.
    }

    mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error', event.error || event);
      stopReject?.(event.error);
    };

    mediaRecorder.onstop = async () => {
      try {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        const savedPath = await window.electronAPI.saveRecording({
          buffer: arrayBuffer,
          meta: {
            ...recordingMeta,
            stoppedAt: Date.now()
          }
        });
        stopResolve?.({ filePath: savedPath, sourceName: recordingMeta?.sourceName });
      } catch (error) {
        stopReject?.(error);
      } finally {
        cleanup();
      }
    };

    mediaRecorder.start();
    return { sourceName: targetSource.name };
  } catch (error) {
    stopTracks();
    throw error;
  }
}

export async function stopRecording() {
  if (!isRecording()) {
    return null;
  }

  return new Promise((resolve, reject) => {
    stopResolve = resolve;
    stopReject = reject;
    mediaRecorder.stop();
  });
}

function cleanup() {
  stopTracks();
  mediaRecorder = null;
  recordedChunks = [];
  recordingMeta = null;
  stopResolve = null;
  stopReject = null;
}
