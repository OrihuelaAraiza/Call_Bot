const { contextBridge, ipcRenderer, desktopCapturer } = require('electron');
const { Buffer } = require('buffer');

contextBridge.exposeInMainWorld('electronAPI', {
  onMeetingStatus: (callback) => {
    const subscription = (_, status) => callback(status);
    ipcRenderer.on('meeting:statusChanged', subscription);
    return () => ipcRenderer.removeListener('meeting:statusChanged', subscription);
  },
  requestInitialStatus: () => ipcRenderer.invoke('meeting:getStatus'),
  startRecordingNotice: (meta) => ipcRenderer.send('meeting:startRecording', meta),
  stopRecordingNotice: () => ipcRenderer.send('meeting:stopRecording'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  getDesktopSources: (options) => desktopCapturer.getSources(options),
  saveRecording: ({ buffer, meta }) => {
    const nodeBuffer = Buffer.from(buffer);
    return ipcRenderer.invoke('recorder:save', { buffer: nodeBuffer, meta });
  }
});
