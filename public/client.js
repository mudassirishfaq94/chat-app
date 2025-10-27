const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('form');
const inputEl = document.getElementById('input');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
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
const adminLink = document.getElementById('adminLink');
const clearRoomBtn = document.getElementById('clearRoomBtn');
let systemLogHideTimer;
const SYSTEM_SHOW_MS = 6000; // show for ~6s (adjustable)
const SYSTEM_FADE_MS = 500;  // fade duration

// Modal elements
const signupOpen = document.getElementById('signupOpen');
const loginOpen = document.getElementById('loginOpen');
const signupModal = document.getElementById('signupModal');
const loginModal = document.getElementById('loginModal');
const signupClose = document.getElementById('signupClose');
const loginClose = document.getElementById('loginClose');
const signupBtn = document.getElementById('signupBtn');
const loginBtn = document.getElementById('loginBtn');
const authNameEl = document.getElementById('authName');
const authEmailEl = document.getElementById('authEmail');
const authPasswordEl = document.getElementById('authPassword');
const loginEmailEl = document.getElementById('loginEmail');
const loginPasswordEl = document.getElementById('loginPassword');
const appShell = document.getElementById('appShell');
const authGate = document.getElementById('authGate');
const friendsList = document.getElementById('friendsList');
const friendsToggle = document.getElementById('friendsToggle');
const mobileFriends = document.getElementById('mobileFriends');
const friendsListMobile = document.getElementById('friendsListMobile');
const navToggle = document.getElementById('navToggle');
const mobileNav = document.getElementById('mobileNav');
const actionsMenuBtn = document.getElementById('actionsMenuBtn');
const actionsMenu = document.getElementById('actionsMenu');
const menuNewRoom = document.getElementById('menuNewRoom');
const menuClearRoom = document.getElementById('menuClearRoom');
const menuSettings = document.getElementById('menuSettings');
const tabChat = document.getElementById('tabChat');
const tabFriends = document.getElementById('tabFriends');
const tabMore = document.getElementById('tabMore');
// Settings modal controls
const settingsModal = document.getElementById('settingsModal');
const settingsClose = document.getElementById('settingsClose');
const themeLight = document.getElementById('themeLight');
const themeDark = document.getElementById('themeDark');
const themeSystem = document.getElementById('themeSystem');
const reduceMotionToggle = document.getElementById('reduceMotionToggle');
const largeFontToggle = document.getElementById('largeFontToggle');


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

let socket;

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function getParams() { return new URLSearchParams(window.location.search); }
function getRoomFromUrl() { return getParams().get('room'); }
function getInvitedByFromUrl() { return getParams().get('invitedBy'); }
function setRoomInUrl(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  window.history.replaceState({}, '', url);
}
function randomRoomId() { return Math.random().toString(36).slice(2, 8); }

function updateNameDisplay(name) {
  const finalName = ((name !== undefined && name !== null) ? name : (nameInputEl.value || '')).trim();
  nameDisplayEl.textContent = `${finalName || 'Anonymous'}`;
}

let currentRoom = getRoomFromUrl();
if (!currentRoom) {
  currentRoom = randomRoomId();
  setRoomInUrl(currentRoom);
}
const invitedBy = getInvitedByFromUrl();
if (invitedBy) inviteLabel.textContent = `Invited by ${invitedBy}`;

function showSystemLog() {
  clearTimeout(systemLogHideTimer);
  systemLogEl.classList.remove('hidden');
  systemLogEl.classList.remove('opacity-0');
  systemLogEl.classList.add('opacity-100');
  systemLogHideTimer = setTimeout(() => {
    systemLogEl.classList.remove('opacity-100');
    systemLogEl.classList.add('opacity-0');
    setTimeout(() => systemLogEl.classList.add('hidden'), SYSTEM_FADE_MS);
  }, SYSTEM_SHOW_MS);
}
function addSystem(text) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.textContent = `[${time}] ${text}`;
  systemLogEl.appendChild(div);
  while (systemLogEl.childElementCount > 8) systemLogEl.removeChild(systemLogEl.firstElementChild);
  showSystemLog();
}

