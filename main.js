'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, screen } = require('electron');
const path = require('path');
const fs   = require('fs');
const zlib = require('zlib');

// 单例锁：防止重复启动
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

/* ═══════════════════════════════
   设置管理
═══════════════════════════════ */

// 每次修改默认语句池时自增，触发已安装用户自动更新语句
const SETTINGS_VERSION = 2;

const DEFAULT_SETTINGS = {
  startTime: '08:30',
  endTime:   '18:30',
  interval:  60,                          // 提醒间隔（分钟）
  messages: [
    '该喝水啦！记得站起来活动一下～',
    '起来走走吧，顺手倒杯水！',
    '休息一分钟，喝点水，眼睛也要放松一下！',
    '久坐伤身，站起来伸个懒腰喝杯水！',
    '到点提醒：补充水分，活动颈椎！',
    '喝杯水吧，照顾好自己，才能更好地出发 🌿',
    '站起来走走，你已经坐了好一会儿了 💙',
    '眼睛累了就看看窗外，远处的风景在等你 🌤️',
    '深呼吸，伸个懒腰，给自己一分钟 ✨',
    '工作再忙，也别忘了喝水，身体最重要 🫶',
    '活动一下颈椎，轻轻转转头，舒服多了 🌸',
    '喝杯水，放松一下，好状态才有好工作 ☕',
    '别一直盯着屏幕啦，起来走两步吧 🌈',
    '你今天辛苦了，记得给自己补充能量 💪',
    '小小的休息，是为了走更长的路 🍃'
  ]
};

let settings = { ...DEFAULT_SETTINGS };

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const raw   = fs.readFileSync(getSettingsPath(), 'utf-8');
    const saved = JSON.parse(raw);

    // 兼容旧版单条 message 字段
    if (saved.message && !saved.messages) {
      saved.messages = DEFAULT_SETTINGS.messages;
      delete saved.message;
    }

    // 版本检测：语句池有更新时重置为最新默认语句，其余设置保留
    if (!saved.settingsVersion || saved.settingsVersion < SETTINGS_VERSION) {
      saved.messages        = DEFAULT_SETTINGS.messages;
      saved.settingsVersion = SETTINGS_VERSION;
    }

    settings = { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(newSettings) {
  settings = { ...settings, ...newSettings, settingsVersion: SETTINGS_VERSION };
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
}

/* ═══════════════════════════════
   占位图标生成
   若 assets/icon.png 不存在，自动生成 64×64 蓝色圆形 PNG
═══════════════════════════════ */

function generateIconPng(size = 64) {
  // CRC32 查找表（PNG 块校验所需）
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    tbl[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = (tbl[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)) >>> 0;
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const makeChunk = (type, data) => {
    const t   = Buffer.from(type);
    const d   = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const len = Buffer.allocUnsafe(4); len.writeUInt32BE(d.length);
    const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(Buffer.concat([t, d])));
    return Buffer.concat([len, t, d, crc]);
  };

  // IHDR：宽×高 size，颜色类型 6 = RGBA，位深 8
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // 像素数据：Windows 蓝 (#0078D4) 圆形，背景透明
  const rowBytes = 1 + size * 4;
  const raw = Buffer.alloc(size * rowBytes, 0);
  const cx  = size / 2;
  const cy  = size / 2;
  const r2  = (size * 0.42) ** 2;
  for (let y = 0; y < size; y++) {
    const base = y * rowBytes;
    raw[base] = 0; // 滤波类型：None
    for (let x = 0; x < size; x++) {
      const off = base + 1 + x * 4;
      if ((x - cx) ** 2 + (y - cy) ** 2 < r2) {
        raw[off]     = 0x00; // R
        raw[off + 1] = 0x78; // G
        raw[off + 2] = 0xD4; // B
        raw[off + 3] = 0xFF; // A（完全不透明）
      }
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG 文件头
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(raw)),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

function ensureIcon() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  if (!fs.existsSync(iconPath)) {
    fs.mkdirSync(path.join(__dirname, 'assets'), { recursive: true });
    fs.writeFileSync(iconPath, generateIconPng(64));
  }
  return iconPath;
}

/* ═══════════════════════════════
   系统托盘
═══════════════════════════════ */

let tray = null;

function createTray() {
  tray = new Tray(ensureIcon());
  tray.setToolTip('休息提醒');

  const contextMenu = Menu.buildFromTemplate([
    { label: '打开设置', click: createOrShowSettingsWindow },
    { type: 'separator' },
    { label: '立即提醒', click: showNotification },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        tray.destroy();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', createOrShowSettingsWindow); // 左键单击打开设置
}

/* ═══════════════════════════════
   设置窗口
═══════════════════════════════ */

let settingsWindow = null;
let reminderWindow = null;
let currentReminderMessage = '';

function createOrShowSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width:      600,
    height:     680,
    minWidth:   480,
    minHeight:  560,
    resizable:  true,
    title:      '休息提醒 - 设置',
    icon:      ensureIcon(),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false
    }
  });

  settingsWindow.setMenu(null); // 移除默认菜单栏
  settingsWindow.loadFile('index.html');
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

/* ═══════════════════════════════
   通知
═══════════════════════════════ */

let messageIndex    = 0;     // 轮询下标
let isTestReminder  = false; // 区分测试通知与真实提醒

function showNotification(isTest = false) {
  isTestReminder = isTest;

  const msgs = settings.messages;
  messageIndex = messageIndex % msgs.length;
  currentReminderMessage = msgs[messageIndex];
  // 测试通知不推进轮询下标，下次真实提醒从当前位置继续
  if (!isTest) messageIndex = (messageIndex + 1) % msgs.length;

  // 若弹窗已在显示，直接置顶即可
  if (reminderWindow && !reminderWindow.isDestroyed()) {
    reminderWindow.focus();
    return;
  }

  // 定位到屏幕右下角（距边缘 20px）
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winW = 340, winH = 170;

  reminderWindow = new BrowserWindow({
    width:           winW,
    height:          winH,
    x:               width  - winW - 20,
    y:               height - winH - 20,
    frame:           false,
    // transparent 在部分 Windows 驱动下会导致窗口不渲染，改用纯色背景
    backgroundColor: '#ffffff',
    alwaysOnTop:     true,
    resizable:       false,
    skipTaskbar:     true,
    title:           '休息一下',
    webPreferences: {
      preload:          path.join(__dirname, 'reminder-preload.js'),
      contextIsolation: true,
      nodeIntegration:  false
    }
  });

  reminderWindow.loadFile('reminder.html');
  reminderWindow.on('closed', () => { reminderWindow = null; });
}

/* ═══════════════════════════════
   定时提醒
═══════════════════════════════ */

let reminderTimer    = null;
let fallbackTimer    = null; // 弹窗未关闭时的兜底定时器
let nextReminderTime = 0;    // 下次提醒的时间戳（ms），供倒计时使用

// 判断当前时刻是否在工作时间内
function isWorkTime() {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = settings.startTime.split(':').map(Number);
  const [eh, em] = settings.endTime.split(':').map(Number);
  return cur >= sh * 60 + sm && cur <= eh * 60 + em;
}

// 调度下次提醒
// msDelay 传入时：从现在起等待指定毫秒（点击确认后重新计时）
// msDelay 不传时：计算到下一个固定整点的毫秒数（启动/保存设置时使用）
function scheduleNextReminder(msDelay) {
  if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }

  let delay;
  if (typeof msDelay === 'number') {
    delay = msDelay;
  } else {
    // 计算到下一个间隔整点
    const now      = new Date();
    const curMin   = now.getHours() * 60 + now.getMinutes();
    const interval = Math.max(1, settings.interval);
    const pastSlot = curMin % interval;
    const minsUntilNext = pastSlot === 0 ? interval : interval - pastSlot;
    delay = minsUntilNext * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds();
  }

  nextReminderTime = Date.now() + delay;

  reminderTimer = setTimeout(() => {
    if (isWorkTime()) {
      showNotification();
      // 正常流程：用户点"我知道了" → close-reminder-window IPC → scheduleNextReminder
      // 兜底：弹窗出现 60s 后若用户还未关闭，自动调度下次（防止计时链卡死）
      if (fallbackTimer) clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        if (reminderWindow && !reminderWindow.isDestroyed()) {
          scheduleNextReminder(settings.interval * 60_000);
        }
      }, 60_000);
    } else {
      // 不在工作时间，跳过提醒但必须继续调度，否则计时链断裂
      scheduleNextReminder(settings.interval * 60_000);
    }
  }, delay);
}

