'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reminderAPI', {
  getMessage: () => ipcRenderer.invoke('get-reminder-message'),
  close:      () => ipcRenderer.send('close-reminder-window')
});
