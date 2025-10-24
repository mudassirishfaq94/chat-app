const socket = io();

const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('form');
const inputEl = document.getElementById('input');
const nameInputEl = document.getElementById('nameInput');
const setNameBtn = document.getElementById('setNameBtn');

function addMessage({ from = 'system', text = '', ts = Date.now(), system = false }) {
  const li = document.createElement('li');
  const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  li.className = `text-sm ${system ? 'text-slate-500 italic' : ''}`;
  li.textContent = system ? `[${time}] ${text}` : `[${time}] ${from}: ${text}`;
  messagesEl.appendChild(li);
  messagesEl.scrollTop = messagesEl.scrollHeight; // auto-scroll
}

socket.on('connect', () => {
  addMessage({ text: 'Connected to server', system: true });
});

socket.on('system', (text) => {
  addMessage({ text, system: true });
});

socket.on('message', (msg) => {
  addMessage(msg);
});

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  socket.emit('message', text);
  inputEl.value = '';
});

setNameBtn.addEventListener('click', () => {
  const name = nameInputEl.value.trim();
  if (!name) return;
  socket.emit('set-name', name);
});
