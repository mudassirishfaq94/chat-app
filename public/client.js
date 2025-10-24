const socket = io();

const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('form');
const inputEl = document.getElementById('input');
const nameInputEl = document.getElementById('nameInput');
const setNameBtn = document.getElementById('setNameBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const newRoomBtn = document.getElementById('newRoomBtn');
const roomLabel = document.getElementById('roomLabel');
const onlineLabel = document.getElementById('onlineLabel');

function getRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('room');
}

function setRoomInUrl(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  window.history.replaceState({}, '', url);
}

function randomRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

let currentRoom = getRoomFromUrl();
if (!currentRoom) {
  currentRoom = randomRoomId();
  setRoomInUrl(currentRoom);
}

function addMessage({ from = 'system', text = '', ts = Date.now(), system = false, self = false }) {
  const li = document.createElement('li');
  const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  li.className = `flex ${self ? 'justify-end' : 'justify-start'}`;
  const bubble = document.createElement('div');
  bubble.className = `max-w-[75%] px-3 py-2 rounded-xl text-sm shadow ${system ? 'bg-white/10 text-white/80 italic' : self ? 'bg-indigo-600 text-white' : 'bg-white text-slate-900'}`;
  bubble.innerText = system ? `[${time}] ${text}` : `${from} • ${time}\n${text}`;
  li.appendChild(bubble);
  messagesEl.appendChild(li);
  messagesEl.scrollTop = messagesEl.scrollHeight; // auto-scroll
}

function updateRoomLabels() {
  roomLabel.textContent = `Room: ${currentRoom}`;
}

socket.on('connect', () => {
  updateRoomLabels();
  socket.emit('join-room', { roomId: currentRoom, name: nameInputEl.value.trim() || undefined });
  addMessage({ text: 'Connected to server', system: true });
});

socket.on('system', (text) => {
  addMessage({ text, system: true });
});

socket.on('online', (list) => {
  const count = Array.isArray(list) ? list.length : 0;
  onlineLabel.textContent = `Online: ${count}${count ? ' (' + list.join(', ') + ')' : ''}`;
});

socket.on('message', (msg) => {
  const self = msg.from === (nameInputEl.value.trim() || '');
  addMessage({ ...msg, self });
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
  addMessage({ text: `You are now known as ${name}`, system: true });
});

copyLinkBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    copyLinkBtn.textContent = 'Link Copied!';
    setTimeout(() => (copyLinkBtn.textContent = 'Copy Invite Link'), 1500);
  } catch (err) {
    alert('Copy failed, please copy manually: ' + window.location.href);
  }
});

newRoomBtn.addEventListener('click', () => {
  const newRoom = randomRoomId();
  setRoomInUrl(newRoom);
  currentRoom = newRoom;
  updateRoomLabels();
  socket.emit('join-room', { roomId: currentRoom, name: nameInputEl.value.trim() || undefined });
  addMessage({ text: `Created new room: ${currentRoom}. Share the link to invite others!`, system: true });
});
