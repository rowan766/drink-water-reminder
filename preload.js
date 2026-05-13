'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 通过 contextBridge 安全地向渲染进程暴露主进程 API
// 渲染进程只能调用此处列出的方法，无法直接访问 Node.js 或 Electron 内部
contextBridge.exposeInMainWorld('electronAPI', {
  // 读取当前设置
  getSettings: () => ipcRenderer.invoke('get-settings'),

  // 保存设置（同时重置定时器）
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // 查询开机自启状态
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),

  // 设置开机自启
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),

  // 立即发送一条测试通知
  testNotification: () => ipcRenderer.invoke('test-notification'),

  // 获取下次提醒的时间戳（ms），用于倒计时显示
  getNextReminderTime: () => ipcRenderer.invoke('get-next-reminder-time')
});
