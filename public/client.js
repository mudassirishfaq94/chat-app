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
const inviteLabel = document.getElementById('inviteLabel');
const typingLabel = document.getElementById('typingLabel');

function getParams() {
  return new URLSearchParams(window.location.search);
}

function getRoomFromUrl() {
  return getParams().get('room');
}

function getInvitedByFromUrl() {
  return getParams().get('invitedBy');
}

function setRoomInUrl(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  window.history.replaceState({}, '', url);
}

function randomRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

// Persist name in localStorage
const savedName = localStorage.getItem('chatName');
if (savedName) {
  nameInputEl.value = savedName;
}

let currentRoom = getRoomFromUrl();
if (!currentRoom) {
  currentRoom = randomRoomId();
  setRoomInUrl(currentRoom);
}

const invitedBy = getInvitedByFromUrl();
if (invitedBy) {
  inviteLabel.textContent = `Invited by ${invitedBy}`;
}

function addMessage({ from = 'system', text = '', ts = Date.now(), system = false, self = false }) {
  const li = document.createElement('li');
  const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  li.className = `flex ${self ? 'justify-end' : 'justify-start'}`;
  const bubble = document.createElement('div');
  bubble.className = `max-w-[75%] px-3 py-2 rounded-xl text-sm shadow ${system ? 'bg-white/10 text-white/80 italic' : self ? 'bg-indigo-600 text-white' : 'bg-white text-slate-900'}`;
  bubble.innerText = system ? `[${time}] ${text}` : `${from} • ${time}\n${text}`;
  li.appendChild(bubble);

  const nearBottom = Math.abs(messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight) < 60;
  messagesEl.appendChild(li);
  if (nearBottom) messagesEl.scrollTop = messagesEl.scrollHeight; // smart auto-scroll
}

function updateRoomLabels() {
  roomLabel.textContent = `Room: ${currentRoom}`;
}

socket.on('connect', () => {
  updateRoomLabels();
  socket.emit('join-room', { roomId: currentRoom, name: nameInputEl.value.trim() || undefined });
  addMessage({ text: 'Connected to server', system: true });
  if (invitedBy) addMessage({ text: `You were invited by ${invitedBy}`, system: true });
});

socket.on('system', (text) => {
  addMessage({ text, system: true });
});

socket.on('online', (list) => {
  const count = Array.isArray(list) ? list.length : 0;
  onlineLabel.textContent = `Online: ${count}${count ? ' (' + list.join(', ') + ')' : ''}`;
});

// Typing indicators
const typingUsers = new Set();
function renderTyping() {
  if (typingUsers.size === 0) {
    typingLabel.textContent = '';
  } else {
    const names = Array.from(typingUsers);
    typingLabel.textContent = names.length === 1 ? `${names[0]} is typing...` : `${names.slice(0,2).join(' and ')}${names.length>2?` (+${names.length-2})`:''} are typing...`;
  }
}

socket.on('typing', ({ from, isTyping }) => {
  if (isTyping) {
    typingUsers.add(from);
  } else {
    typingUsers.delete(from);
  }
  renderTyping();
});

socket.on('message', (msg) => {
  const self = msg.from === (nameInputEl.value.trim() || '');
  addMessage({ ...msg, self });
});

// Send message
formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  socket.emit('message', text);
  inputEl.value = '';
  typingUsers.delete(nameInputEl.value.trim() || 'You');
  renderTyping();
});

// Enter to send, Shift+Enter for newline (textarea)
inputEl.addEventListener('keydown', (e) => {
  // typing indicator throttle
  triggerTyping();
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    formEl.dispatchEvent(new Event('submit'));
  }
});

inputEl.addEventListener('blur', () => {
  socket.emit('typing', false);
});

// Typing throttling
let typingTimeout;
function triggerTyping() {
  socket.emit('typing', true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit('typing', false), 1200);
}

setNameBtn.addEventListener('click', () => {
  const name = nameInputEl.value.trim();
  if (!name) return;
  socket.emit('set-name', name);
  localStorage.setItem('chatName', name);
  addMessage({ text: `You are now known as ${name}`, system: true });
});

copyLinkBtn.addEventListener('click', async () => {
  try {
    const hostName = nameInputEl.value.trim() || 'Someone';
    const url = new URL(window.location.href);
    url.searchParams.set('room', currentRoom);
    url.searchParams.set('invitedBy', hostName);
    await navigator.clipboard.writeText(url.toString());
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