function addMessage({ id, from = 'system', text = '', ts = Date.now(), system = false, self = false, attachmentUrl = null, attachmentType = null, attachmentName = null, attachmentSize = null, attachmentMime = null }) {
  const li = document.createElement('li');
  if (id) li.setAttribute('data-id', id);
  li.dataset.messageId = id;
  
  const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  li.className = `flex ${self ? 'justify-end' : 'justify-start'} mb-3`;
  
  if (system) {
    const bubble = document.createElement('div');
    bubble.className = 'bg-slate-50 text-slate-500 italic px-3 py-2 rounded-xl text-sm shadow-sm';
    bubble.innerText = `[${time}] ${text}`;
    li.appendChild(bubble);
  } else {
    const bubbleClass = self 
      ? 'bg-blue-500 text-white rounded-l-2xl rounded-tr-2xl rounded-br-md' 
      : 'bg-gray-200 text-gray-800 rounded-r-2xl rounded-tl-2xl rounded-bl-md';
    
    const bubble = document.createElement('div');
    bubble.className = `max-w-xs lg:max-w-md px-4 py-2 ${bubbleClass} shadow-sm`;
    
    if (attachmentUrl) {
      let preview = '';
      if (attachmentType === 'image') {
        preview = `<img src="${attachmentUrl}" alt="${escapeHtml(attachmentName || 'image')}" class="rounded max-w-[min(70vw,480px)] object-contain" />`;
      } else if (attachmentType === 'video') {
        preview = `<video src="${attachmentUrl}" controls class="rounded w-full max-w-[min(70vw,480px)]"></video>`;
      } else {
        const sizeStr = attachmentSize ? ` (${Math.round(attachmentSize/1024)} KB)` : '';
        preview = `<a href="${attachmentUrl}" target="_blank" class="underline">${escapeHtml(attachmentName || 'file')}${sizeStr}</a>`;
      }
      bubble.innerHTML = `
        <div class="space-y-2">
          ${preview}
          ${text ? `<div class="text-sm break-words whitespace-pre-wrap">${escapeHtml(text)}</div>` : ''}
          <div class="flex items-center justify-between mt-1">
            <div class="text-xs opacity-70">${time}</div>
            ${self ? '<div class="message-status text-xs opacity-70 ml-2">Sent</div>' : ''}
          </div>
        </div>
      `;
    } else {
      bubble.innerHTML = `
        <div class="text-sm break-words whitespace-pre-wrap">${escapeHtml(text)}</div>
        <div class="flex items-center justify-between mt-1">
          <div class="text-xs opacity-70">${time}</div>
          ${self ? '<div class="message-status text-xs opacity-70 ml-2">Sent</div>' : ''}
        </div>
      `;
    }
    
    if (self && socket) {
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
    
    // Mark message as seen if it's not from current user
    if (!self && id) {
      setTimeout(() => {
        if (socket) socket.emit('message-seen', id);
      }, 1000);
    }
    
    // Show notification for new messages
    if (!self && !isWindowFocused) {
      unreadCount++;
      updateFavicon();
      document.title = `(${unreadCount}) ${originalTitle}`;
      showNotification('New message from ' + from, text || attachmentName || attachmentUrl);
    }
  }
  
  const nearBottom = Math.abs(messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight) < 60;
  messagesEl.appendChild(li);
  if (nearBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateRoomLabels() { roomLabel.textContent = `Room: ${currentRoom}`; }

function setAuthUI(isAuthed) {
  if (signupOpen) signupOpen.classList.toggle('hidden', !!isAuthed);
  if (loginOpen) loginOpen.classList.toggle('hidden', !!isAuthed);
  if (logoutBtn) logoutBtn.classList.toggle('hidden', !isAuthed);
  if (adminLink && !isAuthed) adminLink.classList.add('hidden');
  if (authGate) authGate.classList.toggle('hidden', !!isAuthed);
  if (appShell) appShell.classList.toggle('hidden', !isAuthed);
}

function connectSocket() {
  socket = io();

  socket.on('connect', async () => {
    updateRoomLabels();
    socket.emit('join-room', { roomId: currentRoom });
    addSystem('Connected to server');
    if (invitedBy) addSystem(`You were invited by ${invitedBy}`);
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        if (data && data.user && data.user.name) {
          nameInputEl.value = data.user.name;
          updateNameDisplay(data.user.name);
          setAuthUI(true);
          if (adminLink) adminLink.classList.toggle('hidden', !data.user.isAdmin);
        }
      } else {
        setAuthUI(false);
      }
    } catch {
      setAuthUI(false);
    }
  });

  socket.on('connect_error', (err) => {
    addSystem('Please log in to start chatting');
    setAuthUI(false);
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
    const li = messagesEl.querySelector(`li[data-id="${msgId}"]`);
    if (li) li.remove();
  });

  socket.on('room-cleared', () => {
    messagesEl.innerHTML = '';
    addSystem('Room history was cleared by the owner');
  });
}

// Send message
formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  if (!socket) { addSystem('Please log in first'); return; }
  socket.emit('message', text);
  inputEl.value = '';
  typingUsers.delete(nameInputEl.value.trim() || 'You');
  renderTyping();
});

