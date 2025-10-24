
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
const nameDisplayEl = document.getElementById('nameDisplay');
const editNameBtn = document.getElementById('editNameBtn');
const nameEditWrap = document.getElementById('nameEditWrap');
const systemLogEl = document.getElementById('systemLog');
const logoutBtn = document.getElementById('logoutBtn');
let systemLogHideTimer;
const SYSTEM_SHOW_MS = 6000; // show for ~6s (adjustable to 5-10s)
const SYSTEM_FADE_MS = 500;  // fade duration

// Load saved display name
const savedName = localStorage.getItem('chatName');
if (savedName) {
  nameInputEl.value = savedName;
}
updateNameDisplay();

const authPanelEl = document.getElementById('authPanel');
const authNameEl = document.getElementById('authName');
const authEmailEl = document.getElementById('authEmail');
const authPasswordEl = document.getElementById('authPassword');
const signupBtn = document.getElementById('signupBtn');
const loginBtn = document.getElementById('loginBtn');
const clearRoomBtn = document.getElementById('clearRoomBtn');

let socket; // init after auth

function getToken() {
  return localStorage.getItem('token');
}
function setToken(t) {
  localStorage.setItem('token', t);
}

function connectSocket() {
  const token = getToken();
  if (!token) {
    addSystem('Please sign up or log in to chat');
    authPanelEl?.classList.remove('hidden');
    return;
  }
  authPanelEl?.classList.add('hidden');
  socket = io({ auth: { token } });

  // Existing listeners re-registered
  socket.on('connect', () => {
    updateRoomLabels();
    socket.emit('join-room', { roomId: currentRoom });
    addSystem('Connected to server');
    if (invitedBy) addSystem(`You were invited by ${invitedBy}`);
  });

  socket.on('system', (text) => addSystem(text));
  socket.on('online', (list) => {
    const count = Array.isArray(list) ? list.length : 0;
    onlineLabel.textContent = `Online: ${count}`;
  });

  socket.on('typing', ({ from, isTyping }) => {
    if (isTyping) typingUsers.add(from); else typingUsers.delete(from);
    renderTyping();
  });

  socket.on('message', (msg) => {
    const self = msg.from === (nameInputEl.value.trim() || '');
    addMessage({ ...msg, self });
  });

  socket.on('history', (msgs) => {
    if (!Array.isArray(msgs)) return;
    msgs.forEach((msg) => {
      const self = msg.from === (nameInputEl.value.trim() || '');
      addMessage({ ...msg, self });
    });
  });

  socket.on('message-deleted', (msgId) => {
    // Remove message li that has data-id
    const li = messagesEl.querySelector(`li[data-id="${msgId}"]`);
    if (li) li.remove();
  });

  socket.on('room-cleared', () => {
    messagesEl.innerHTML = '';
    addSystem('Room history was cleared by the owner');
  });
}

// Signup/Login actions
async function postJSON(url, data) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

signupBtn?.addEventListener('click', async () => {
  try {
    const name = authNameEl.value.trim();
    const email = authEmailEl.value.trim();
    const password = authPasswordEl.value;
    const { token, user } = await postJSON('/api/signup', { name, email, password });
    setToken(token);
    localStorage.setItem('chatName', user.name);
    nameInputEl.value = user.name;
    updateNameDisplay();
    connectSocket();
  } catch (e) {
    alert(e.message);
  }
});

loginBtn?.addEventListener('click', async () => {
  try {
    const email = authEmailEl.value.trim();
    const password = authPasswordEl.value;
    const { token, user } = await postJSON('/api/login', { email, password });
    setToken(token);
    localStorage.setItem('chatName', user.name);
    nameInputEl.value = user.name;
    updateNameDisplay();
    connectSocket();
  } catch (e) {
    alert(e.message);
  }
});

clearRoomBtn?.addEventListener('click', () => {
  if (!socket) return alert('Please log in first');
  if (!confirm('Clear entire room history? This cannot be undone.')) return;
  socket.emit('clear-room');
});

// On load: if token exists, connect; otherwise show auth panel
if (getToken()) {
  connectSocket();
} else {
  authPanelEl?.classList.remove('hidden');
}

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