/* ═══════════════════════════════
   IPC 通信（供渲染进程调用）
═══════════════════════════════ */

ipcMain.handle('get-reminder-message', () => currentReminderMessage);
ipcMain.on('close-reminder-window', () => {
  // 用户关闭弹窗，取消兜底定时器
  if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
  if (reminderWindow && !reminderWindow.isDestroyed()) reminderWindow.close();
  // 测试通知不重置真实倒计时；真实提醒从点击时刻起重新计时
  if (!isTestReminder) scheduleNextReminder(settings.interval * 60_000);
});

ipcMain.handle('get-next-reminder-time', () => nextReminderTime);

ipcMain.handle('get-settings',      ()           => settings);
ipcMain.handle('save-settings',     (_, s)       => { saveSettings(s); scheduleNextReminder(); return true; });
ipcMain.handle('get-auto-start',    ()           => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('set-auto-start',    (_, enabled) => { app.setLoginItemSettings({ openAtLogin: enabled }); return true; });
ipcMain.handle('test-notification', ()           => { showNotification(true); return true; });

/* ═══════════════════════════════
   应用生命周期
═══════════════════════════════ */

// 第二个实例启动时，聚焦已有窗口
app.on('second-instance', createOrShowSettingsWindow);

app.whenReady().then(() => {
  // 设置 Windows Toast 通知的应用归属 ID（需与 build.appId 一致）
  app.setAppUserModelId('com.drinkwater.reminder');
  loadSettings();
  createTray();
  scheduleNextReminder();
});

// 所有窗口关闭时不退出应用，保持托盘驻留
app.on('window-all-closed', () => { /* 仅通过托盘"退出"才真正退出 */ });