// Attachments: button and input
if (attachBtn && fileInput) {
  attachBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files?.length) { uploadFiles(fileInput.files); fileInput.value=''; } });
}

// Drag & drop to messages area
messagesEl.addEventListener('dragover', (e)=>{ e.preventDefault(); });
messagesEl.addEventListener('drop', (e)=>{ e.preventDefault(); const files = e.dataTransfer?.files; if (files && files.length) uploadFiles(files); });

async function uploadFiles(fileList) {
  if (!socket) { addSystem('Please log in first'); return; }
  const fd = new FormData();
  const files = Array.from(fileList);
  for (const f of files) {
    if (f.size > 20*1024*1024) { addSystem(`File too large: ${f.name}`); continue; }
    fd.append('files', f);
  }
  if ([...fd].length === 0) return;
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) { addSystem('Upload failed'); return; }
    const data = await res.json();
    const atts = Array.isArray(data.attachments) ? data.attachments : [];
    for (const att of atts) {
      socket.emit('attachment', att);
    }
  } catch (e) {
    addSystem('Upload error');
  }
}
formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  if (!socket) { addSystem('Please log in first'); return; }
  socket.emit('message', text);
  inputEl.value = '';
  typingUsers.delete(nameInputEl.value.trim() || 'You');
  renderTyping();
});

// Enter to send; Shift+Enter for newline
// Auto-size input textarea to remove overflow scrollbars
function autosizeTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  const max = Math.min(el.scrollHeight, Math.floor(window.innerHeight * 0.4));
  el.style.height = max + 'px';
}
inputEl.addEventListener('input', () => autosizeTextarea(inputEl));
window.addEventListener('resize', () => autosizeTextarea(inputEl));
autosizeTextarea(inputEl);

inputEl.addEventListener('keydown', (e) => {
  triggerTyping();
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); formEl.dispatchEvent(new Event('submit')); }
});
inputEl.addEventListener('blur', () => { if (!socket) return; socket.emit('typing', false); });
let typingTimeout;
function triggerTyping() {
  if (!socket) return;
  socket.emit('typing', true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit('typing', false), 1200);
}

editNameBtn.addEventListener('click', () => { nameEditWrap.classList.remove('hidden'); nameInputEl.focus(); });
setNameBtn.addEventListener('click', () => {
  const name = nameInputEl.value.trim();
  if (!name) return;
  if (!socket) { addSystem('Please log in first'); return; }
  socket.emit('set-name', name);
  updateNameDisplay(name);
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
  if (!socket) { addSystem('Room created. Please log in to join and start chatting.'); return; }
  socket.emit('join-room', { roomId: currentRoom });
  addSystem(`Created new room: ${currentRoom}. Share the link to invite others!`);
});

nameInputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setNameBtn.click(); } });

// Modal controls
signupOpen.addEventListener('click', () => show(signupModal));
loginOpen.addEventListener('click', () => show(loginModal));
signupClose.addEventListener('click', () => hide(signupModal));
loginClose.addEventListener('click', () => hide(loginModal));