function updateNameDisplay() {
  const name = (nameInputEl.value || '').trim();
  nameDisplayEl.textContent = `You: ${name || 'Anonymous'}`;
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

function addMessage({ id, from = 'system', text = '', ts = Date.now(), system = false, self = false }) {
  const li = document.createElement('li');
  if (id) li.setAttribute('data-id', id);
  const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  li.className = `flex ${self ? 'justify-end' : 'justify-start'}`;
  const bubble = document.createElement('div');
  bubble.className = `max-w-[75%] px-3 py-2 rounded-xl text-sm shadow-sm ${system ? 'bg-slate-50 text-slate-500 italic' : self ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-900'}`;

  // Content
  bubble.innerText = system ? `[${time}] ${text}` : `${from} • ${time}\n${text}`;

  // Delete control for own messages
  if (!system && self && socket) {
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'ml-2 text-xs text-red-600 hover:underline';
    del.onclick = () => {
      if (!id) return;
      if (!confirm('Delete this message?')) return;
      socket.emit('delete-message', id);
    };
    const wrap = document.createElement('div');
    wrap.className = 'flex items-start';
    wrap.appendChild(bubble);
    wrap.appendChild(del);
    li.appendChild(wrap);
  } else {
    li.appendChild(bubble);
  }

  const nearBottom = Math.abs(messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight) < 60;
  messagesEl.appendChild(li);
  if (nearBottom) messagesEl.scrollTop = messagesEl.scrollHeight; // smart auto-scroll
}

function updateRoomLabels() {
  roomLabel.textContent = `Room: ${currentRoom}`;
}

function showSystemLog() {
  // cancel any pending hide
  clearTimeout(systemLogHideTimer);
  // make visible and fade in
  systemLogEl.classList.remove('hidden');
  systemLogEl.classList.remove('opacity-0');
  systemLogEl.classList.add('opacity-100');
  // schedule hide after delay
  systemLogHideTimer = setTimeout(() => {
    systemLogEl.classList.remove('opacity-100');
    systemLogEl.classList.add('opacity-0');
    setTimeout(() => {
      systemLogEl.classList.add('hidden');
    }, SYSTEM_FADE_MS);
  }, SYSTEM_SHOW_MS);
}

function addSystem(text) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.textContent = `[${time}] ${text}`;
  systemLogEl.appendChild(div);
  // Keep system log concise (last 8 entries)
  while (systemLogEl.childElementCount > 8) {
    systemLogEl.removeChild(systemLogEl.firstElementChild);
  }
  // show with fade and auto-hide
  showSystemLog();
}

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

// Send message
formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  if (!socket) {
    alert('Please sign up or log in first');
    return;
  }
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
  if (!socket) return;
  socket.emit('typing', false);
});

// Typing throttling
let typingTimeout;
function triggerTyping() {
  if (!socket) return;
  socket.emit('typing', true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit('typing', false), 1200);
}

editNameBtn.addEventListener('click', () => {
  nameEditWrap.classList.remove('hidden');
  nameInputEl.focus();
});

setNameBtn.addEventListener('click', () => {
  const name = nameInputEl.value.trim();
  if (!name) return;
  if (!socket) {
    alert('Please log in first');
    return;
  }
  socket.emit('set-name', name);
  localStorage.setItem('chatName', name);
  updateNameDisplay();
  nameEditWrap.classList.add('hidden');
  addSystem(`You are now known as ${name}`);
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
  if (!socket) {
    addSystem('Room created. Please log in to join and start chatting.');
    return;
  }
  socket.emit('join-room', { roomId: currentRoom });
  addSystem(`Created new room: ${currentRoom}. Share the link to invite others!`);
});

nameInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    setNameBtn.click();
  }
});

logoutBtn?.addEventListener('click', () => {
  try {
    localStorage.removeItem('token');
    addSystem('Logged out');
    if (socket) {
      try { socket.disconnect(); } catch {}
    }
    socket = undefined;
    authPanelEl?.classList.remove('hidden');
    onlineLabel.textContent = '';
  } catch (e) {
    alert('Logout failed');
  }
});