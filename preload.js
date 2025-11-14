const { contextBridge, ipcRenderer } = require('electron');

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
  getDesktopSources: (options) => ipcRenderer.invoke('DESKTOP_CAPTURER_GET_SOURCES', options),
  saveRecording: ({ buffer, meta }) =>
    ipcRenderer.invoke('recorder:save', { buffer: Buffer.from(buffer), meta })
});