// Mobile friends drawer toggle with animation
function openFriendsDrawer() {
  if (!mobileFriends) return;
  mobileFriends.classList.remove('hidden');
  mobileFriends.classList.add('drawer-open');
}
function closeFriendsDrawer() {
  if (!mobileFriends) return;
  mobileFriends.classList.remove('drawer-open');
  setTimeout(() => mobileFriends.classList.add('hidden'), 200); // match CSS duration
}
if (friendsToggle && mobileFriends) {
  friendsToggle.addEventListener('click', () => {
    if (mobileFriends.classList.contains('hidden') || !mobileFriends.classList.contains('drawer-open')) {
      openFriendsDrawer();
    } else {
      closeFriendsDrawer();
    }
  });
}

// Mobile hamburger nav toggle
if (navToggle && mobileNav) {
  navToggle.addEventListener('click', () => {
    mobileNav.classList.toggle('hidden');
  });
}

// Overflow actions hamburger menu
function bindOverflowMenu() {
  if (!(actionsMenuBtn && actionsMenu)) return;
  const menuItems = actionsMenu.querySelectorAll('[role="menuitem"]');
  const toggleMenu = (open) => {
    const willOpen = open === undefined ? actionsMenu.classList.contains('hidden') : !!open;
    actionsMenu.classList.toggle('hidden', !willOpen);
    actionsMenu.classList.toggle('opacity-0', !willOpen);
    actionsMenu.classList.toggle('scale-95', !willOpen);
    actionsMenu.classList.toggle('opacity-100', willOpen);
    actionsMenu.classList.toggle('scale-100', willOpen);
    actionsMenuBtn.setAttribute('aria-expanded', String(willOpen));
    if (willOpen && menuItems.length) { menuItems[0].focus(); }
  };
  actionsMenuBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('click', () => { if (!actionsMenu.classList.contains('hidden')) toggleMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleMenu(false); });
  actionsMenu.addEventListener('keydown', (e) => {
    const items = Array.from(menuItems);
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(idx - 1 + items.length) % items.length]?.focus(); }
  });
  if (menuNewRoom) menuNewRoom.addEventListener('click', () => { toggleMenu(false); newRoomBtn?.click(); });
  if (menuClearRoom) menuClearRoom.addEventListener('click', () => { toggleMenu(false); clearRoomBtn?.click(); });
  if (menuSettings) menuSettings.addEventListener('click', () => { toggleMenu(false); show(settingsModal); });
}
bindOverflowMenu();

// Settings modal behavior & preferences
(function initSettings(){
  if (!settingsModal) return;
  // Load saved preferences
  const savedTheme = localStorage.getItem('theme');
  const savedReduced = localStorage.getItem('reduce-motion') === 'true';
  const savedLarge = localStorage.getItem('large-font') === 'true';
  // Enable smooth theme transitions globally (respects reduced motion)
  document.documentElement.classList.add('theme-animate');
  applyTheme(savedTheme || 'system');
  applyReducedMotion(savedReduced);
  applyLargeFont(savedLarge);
  if (reduceMotionToggle) reduceMotionToggle.checked = savedReduced;
  if (largeFontToggle) largeFontToggle.checked = savedLarge;

  // Wire controls
  settingsClose?.addEventListener('click', () => hide(settingsModal));
  themeLight?.addEventListener('click', () => { applyTheme('light'); localStorage.setItem('theme','light'); });
  themeDark?.addEventListener('click', () => { applyTheme('dark'); localStorage.setItem('theme','dark'); });
  themeSystem?.addEventListener('click', () => { applyTheme('system'); localStorage.setItem('theme','system'); });
  reduceMotionToggle?.addEventListener('change', (e) => { const v = !!e.target.checked; applyReducedMotion(v); localStorage.setItem('reduce-motion', String(v)); });
  largeFontToggle?.addEventListener('change', (e) => { const v = !!e.target.checked; applyLargeFont(v); localStorage.setItem('large-font', String(v)); });

  // Allow clicking backdrop to close
  settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) hide(settingsModal); });
})();

