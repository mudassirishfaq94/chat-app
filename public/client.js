const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('form');
const inputEl = document.getElementById('input');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const voiceBtn = document.getElementById('voiceBtn');
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
let currentUserId = null;
let currentUserIsAdmin = false;

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

// --- Simple Room-Secret E2EE helpers (Option 2) ---
const ROOM_KEY_PREFIX = 'roomKey:';
function bytesToBase64(bytes){
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function base64ToBytes(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function toBase64Url(b64){ return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function fromBase64Url(b64url){
  let b64 = b64url.replace(/-/g,'+').replace(/_/g,'/');
  const pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4-pad);
  return b64;
}
function ensureRoomKeyString(roomId){
  let keyStr = localStorage.getItem(ROOM_KEY_PREFIX + roomId);
  if (!keyStr) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    keyStr = toBase64Url(bytesToBase64(bytes));
    localStorage.setItem(ROOM_KEY_PREFIX + roomId, keyStr);
  }
  return keyStr;
}
async function importRoomKey(roomId){
  const keyStr = ensureRoomKeyString(roomId);
  const raw = base64ToBytes(fromBase64Url(keyStr));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt','decrypt']);
}
async function encryptText(roomId, plain){
  const key = await importRoomKey(roomId);
  const iv = new Uint8Array(12); crypto.getRandomValues(iv);
  const data = new TextEncoder().encode(plain);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const ivB64url = toBase64Url(bytesToBase64(iv));
  const ctB64url = toBase64Url(bytesToBase64(new Uint8Array(ct)));
  return `e2ee:v1:${ivB64url}:${ctB64url}`;
}
async function decryptText(roomId, text){
  if (typeof text !== 'string' || !text.startsWith('e2ee:v1:')) return text;
  try {
    const parts = text.split(':');
    const iv = base64ToBytes(fromBase64Url(parts[2]));
    const ct = base64ToBytes(fromBase64Url(parts[3]));
    const key = await importRoomKey(roomId);
    const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(buf);
  } catch (e) {
    console.warn('E2EE decrypt error', e);
    return '[Encrypted message]';
  }
}
// E2EE helpers for attachments (binary)
async function encryptBytes(roomId, arrayBuffer){
  const key = await importRoomKey(roomId);
  const iv = new Uint8Array(12); crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, arrayBuffer);
  return { ivB64url: toBase64Url(bytesToBase64(iv)), cipherBytes: new Uint8Array(ct) };
}
async function decryptBytes(roomId, ivB64url, cipherArrayBuffer){
  try {
    const iv = base64ToBytes(fromBase64Url(ivB64url));
    const key = await importRoomKey(roomId);
    const ct = cipherArrayBuffer instanceof ArrayBuffer ? cipherArrayBuffer : cipherArrayBuffer.buffer;
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new Uint8Array(pt);
  } catch (e) {
    console.warn('E2EE decrypt bytes error', e);
    return null;
  }
}
function ingestRoomKeyFromUrl(roomId){
  try {
    const params = getParams();
    const rk = params.get('rk');
    if (rk) {
      localStorage.setItem(ROOM_KEY_PREFIX + roomId, rk);
      const url = new URL(window.location.href);
      url.searchParams.delete('rk');
      window.history.replaceState({}, '', url);
      addSystem('Imported room secret from invite link');
    }
    // Ensure a key exists for this room
    ensureRoomKeyString(roomId);
  } catch {}
}
// Initialize room secret on load
ingestRoomKeyFromUrl(currentRoom);

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

// Track which received messages we've emitted 'seen' for (to avoid duplicates)
const seenEmitted = new Set();

