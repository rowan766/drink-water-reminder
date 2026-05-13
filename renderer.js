'use strict';

const api = window.electronAPI;

/* ─── 倒计时 ─── */

let nextReminderAt = 0;

async function refreshNextReminderTime() {
  nextReminderAt = await api.getNextReminderTime();
}

function updateCountdown() {
  const el = document.getElementById('countdown');
  if (!el) return;
  const remaining = nextReminderAt - Date.now();
  if (!nextReminderAt || remaining <= 0) { el.textContent = '--:--:--'; return; }
  const totalSec = Math.floor(remaining / 1000);
  const h   = Math.floor(totalSec / 3600);
  const m   = Math.floor((totalSec % 3600) / 60);
  const s   = totalSec % 60;
  el.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 每秒刷新显示
setInterval(updateCountdown, 1000);
// 每 10s 从主进程同步一次真实时间（防止累积误差或定时器被重置后不同步）
setInterval(refreshNextReminderTime, 10_000);

// 内存中维护的语句列表（保存时一并提交）
let messages = [];

/* ─── 渲染语句列表 ─── */

function renderMessages() {
  const list = document.getElementById('messageList');
  list.innerHTML = '';

  messages.forEach((msg, i) => {
    const li   = document.createElement('li');
    li.className = 'message-item';

    const span = document.createElement('span');
    span.className   = 'msg-text';
    span.textContent = msg;

    const btn = document.createElement('button');
    btn.className   = 'btn-delete';
    btn.title       = '删除';
    btn.textContent = '×';
    btn.addEventListener('click', () => {
      if (messages.length <= 1) {
        showStatus('⚠️ 至少保留一条提醒语句', true);
        return;
      }
      messages.splice(i, 1);
      renderMessages();
    });

    li.append(span, btn);
    list.appendChild(li);
  });
}

/* ─── 添加新语句 ─── */

function addMessage() {
  const input = document.getElementById('newMessage');
  const text  = input.value.trim();
  if (!text) return;
  if (messages.includes(text)) {
    showStatus('⚠️ 该语句已存在', true);
    return;
  }
  messages.push(text);
  renderMessages();
  input.value = '';
  // 滚动到列表底部
  const list = document.getElementById('messageList');
  list.scrollTop = list.scrollHeight;
}

document.getElementById('btnAdd').addEventListener('click', addMessage);

// 支持在输入框按 Enter 快速添加
document.getElementById('newMessage').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addMessage(); }
});

/* ─── 初始化：加载设置并填入表单 ─── */

async function init() {
  const [s, autoStart] = await Promise.all([
    api.getSettings(),
    api.getAutoStart()
  ]);

  document.getElementById('startTime').value   = s.startTime;
  document.getElementById('endTime').value     = s.endTime;
  document.getElementById('interval').value    = s.interval;
  document.getElementById('autoStart').checked = autoStart;

  messages = Array.isArray(s.messages) ? [...s.messages] : [];
  renderMessages();

  await refreshNextReminderTime();
  updateCountdown();
}

/* ─── 保存设置 ─── */

document.getElementById('btnSave').addEventListener('click', async () => {
  const intervalVal = parseInt(document.getElementById('interval').value, 10);

  if (!intervalVal || intervalVal < 1 || intervalVal > 240) {
    showStatus('⚠️ 提醒间隔请填写 1-240 的整数', true);
    return;
  }

  const startTime = document.getElementById('startTime').value;
  const endTime   = document.getElementById('endTime').value;
  if (startTime >= endTime) {
    showStatus('⚠️ 结束时间必须晚于开始时间', true);
    return;
  }

  if (messages.length === 0) {
    showStatus('⚠️ 至少保留一条提醒语句', true);
    return;
  }

  const autoStart = document.getElementById('autoStart').checked;

  await Promise.all([
    api.saveSettings({ startTime, endTime, interval: intervalVal, messages: [...messages] }),
    api.setAutoStart(autoStart)
  ]);

  await refreshNextReminderTime();
  updateCountdown();
  showStatus('✅ 设置已保存！');
});

/* ─── 测试通知 ─── */

document.getElementById('btnTest').addEventListener('click', async () => {
  await api.testNotification();
  showStatus('🔔 通知已发送，请查看右下角');
});

/* ─── 状态提示（自动淡出） ─── */

function showStatus(msg, isError = false) {
  const el = document.getElementById('statusMsg');
  el.textContent   = msg;
  el.style.color   = isError ? '#c00' : '#107c10';
  el.style.opacity = '1';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.opacity = '0'; }, 3000);
}

init();
