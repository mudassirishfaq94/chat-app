async function getJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Request failed: ' + res.status);
  return res.json();
}

function fmtDate(d) {
  try { return new Date(d).toLocaleString(); } catch { return String(d); }
}

async function ensureAdmin() {
  try {
    const me = await getJSON('/api/me');
    if (!me?.user?.isAdmin) {
      alert('You are not an admin. Redirecting to home.');
      location.href = '/';
      return null;
    }
    return me.user;
  } catch (e) {
    alert('Not authenticated. Redirecting to home.');
    location.href = '/';
    return null;
  }
}

function renderTable(headers, rows) {
  const th = headers.map(h => `<th class="px-2 py-1 text-left border-b border-[var(--border)] text-[var(--muted)]">${h}</th>`).join('');
  const trs = rows.map(r => `<tr>${r.map(c => `<td class="px-2 py-1 border-b border-[var(--border)]">${c}</td>`).join('')}</tr>`).join('');
  return `<table class="w-full text-xs">\n<thead><tr>${th}</tr></thead>\n<tbody>${trs}</tbody></table>`;
}

async function loadMe() {
  const me = await getJSON('/api/me');
  const el = document.getElementById('meBox');
  el.innerHTML = `
    <div>Name: <span class="text-[var(--fg)]">${me.user.name}</span></div>
    <div>Email: <span class="text-[var(--fg)]">${me.user.email}</span></div>
    <div>Admin: <span class="text-[var(--fg)]">${me.user.isAdmin ? 'Yes' : 'No'}</span></div>
  `;
}

async function loadOnline() {
  const data = await getJSON('/api/admin/online');
  const rows = (data.online || []).map(u => [u.userId, u.name, u.roomCode || '-', fmtDate(u.lastSeen), u.socketId]);
  const html = renderTable(['User ID', 'Name', 'Room', 'Last Seen', 'Socket'], rows);
  document.getElementById('onlineBox').innerHTML = html;
}

async function loadUsers() {
  const data = await getJSON('/api/admin/users');
  const rows = (data.users || []).map(u => [u.id, u.name, u.email, u.isAdmin ? 'Yes' : 'No', fmtDate(u.createdAt)]);
  const html = renderTable(['ID', 'Name', 'Email', 'Admin', 'Created'], rows);
  document.getElementById('usersBox').innerHTML = html;
}

async function loadRooms() {
  const data = await getJSON('/api/admin/rooms');
  const rows = (data.rooms || []).map(r => [r.id, r.code, r.ownerId, fmtDate(r.createdAt)]);
  const html = renderTable(['ID', 'Code', 'Owner ID', 'Created'], rows);
  document.getElementById('roomsBox').innerHTML = html;
}

async function loadMessages() {
  const roomCode = document.getElementById('roomFilter').value.trim();
  const url = roomCode ? `/api/admin/messages?roomCode=${encodeURIComponent(roomCode)}` : '/api/admin/messages';
  const data = await getJSON(url);
  const rows = (data.messages || []).map(m => [m.id, fmtDate(m.createdAt), m.room.code, m.user.name, m.text || '(attachment)', (m.attachmentType || '-')]);
  const html = renderTable(['ID', 'Time', 'Room', 'User', 'Text', 'Attachment'], rows);
  document.getElementById('messagesBox').innerHTML = html;
}

async function init() {
  const user = await ensureAdmin();
  if (!user) return;
  await loadMe();
  await loadOnline();
  await loadUsers();
  await loadRooms();
  await loadMessages();

  document.getElementById('reloadMsgs').addEventListener('click', loadMessages);
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
      location.href = '/';
    } catch {}
  });

  // Auto-refresh online and messages every 10s
  setInterval(() => { loadOnline(); loadMessages(); }, 10000);
}

init();