function renderStatusTicks(status, isSelfBubble) {
  // status: 'sent' | 'delivered' | 'seen'
  // Color rules:
  // - On blue (self) and in dark mode: use white for maximum contrast
  // - On light (white/gray) backgrounds: use black; for 'seen' we try blue, but ensure contrast
  const isDark = document.documentElement.classList.contains('dark');
  const baseClass = isSelfBubble ? 'text-white' : (isDark ? 'text-white' : 'text-black');
  const seenClass = isSelfBubble || isDark ? 'text-white' : 'text-blue-600';
  const colorClass = status === 'seen' ? seenClass : baseClass;
  // SVG uses currentColor for fill to inherit chosen class color
  const singleTick = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-3.5 h-3.5" fill="currentColor"><path d="M9 16.17l-3.88-3.88a1 1 0 10-1.41 1.41l4.59 4.59a1 1 0 001.41 0l9.59-9.59a1 1 0 10-1.41-1.41L9 16.17z"/></svg>';
  const doubleTick = '<span class="inline-flex items-center gap-[1px]">'
    + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-3.5 h-3.5" fill="currentColor"><path d="M7.5 16.5l-3.88-3.88a1 1 0 10-1.41 1.41l4.59 4.59a1 1 0 001.41 0l5.34-5.34a1 1 0 10-1.41-1.41L7.5 16.5z"/></svg>'
    + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-3.5 h-3.5 -ml-1" fill="currentColor"><path d="M12 16.17l-3.88-3.88a1 1 0 10-1.41 1.41l4.59 4.59a1 1 0 001.41 0l9.59-9.59a1 1 0 10-1.41-1.41L12 16.17z"/></svg>'
    + '</span>';
  const icon = status === 'sent' ? singleTick : doubleTick;
  return `<div class="message-status ${colorClass} text-xs opacity-70 ml-2" data-status="${status}">${icon}</div>`;
}