function applyTheme(mode){
  const root = document.documentElement;
  // Persist a local current mode used for reacting to system changes
  root.dataset.themeMode = mode;
  root.classList.remove('dark');
  let useDark = false;
  if (mode === 'dark') useDark = true;
  if (mode === 'system') {
    useDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  if (useDark) root.classList.add('dark');
  // Swap image/media sources for dark variants
  swapThemeMedia(useDark);
  // Update browser UI theme color (mobile address bar)
  setThemeColorMeta(getComputedStyle(root).getPropertyValue('--color-bg').trim());
}

function swapThemeMedia(isDark){
  document.querySelectorAll('img[data-light-src][data-dark-src]').forEach((img)=>{
    const next = isDark ? img.getAttribute('data-dark-src') : img.getAttribute('data-light-src');
    if (next && img.src !== next) { img.src = next; }
  });
  document.querySelectorAll('video[data-light-src][data-dark-src]').forEach((vid)=>{
    const next = isDark ? vid.getAttribute('data-dark-src') : vid.getAttribute('data-light-src');
    if (next) { vid.setAttribute('src', next); }
  });
}

function setThemeColorMeta(color){
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta){
    meta = document.createElement('meta');
    meta.setAttribute('name','theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', color || '#0F172A');
}

// React to system theme changes when user selects System
if (window.matchMedia){
  const m = window.matchMedia('(prefers-color-scheme: dark)');
  m.addEventListener('change', ()=>{
    const mode = document.documentElement.dataset.themeMode || localStorage.getItem('theme') || 'system';
    if (mode === 'system') applyTheme('system');
  });
}
function applyReducedMotion(on){
  const root = document.documentElement;
  root.classList.toggle('reduced-motion', !!on);
}
function applyLargeFont(on){
  const root = document.documentElement;
  root.classList.toggle('font-large', !!on);
}

// Bottom navigation behavior (mobile)
function bindBottomNav() {
  if (!(tabChat && tabFriends && tabMore)) return;
  tabChat.addEventListener('click', () => {
    // Ensure chat is visible
    closeFriendsDrawer();
    // Scroll to messages
    messagesEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  tabFriends.addEventListener('click', () => {
    if (mobileFriends.classList.contains('hidden') || !mobileFriends.classList.contains('drawer-open')) {
      openFriendsDrawer();
    } else {
      closeFriendsDrawer();
    }
  });
  tabMore.addEventListener('click', () => {
    // Prefer opening Settings directly for mobile More, and fallback to overflow actions menu
    if (settingsModal) {
      show(settingsModal);
    } else if (actionsMenuBtn) {
      actionsMenuBtn.click();
    }
  });
}
bindBottomNav();

// Swipe gestures for switching between chat and friends on mobile
(function bindSwipe() {
  let startX = 0, startY = 0, endX = 0, endY = 0;
  const threshold = 50; // minimum px for swipe
  const area = document.querySelector('main');
  if (!area) return;
  area.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    startX = t.clientX; startY = t.clientY;
  }, { passive: true });
  area.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    endX = t.clientX; endY = t.clientY;
    const dx = endX - startX; const dy = Math.abs(endY - startY);
    if (Math.abs(dx) > threshold && dy < 40) {
      // Horizontal swipe
      if (dx < 0) { // swipe left: open friends
        openFriendsDrawer();
      } else { // swipe right: close friends
        closeFriendsDrawer();
      }
    }
  }, { passive: true });
})();

async function postJSON(url, data) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

if (signupBtn) {
  signupBtn.addEventListener('click', async () => {
    try {
      const name = authNameEl.value.trim();
      const email = authEmailEl.value.trim();
      const password = authPasswordEl.value;
      await postJSON('/api/signup', { name, email, password });
      hide(signupModal);
      addSystem('Signup successful. Connecting...');
      setAuthUI(true);
      if (!socket || socket.disconnected) connectSocket();
    } catch (e) {
      alert(e.message);
    }
  });
}

if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    try {
      const email = loginEmailEl.value.trim();
      const password = loginPasswordEl.value;
      await postJSON('/api/login', { email, password });
      hide(loginModal);
      addSystem('Login successful. Connecting...');
      setAuthUI(true);
      if (!socket || socket.disconnected) connectSocket();
    } catch (e) {
      alert(e.message);
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await postJSON('/api/logout', {});
      addSystem('Logged out');
      if (socket) { try { socket.disconnect(); } catch {} }
      socket = undefined;
      onlineLabel.textContent = '';
      setAuthUI(false);
      updateNameDisplay('Anonymous');
      if (adminLink) adminLink.classList.add('hidden');
    } catch (e) {
      alert('Logout failed');
    }
  });
}

