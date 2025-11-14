const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendRecordingBuffer: (payload) => ipcRenderer.send('recording:buffer', payload),
  onRecordingFinished: (callback) =>
    ipcRenderer.on('recording:finished', (_event, data) => callback(data)),
  onMeetingStatus: (callback) => {
    const subscription = (_event, status) => callback(status);
    ipcRenderer.on('meeting:statusChanged', subscription);
    return () => ipcRenderer.removeListener('meeting:statusChanged', subscription);
  },
  requestInitialStatus: () => ipcRenderer.invoke('meeting:getStatus'),
  startRecordingNotice: (meta) => ipcRenderer.send('meeting:startRecording', meta),
  stopRecordingNotice: () => ipcRenderer.send('meeting:stopRecording'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  getDesktopSources: (options) => ipcRenderer.invoke('DESKTOP_CAPTURER_GET_SOURCES', options),
  getPermissionStatus: () => ipcRenderer.invoke('permissions:getStatus'),
  requestMicrophonePermission: () => ipcRenderer.invoke('permissions:requestMicrophone')
});