function addMessage({ id, from = 'system', text = '', ts = Date.now(), system = false, self = false, attachmentUrl = null, attachmentType = null, attachmentName = null, attachmentSize = null, attachmentMime = null, deletedAt = null, editedAt = null, attachmentEnc = false, attachmentIv = null }) {
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
    
    const isDeleted = !!deletedAt;
    const isEdited = !!editedAt;

    // Helper: icons
    const iconBtn = (svg, title) => {
      const btn = document.createElement('button');
      // No background behind the icon; keep accessibility ring only
      btn.className = 'p-1 rounded bg-transparent focus:outline-none focus:ring-2 focus:ring-black/20';
      btn.style.backgroundColor = 'transparent';
      btn.setAttribute('title', title);
      btn.innerHTML = svg;
      return btn;
    };

    const trashSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><path d="M9 3a1 1 0 00-1 1v1H5a1 1 0 100 2h14a1 1 0 100-2h-3V4a1 1 0 00-1-1H9zm1 6a1 1 0 012 0v8a1 1 0 11-2 0V9zm4 0a1 1 0 012 0v8a1 1 0 11-2 0V9z"/></svg>';
    const editSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';

    if (isDeleted) {
      const deletedText = self ? 'You deleted this message' : 'This message was deleted';
      bubble.innerHTML = `
        <div class="text-sm italic opacity-80 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm5 11H7a1 1 0 110-2h10a1 1 0 110 2z"/></svg>
          ${escapeHtml(deletedText)}
        </div>
        <div class="flex items-center justify-between mt-1">
          <div class="text-xs opacity-70">${time}</div>
        </div>
      `;
    } else if (attachmentUrl) {
      // Make attachment bubbles transparent and edge-to-edge
      bubble.className = 'max-w-[min(90vw,700px)] p-0 bg-transparent shadow-none';
      let preview = '';
      if (attachmentType === 'image') {
        preview = `<img src="${attachmentUrl}" alt="${escapeHtml(attachmentName || 'image')}" class="block w-full h-auto max-w-[min(90vw,700px)] rounded-lg object-contain" />`;
      } else if (attachmentType === 'video') {
        preview = `<video src="${attachmentUrl}" controls class="rounded w-full max-w-[min(90vw,700px)]"></video>`;
      } else if (attachmentMime && attachmentMime.startsWith('audio/')) {
        // Voice message: minimal, responsive player (no background)
        const duration = '0:00';
        preview = `
          <div class="voice-message flex items-center gap-3 p-2 min-w-[180px] max-w-[min(85vw,420px)]">
            <button class="voice-play-btn w-9 h-9 rounded-full border border-white/30 flex items-center justify-center hover:bg-white/10 transition-colors" data-audio-url="${attachmentUrl}">
              <svg class="play-icon w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              <svg class="pause-icon w-5 h-5 hidden" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
            </button>
            <div class="flex-1">
              <div class="voice-waveform h-6 rounded-full relative overflow-hidden">
                <div class="voice-progress h-full bg-white/50 rounded-full transition-all duration-100" style="width: 0%"></div>
                <div class="absolute inset-0 flex items-center justify-center">
                  <div class="flex gap-1">
                    ${Array.from({length: 20}, () => `<div class=\"w-1 bg-white/60 rounded-full\" style=\"height: ${Math.random() * 18 + 6}px\"></div>`).join('')}
                  </div>
                </div>
              </div>
              <div class="text-xs opacity-70 mt-1">🎤 Voice message • ${duration}</div>
            </div>
          </div>
        `;
      } else {
        const sizeStr = attachmentSize ? ` (${Math.round(attachmentSize/1024)} KB)` : '';
        preview = `<a href="${attachmentUrl}" target="_blank" class="underline">${escapeHtml(attachmentName || 'file')}${sizeStr}</a>`;
      }
      bubble.innerHTML = `
        <div class="space-y-2">
          ${preview}
          ${text ? `<div class="text-sm break-words whitespace-pre-wrap">${escapeHtml(text)}${isEdited ? ' <span class="text-xs opacity-70">(edited)</span>' : ''}</div>` : ''}
          <div class="flex items-center justify-between mt-1 px-2">
            <div class="text-xs opacity-70">${time}</div>
            ${self ? renderStatusTicks('sent', true) : ''}
          </div>
        </div>
      `;
      // If encrypted, fetch and decrypt
      if (attachmentEnc && attachmentIv && attachmentUrl) {
        (async () => {
          try {
            const r = await fetch(attachmentUrl);
            const encBuf = await r.arrayBuffer();
            const plain = await decryptBytes(currentRoom, attachmentIv, encBuf);
            if (!plain) throw new Error('decrypt failed');
            const blob = new Blob([plain], { type: attachmentMime || 'application/octet-stream' });
            const objUrl = URL.createObjectURL(blob);
            const img = bubble.querySelector('img');
            const vid = bubble.querySelector('video');
            const link = bubble.querySelector('a');
            const audioBtn = bubble.querySelector('.voice-play-btn');
            if (img) img.src = objUrl;
            if (vid) vid.src = objUrl;
            if (link) { link.href = objUrl; link.setAttribute('download', attachmentName || 'file'); }
            if (audioBtn) { audioBtn.dataset.audioUrl = objUrl; }
          } catch (e) {
            console.warn('Unable to decrypt attachment', e);
            const sys = document.createElement('div');
            sys.className = 'text-xs opacity-70 px-2';
            sys.textContent = 'Unable to decrypt attachment';
            bubble.appendChild(sys);
          }
        })();
      }
    } else {
      bubble.innerHTML = `
        <div class="text-sm break-words whitespace-pre-wrap">${escapeHtml(text)}${isEdited ? ' <span class="text-xs opacity-70">(edited)</span>' : ''}</div>
        <div class="flex items-center justify-between mt-1">
          <div class="text-xs opacity-70">${time}</div>
          ${self ? renderStatusTicks('sent', true) : ''}
        </div>
      `;
    }
    
    if ((self || currentUserIsAdmin) && socket && !isDeleted) {
      const wrap = document.createElement('div');
      wrap.className = 'flex items-start gap-2';
      wrap.style.position = 'relative';
      wrap.appendChild(bubble);

      // WhatsApp-like: kebab button shows on hover; click opens popup menu
      const kebabSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
      const kebabBtn = iconBtn(kebabSvg, 'Options');
      const anchor = document.createElement('div');
      anchor.setAttribute('data-message-actions', 'true');
      anchor.style.position = 'absolute';
      anchor.style.right = '-8px';
      anchor.style.top = '-8px';
      anchor.style.opacity = '0';
      anchor.style.transition = 'opacity 120ms ease';
      anchor.appendChild(kebabBtn);
      wrap.appendChild(anchor);
      li.appendChild(wrap);

      const showAnchor = () => { anchor.style.opacity = '1'; };
      const hideAnchor = () => { anchor.style.opacity = '0'; };
      wrap.addEventListener('mouseenter', showAnchor);
      wrap.addEventListener('mouseleave', hideAnchor);
      bubble.setAttribute('tabindex', '0');
      bubble.addEventListener('focus', showAnchor);
      bubble.addEventListener('blur', hideAnchor);
      bubble.addEventListener('click', () => { anchor.style.opacity = anchor.style.opacity === '1' ? '0' : '1'; });

      // Popup menu
      const menu = document.createElement('div');
      menu.className = 'text-sm';
      menu.style.position = 'absolute';
      menu.style.right = '0';
      menu.style.top = '18px';
      menu.style.background = '#ffffff';
      menu.style.color = '#0f172a';
      menu.style.border = '1px solid #e5e7eb';
      menu.style.borderRadius = '8px';
      menu.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)';
      menu.style.zIndex = '50';
      menu.style.minWidth = '160px';
      menu.style.display = 'none';
      menu.innerHTML = `
        <button class="w-full text-left px-3 py-2 hover:bg-gray-100">Edit message</button>
        <button class="w-full text-left px-3 py-2 hover:bg-gray-100">Delete message</button>
      `;
      anchor.appendChild(menu);

      const toggleMenu = (visible) => { menu.style.display = visible ? 'block' : 'none'; };
      kebabBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(menu.style.display !== 'block'); });
      document.addEventListener('click', (e) => { if (!menu.contains(e.target) && e.target !== kebabBtn) toggleMenu(false); });

      const [editBtn, deleteBtn] = menu.querySelectorAll('button');

      // Edit flow
      editBtn.addEventListener('click', () => {
        toggleMenu(false);
        if (attachmentUrl) return; // skip editing attachments
        const currentText = text || '';
        const editor = document.createElement('div');
        editor.className = 'mt-2 flex items-center gap-2';
        editor.style.background = '#ffffff';
        editor.style.border = '1px solid #e5e7eb';
        editor.style.borderRadius = '8px';
        editor.style.padding = '8px';
        editor.innerHTML = `
          <input type="text" class="flex-1 border rounded px-2 py-1 text-sm" value="${escapeHtml(currentText)}" />
          <button class="px-2 py-1 text-sm bg-blue-600 text-white rounded">Save</button>
          <button class="px-2 py-1 text-sm bg-gray-300 text-gray-900 rounded">Cancel</button>
        `;
        const input = editor.querySelector('input');
        const saveBtn = editor.querySelector('button:nth-of-type(1)');
        const cancelBtn = editor.querySelector('button:nth-of-type(2)');
        bubble.parentElement.insertBefore(editor, bubble.nextSibling);
        input.focus();
        const cleanup = () => editor.remove();
        cancelBtn.addEventListener('click', cleanup);
        saveBtn.addEventListener('click', async () => {
          const newText = input.value.trim();
          if (!newText || newText === currentText) { cleanup(); return; }
          if (socket && id) {
            saveBtn.disabled = true; saveBtn.textContent = 'Saving...';
            // Encrypt edited text with room secret
            let encryptedEdit = newText;
            try {
              encryptedEdit = await encryptText(currentRoom, newText);
            } catch (e) {
              console.error('E2EE encrypt (edit) error:', e);
              addSystem('Encryption failed; edit not sent');
              saveBtn.disabled = false; saveBtn.textContent = 'Save';
              return;
            }
            socket.emit('edit-message', { messageId: id, newText: encryptedEdit }, (res) => {
              saveBtn.disabled = false; saveBtn.textContent = 'Save';
              if (res && res.ok) {
                // Update UI immediately
                const textEl = bubble.querySelector('.text-sm.break-words.whitespace-pre-wrap');
                if (textEl) {
                  textEl.innerHTML = `${escapeHtml(newText)} <span class="text-xs opacity-70">(edited)</span>`;
                } else {
                  // Fallback: rebuild bubble content for text-only
                  bubble.innerHTML = `
                    <div class="text-sm break-words whitespace-pre-wrap">${escapeHtml(newText)} <span class="text-xs opacity-70">(edited)</span></div>
                    <div class="flex items-center justify-between mt-1">
                      <div class="text-xs opacity-70">${new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      ${self ? '<div class="message-status text-xs opacity-70 ml-2">Sent</div>' : ''}
                    </div>
                  `;
                }
                cleanup();
              } else {
                addSystem('Edit failed' + (res && res.error ? ': ' + res.error : ''));
              }
            });
          } else {
            cleanup();
          }
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') saveBtn.click();
          if (e.key === 'Escape') cancelBtn.click();
        });
      });

      // Delete flow: immediate action on menu click (no second confirm)
      deleteBtn.addEventListener('click', () => {
        console.log('[Delete] Menu clicked for message id=', id);
        toggleMenu(false);
        if (!id) return;
        if (!socket) { addSystem('Please log in first'); return; }
        // Quick visual state to show progress
        const status = bubble.querySelector('.message-status');
        if (status) { status.innerHTML = '<span class="text-xs">Deleting…</span>'; status.style.opacity = '0.7'; }
        let acked = false;
        const timeout = setTimeout(() => {
          if (!acked) {
            console.log('[Delete] No ack received within timeout for id=', id);
            addSystem('Delete failed: no response from server');
            if (status) { status.outerHTML = renderStatusTicks('sent', true); }
          }
        }, 6000);
        console.log('[Delete] Emitting delete-message for id=', id);
        socket.emit('delete-message', id, (res) => {
          acked = true; clearTimeout(timeout);
          console.log('[Delete] Ack received for id=', id, 'res=', res);
          if (res && res.ok) {
            // Update UI immediately to deleted placeholder
            const bubbleEl = wrap.querySelector('.max-w-xs') || wrap.querySelector('.lg\\:max-w-md') || wrap.querySelector('div[class*="max-w-"]') || bubble;
            const timeEl = bubbleEl?.querySelector('.text-xs.opacity-70');
            const timeText = timeEl ? timeEl.textContent : '';
            bubbleEl.innerHTML = `
              <div class="text-sm italic opacity-80 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm5 11H7a1 1 0 110-2h10a1 1 0 110 2z"/></svg>
                ${escapeHtml(self ? 'You deleted this message' : 'This message was deleted')}
              </div>
              <div class="flex items-center justify-between mt-1">
                <div class="text-xs opacity-70">${timeText || ''}</div>
              </div>
            `;
            // Remove kebab menu
            anchor.remove();
            addSystem('Message deleted');
          } else {
            console.log('[Delete] Delete failed for id=', id, 'error=', res && res.error);
            addSystem('Delete failed' + (res && res.error ? ': ' + res.error : ''));
            if (status) { status.outerHTML = renderStatusTicks('sent', true); }
          }
        });
      });
    } else {
      li.appendChild(bubble);
    }
    
    // Do NOT auto-send seen; we will send seen only when the user starts typing a reply
    
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
    addSystem('Connected to server');
    if (invitedBy) addSystem(`You were invited by ${invitedBy}`);
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        if (data && data.user && data.user.name) {
          nameInputEl.value = data.user.name;
          updateNameDisplay(data.user.name);
          currentUserId = data.user.id || null;
          currentUserIsAdmin = !!data.user.isAdmin;
          setAuthUI(true);
          if (adminLink) adminLink.classList.toggle('hidden', !data.user.isAdmin);
        }
      } else {
        setAuthUI(false);
      }
    } catch {
      setAuthUI(false);
    }
    // Join room AFTER user info is loaded, so history alignment computes correctly
    socket.emit('join-room', { roomId: currentRoom });
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
    // When the OTHER person starts typing, mark our last sent message as 'seen'
    try {
      const myName = (nameInputEl.value || '').trim();
      if (isTyping && from && from !== myName) {
        // Find the last self bubble (blue background) and update status to seen
        const selfBubbles = messagesEl.querySelectorAll('.bg-blue-500');
        const lastSelfBubble = selfBubbles[selfBubbles.length - 1];
        if (lastSelfBubble) {
          const statusEl = lastSelfBubble.querySelector('.message-status');
          if (statusEl) {
            statusEl.outerHTML = renderStatusTicks('seen', true);
          }
        }
      }
    } catch {}
  });

  socket.on('message', async (msg) => {
    const self = (msg.userId && currentUserId) ? (msg.userId === currentUserId) : (msg.from === (nameInputEl.value.trim() || ''));
    const decryptedText = await decryptText(currentRoom, msg.text);
    addMessage({ ...msg, text: decryptedText, self });
    // Recipient acknowledges delivery immediately upon receiving
    try {
      if (!self && msg.id) {
        socket.emit('message-delivered', msg.id);
      }
    } catch {}
  });

  socket.on('history', async (msgs) => {
    if (!Array.isArray(msgs)) return;
    for (const msg of msgs) {
      const self = (msg.userId && currentUserId) ? (msg.userId === currentUserId) : (msg.from === (nameInputEl.value.trim() || ''));
      const decryptedText = await decryptText(currentRoom, msg.text);
      addMessage({ ...msg, text: decryptedText, self });
    }
  });

  socket.on('message-deleted', (msgId) => {
    console.log('[Delete] message-deleted event received for id=', msgId);
    const li = messagesEl.querySelector(`li[data-id="${msgId}"]`);
    if (!li) return;
    // Replace bubble content with deleted placeholder
    const bubble = li.querySelector('.max-w-xs') || li.querySelector('.lg\\:max-w-md') || li.querySelector('div[class*="max-w-"]');
    if (!bubble) {
      // Fallback: find direct bubble inside li or its first child
      const direct = li.querySelector('div');
      if (direct) {
        const timeEl = direct.querySelector('.text-xs.opacity-70');
        const timeText = timeEl ? timeEl.textContent : '';
        direct.innerHTML = `
          <div class="text-sm italic opacity-80 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm5 11H7a1 1 0 110-2h10a1 1 0 110 2z"/></svg>
            This message was deleted
          </div>
          <div class="flex items-center justify-between mt-1">
            <div class="text-xs opacity-70">${timeText || ''}</div>
          </div>
        `;
      }
    } else {
      const timeEl = bubble?.querySelector('.text-xs.opacity-70');
      const timeText = timeEl ? timeEl.textContent : '';
      bubble.innerHTML = `
        <div class="text-sm italic opacity-80 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm5 11H7a1 1 0 110-2h10a1 1 0 110 2z"/></svg>
          This message was deleted
        </div>
        <div class="flex items-center justify-between mt-1">
          <div class="text-xs opacity-70">${timeText || ''}</div>
        </div>
      `;
    }
    // Remove actions for deleted message
    const actionsAnchor = li.querySelector('[data-message-actions="true"]');
    if (actionsAnchor) actionsAnchor.remove();
  });

  socket.on('message-edited', async (data) => {
    const li = messagesEl.querySelector(`li[data-id="${data.id}"]`);
    if (!li) return;
    const bubble = li.querySelector('.max-w-xs') || li.querySelector('.lg\\:max-w-md') || li.querySelector('div[class*="max-w-"]');
    if (!bubble) return;
    const textEl = bubble.querySelector('.text-sm.break-words.whitespace-pre-wrap');
    if (textEl) {
      const decrypted = await decryptText(currentRoom, data.text);
      textEl.innerHTML = `${escapeHtml(decrypted)} <span class="text-xs opacity-70">(edited)</span>`;
    }
  });

  socket.on('room-cleared', () => {
    messagesEl.innerHTML = '';
    addSystem('Room history was cleared by the owner');
  });
}

// Send message (handler defined later, with E2EE)

// Voice recording functionality
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

async function startVoiceRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      await uploadVoiceMessage(audioBlob);
      
      // Stop all tracks to release microphone
      stream.getTracks().forEach(track => track.stop());
    };
    
    mediaRecorder.start();
    isRecording = true;
    
    // Update UI
    voiceBtn.textContent = '🔴';
    voiceBtn.title = 'Stop recording';
    voiceBtn.classList.add('bg-red-100', 'text-red-700');
    voiceBtn.classList.remove('bg-slate-100', 'text-slate-700');
    
  } catch (error) {
    addSystem('Microphone access denied or not available');
    console.error('Voice recording error:', error);
  }
}

function stopVoiceRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    
    // Reset UI
    voiceBtn.textContent = '🎤';
    voiceBtn.title = 'Record voice message';
    voiceBtn.classList.remove('bg-red-100', 'text-red-700');
    voiceBtn.classList.add('bg-slate-100', 'text-slate-700');
  }
}

async function uploadVoiceMessage(audioBlob) {
  if (!socket) { 
    addSystem('Please log in first'); 
    return; 
  }
  
  const formData = new FormData();
  const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
  formData.append('files', audioFile);
  
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!res.ok) { 
      addSystem('Voice message upload failed'); 
      return; 
    }
    
    const data = await res.json();
    const attachments = Array.isArray(data.attachments) ? data.attachments : [];
    
    for (const att of attachments) {
      // Mark as voice message
      att.isVoiceMessage = true;
      socket.emit('attachment', att);
    }
  } catch (error) {
    addSystem('Voice message upload error');
    console.error('Voice upload error:', error);
  }
}

// Voice button event listener
if (voiceBtn) {
  voiceBtn.addEventListener('click', () => {
    if (isRecording) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
    }
  });
}

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
  const metas = [];
  for (const f of files) {
    if (f.size > 20*1024*1024) { addSystem(`File too large: ${f.name}`); continue; }
    try {
      const buf = await f.arrayBuffer();
      const { ivB64url, cipherBytes } = await encryptBytes(currentRoom, buf);
      const encBlob = new Blob([cipherBytes], { type: 'application/octet-stream' });
      const encFile = new File([encBlob], (f.name || 'file') + '.enc', { type: 'application/octet-stream' });
      fd.append('files', encFile);
      metas.push({ originalName: f.name, originalMime: f.type, originalSize: f.size, ivB64url });
    } catch (e) {
      console.error('E2EE attachment encrypt error:', e);
      addSystem(`Failed to encrypt attachment: ${f.name}`);
    }
  }
  if ([...fd].length === 0) return;
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) { addSystem('Upload failed'); return; }
    const data = await res.json();
    const atts = Array.isArray(data.attachments) ? data.attachments : [];
    for (let i = 0; i < atts.length; i++) {
      const att = atts[i] || {};
      const meta = metas[i] || {};
      let type = 'file';
      const mime = meta.originalMime || att.mime || 'application/octet-stream';
      if (mime.startsWith('image/')) type = 'image';
      else if (mime.startsWith('video/')) type = 'video';
      socket.emit('attachment', {
        url: att.url,
        name: meta.originalName || att.name,
        size: meta.originalSize || att.size,
        mime,
        type,
        enc: true,
        iv: meta.ivB64url,
      });
    }
  } catch (e) {
    addSystem('Upload error');
  }
}
formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  if (!socket) { addSystem('Please log in first'); return; }
  try {
    const cipher = await encryptText(currentRoom, text);
    socket.emit('message', cipher);
  } catch (err) {
    console.error('E2EE encrypt error:', err);
    addSystem('Encryption failed; message was not sent');
    return;
  }
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
  // Seen should only be emitted when the user starts typing a reply
  try {
    const receivedBubbles = messagesEl.querySelectorAll('.bg-gray-200, .dark\\:bg-gray-700');
    const lastReceivedBubble = receivedBubbles[receivedBubbles.length - 1];
    const li = lastReceivedBubble ? lastReceivedBubble.closest('li') : null;
    const msgId = li && li.dataset ? li.dataset.messageId : null;
    if (msgId && !seenEmitted.has(msgId)) {
      socket.emit('message-seen', msgId);
      seenEmitted.add(msgId);
    }
  } catch {}
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
    // Include room secret so invitee can decrypt messages
    const secret = ensureRoomKeyString(currentRoom);
    url.searchParams.set('rk', secret);
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
// Server tells sender that their message has been delivered to recipient
socket.on('message-delivered', (data) => {
  const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
  if (messageEl) {
    const bubbleEl = messageEl.querySelector('.bg-blue-500');
    const statusEl = bubbleEl ? bubbleEl.querySelector('.message-status') : null;
    if (statusEl) {
      const current = statusEl.getAttribute('data-status');
      if (current !== 'seen') {
        statusEl.outerHTML = renderStatusTicks('delivered', true);
      }
    }
  }
});

// Server tells sender that recipient has seen their message
socket.on('message-seen-by', (data) => {
  const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
  if (messageEl) {
    const bubbleEl = messageEl.querySelector('.bg-blue-500');
    const statusEl = bubbleEl ? bubbleEl.querySelector('.message-status') : null;
    if (statusEl) {
      statusEl.outerHTML = renderStatusTicks('seen', true);
    }
  }
});

// Voice message playback functionality
let currentAudio = null;
let currentPlayButton = null;

// Handle voice message play/pause
document.addEventListener('click', async (e) => {
  const playBtn = e.target.closest('.voice-play-btn');
  if (!playBtn) return;
  
  const audioUrl = playBtn.dataset.audioUrl;
  if (!audioUrl) return;
  
  const playIcon = playBtn.querySelector('.play-icon');
  const pauseIcon = playBtn.querySelector('.pause-icon');
  const voiceMessage = playBtn.closest('.voice-message');
  const progressBar = voiceMessage.querySelector('.voice-progress');
  
  // If clicking the same button while playing, pause
  if (currentAudio && currentPlayButton === playBtn && !currentAudio.paused) {
    currentAudio.pause();
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    return;
  }
  
  // Stop any currently playing audio
  if (currentAudio) {
    currentAudio.pause();
    if (currentPlayButton) {
      const prevPlayIcon = currentPlayButton.querySelector('.play-icon');
      const prevPauseIcon = currentPlayButton.querySelector('.pause-icon');
      prevPlayIcon.classList.remove('hidden');
      prevPauseIcon.classList.add('hidden');
    }
  }
  
  // Create new audio element
  currentAudio = new Audio(audioUrl);
  currentPlayButton = playBtn;
  
  // Update UI to show playing state
  playIcon.classList.add('hidden');
  pauseIcon.classList.remove('hidden');
  
  // Handle audio events
  currentAudio.addEventListener('loadedmetadata', () => {
    const duration = currentAudio.duration;
    const durationText = voiceMessage.querySelector('.text-xs');
    if (durationText && duration) {
      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60);
      durationText.textContent = `🎤 Voice message • ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  });
  
  currentAudio.addEventListener('timeupdate', () => {
    if (currentAudio.duration) {
      const progress = (currentAudio.currentTime / currentAudio.duration) * 100;
      progressBar.style.width = `${progress}%`;
    }
  });
  
  currentAudio.addEventListener('ended', () => {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    progressBar.style.width = '0%';
    currentAudio = null;
    currentPlayButton = null;
  });
  
  currentAudio.addEventListener('error', () => {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    addSystem('Error playing voice message');
    currentAudio = null;
    currentPlayButton = null;
  });
  
  // Start playing
  try {
    await currentAudio.play();
  } catch (error) {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    addSystem('Error playing voice message');
    currentAudio = null;
    currentPlayButton = null;
  }
});