// Boot
setAuthUI(false);
connectSocket();
updateRoomLabels();

if (clearRoomBtn) {
  clearRoomBtn.addEventListener('click', () => {
    if (!socket) { addSystem('Please log in first'); return; }
    if (!confirm('Clear entire room history? This cannot be undone.')) return;
    socket.emit('clear-room');
  });
}

// Friends list management
function updateFriendsList(friends) {
  if (!friendsList && !friendsListMobile) return;
  
  if (friendsList) friendsList.innerHTML = '';
  if (friendsListMobile) friendsListMobile.innerHTML = '';
  
  const render = (container) => {
    if (!container) return;
    if (!friends || friends.length === 0) {
      container.innerHTML = '<div class="p-4 text-center text-slate-500 text-sm">No friends online</div>';
      return;
    }
    friends.forEach(friend => {
      const friendEl = document.createElement('div');
      friendEl.className = 'px-4 py-3 border-b border-gray-100 hover:bg-gray-100 cursor-pointer';
      const lastSeenText = friend.isOnline ? 'Online' : `Last seen ${formatLastSeen(friend.lastSeen)}`;
      const statusColor = friend.isOnline ? 'bg-green-500' : 'bg-gray-400';
      friendEl.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="relative">
            <div class="w-10 h-10 bg-slate-300 rounded-full flex items-center justify-center text-slate-600 font-semibold">
              ${friend.name.charAt(0).toUpperCase()}
            </div>
            <div class="absolute -bottom-1 -right-1 w-3 h-3 ${statusColor} border-2 border-white rounded-full"></div>
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-medium text-slate-800 truncate">${friend.name}</div>
            <div class="text-xs text-slate-500">${lastSeenText}</div>
          </div>
        </div>
      `;
      container.appendChild(friendEl);
    });
  };
  
  render(friendsList);
  render(friendsListMobile);
}

function formatLastSeen(lastSeenStr) {
  const lastSeen = new Date(lastSeenStr);
  const now = new Date();
  const diffMs = now - lastSeen;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return lastSeen.toLocaleDateString();
}
socket.on('friends-update', (friends) => {
  updateFriendsList(friends);
});

let unreadCount = 0;
let originalTitle = document.title;
let isWindowFocused = true;

// Window focus tracking for notifications
window.addEventListener('focus', () => {
  isWindowFocused = true;
  unreadCount = 0;
  updateFavicon();
  document.title = originalTitle;
});

window.addEventListener('blur', () => {
  isWindowFocused = false;
});

// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

function updateFavicon() {
  const favicon = document.querySelector('link[rel="icon"]') || document.createElement('link');
  favicon.rel = 'icon';
  
  if (unreadCount > 0) {
    // Create a canvas to draw the badge
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    // Draw red circle with count
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(16, 16, 16, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw count text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(unreadCount > 99 ? '99+' : unreadCount.toString(), 16, 16);
    
    favicon.href = canvas.toDataURL();
  } else {
    // Reset to default favicon (chat icon)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6a3 3 0 013-3h12a3 3 0 013 3v8a3 3 0 01-3 3H9.5l-3.2 2.4a1 1 0 01-1.6-.8V17H6a3 3 0 01-3-3V6z"/></svg>`;
    favicon.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  
  document.head.appendChild(favicon);
}

function showNotification(title, body, icon) {
  if (!isWindowFocused && 'Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body: body,
      icon: icon || 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6a3 3 0 013-3h12a3 3 0 013 3v8a3 3 0 01-3 3H9.5l-3.2 2.4a1 1 0 01-1.6-.8V17H6a3 3 0 01-3-3V6z"/></svg>`),
      tag: 'maddy-chat'
    });
    
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    
    setTimeout(() => notification.close(), 5000);
  }
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text || '').replace(/[&<>"']/g, (m) => map[m]);
}
socket.on('message-seen-by', (data) => {
  const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
  if (messageEl) {
    const statusEl = messageEl.querySelector('.message-status');
    if (statusEl) {
      statusEl.textContent = `Seen by ${data.seenBy}`;
      statusEl.classList.add('text-blue-400');
    }
  }
});