'use strict';

window.reminderAPI.getMessage().then(msg => {
  document.getElementById('message').textContent = msg;
});

document.getElementById('btnAck').addEventListener('click', () => {
  window.reminderAPI.close();
});
