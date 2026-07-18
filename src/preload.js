const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  createProfile: (name) => ipcRenderer.invoke('create-profile', name),
  deleteProfile: (id) => ipcRenderer.invoke('delete-profile', id),
  setProfileDesc: (args) => ipcRenderer.invoke('set-profile-desc', args),
  listFiles: (profileId) => ipcRenderer.invoke('list-files', profileId),
  addFile: (args) => ipcRenderer.invoke('add-file', args),
  scheduleFile: (args) => ipcRenderer.invoke('schedule-file', args),
  deleteFile: (args) => ipcRenderer.invoke('delete-file', args),
  setFilePlatforms: (args) => ipcRenderer.invoke('set-file-platforms', args),
  setFilePrivacy: (args) => ipcRenderer.invoke('set-file-privacy', args),
  setFileKids: (args) => ipcRenderer.invoke('set-file-kids', args),
  renameFile: (args) => ipcRenderer.invoke('rename-file', args),
  resetFile: (args) => ipcRenderer.invoke('reset-file', args),
  getQuota: (profileId) => ipcRenderer.invoke('get-quota', profileId),
  authPlatform: (args) => ipcRenderer.invoke('auth-platform', args),
  disconnectPlatform: (args) => ipcRenderer.invoke('disconnect-platform', args),
  runDaily: (profileId) => ipcRenderer.invoke('run-daily', profileId),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getSecrets: () => ipcRenderer.invoke('get-secrets'),
  saveSecrets: (secrets) => ipcRenderer.invoke('save-secrets', secrets),
  onProgress: (cb) => ipcRenderer.on('upload-progress', (_e, data) => cb(data)),
};

contextBridge.exposeInMainWorld('api', api);
