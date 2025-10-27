const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cookie = require('cookie');
const fs = require('fs');
const multer = require('multer');
// Load environment variables and initialize Supabase client
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'chat-media';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';

const prisma = new PrismaClient();

// Bootstrap an admin user from environment variables (non-destructive)
// Set ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME (optional), and ADMIN_FORCE_RESET=true to reset password
async function bootstrapAdmin() {
  try {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME || 'Admin';
    const forceReset = String(process.env.ADMIN_FORCE_RESET || '').toLowerCase() === 'true';

    if (!email || !password) {
      console.log('[admin] bootstrap skipped: ADMIN_EMAIL or ADMIN_PASSWORD not set');
      return;
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const passwordHash = await bcrypt.hash(password, 10);
      user = await prisma.user.create({
        data: { name, email, passwordHash, isAdmin: true },
      });
      console.log(`[admin] created admin user: ${email}`);
      return;
    }

    const updates = {};
    if (!user.isAdmin) updates.isAdmin = true;
    if (name && user.name !== name) updates.name = name;
    if (forceReset) {
      updates.passwordHash = await bcrypt.hash(password, 10);
    }
    if (Object.keys(updates).length > 0) {
      await prisma.user.update({ where: { id: user.id }, data: updates });
      console.log(`[admin] updated admin user: ${email}${forceReset ? ' (password reset)' : ''}`);
    } else {
      console.log(`[admin] admin user already exists: ${email}`);
    }
  } catch (e) {
    console.error('[admin] bootstrap error:', e);
  }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from public
app.use(express.static(path.join(__dirname, 'public')));
// Serve uploaded files
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Auth endpoints (HTTP-only cookies)
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'Email already in use' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { name, email, passwordHash } });
    const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'strict', secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('Signup error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'strict', secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/logout', (req, res) => {
  try {
    res.clearCookie('token');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/me', async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Unauthenticated' });
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.uid } });
    if (!user) return res.status(401).json({ error: 'Unauthenticated' });
    res.json({ user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
  } catch (err) {
    res.status(401).json({ error: 'Unauthenticated' });
  }
});

// Upload endpoint (multipart/form-data)
function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Unauthenticated' });
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.uid;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
}

async function requireAdmin(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || !user.isAdmin) return res.status(403).json({ error: 'Forbidden' });
    next();
  } catch (e) {
    return res.status(403).json({ error: 'Forbidden' });
  }
}

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB each
});

app.post('/api/upload', requireAuth, upload.array('files', 8), async (req, res) => {
  try {
    const files = req.files || [];
    const attachments = [];

    for (const f of files) {
      const mime = f.mimetype || 'application/octet-stream';
      let type = 'file';
      if (mime.startsWith('image/')) type = 'image';
      else if (mime.startsWith('video/')) type = 'video';

      const ext = path.extname(f.originalname || '') || '';
      const base = path.basename(f.originalname || '', ext).replace(/[^a-zA-Z0-9_-]/g, '_') || 'file';
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const objectPath = `user/${req.userId}/uploads/${unique}-${base}${ext}`;

      // Upload to Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(objectPath, f.buffer, { contentType: mime, upsert: false });
      if (uploadErr) {
        console.error('Supabase upload error:', uploadErr);
        continue; // skip this file
      }

      // Generate a signed URL for client to access
      const { data: signed, error: signErr } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .createSignedUrl(objectPath, 60 * 60 * 24 * 7); // 7 days

      if (signErr || !signed?.signedUrl) {
        console.error('Supabase signed URL error:', signErr);
        continue;
      }

      attachments.push({
        url: signed.signedUrl,
        name: f.originalname,
        size: f.size,
        mime,
        type,
        // Also include storage reference for potential server-side usage
        storage: { bucket: SUPABASE_BUCKET, path: objectPath }
      });
    }

    res.json({ attachments });
  } catch (e) {
    console.error('Upload handler error:', e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Admin APIs
app.get('/api/admin/online', requireAuth, requireAdmin, async (req, res) => {
  try {
    const list = Array.from(onlineUsers.entries()).map(([userId, v]) => ({
      userId,
      name: v.name,
      lastSeen: v.lastSeen,
      roomCode: v.roomCode,
      socketId: v.socketId,
    }));
    res.json({ online: list });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, isAdmin: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/rooms', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rooms = await prisma.room.findMany({
      select: { id: true, code: true, ownerId: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ rooms });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/messages', requireAuth, requireAdmin, async (req, res) => {
  try {
    const roomCode = req.query.roomCode || null;
    const take = Math.min(Number(req.query.limit) || 100, 500);
    let roomFilter = {};
    if (roomCode) {
      const room = await prisma.room.findUnique({ where: { code: roomCode } });
      if (room) roomFilter = { roomId: room.id };
    }
    const messages = await prisma.message.findMany({
      where: { deletedAt: null, ...roomFilter },
      orderBy: { createdAt: 'desc' },
      take,
      include: { user: true, room: true },
    });
    const data = messages.map(m => ({
      id: m.id,
      text: m.text,
      createdAt: m.createdAt,
      user: { id: m.user.id, name: m.user.name, email: m.user.email },
      room: { id: m.room.id, code: m.room.code },
      attachmentUrl: m.attachmentUrl,
      attachmentType: m.attachmentType,
      attachmentName: m.attachmentName,
      attachmentSize: m.attachmentSize,
      attachmentMime: m.attachmentMime,
    }));
    res.json({ messages: data });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin dashboard page
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Socket auth middleware (reads JWT from cookie)
io.use(async (socket, next) => {
  try {
    const rawCookie = socket.handshake.headers && socket.handshake.headers.cookie;
    if (!rawCookie) return next(new Error('unauthorized'));
    const parsed = cookie.parse(rawCookie);
    const token = parsed.token;
    if (!token) return next(new Error('unauthorized'));
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.uid } });
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = { id: user.id, name: user.name, email: user.email };
    next();
  } catch (e) {
    next(new Error('unauthorized'));
  }
});

// Room state: roomCode -> Map(socketId -> name)
const rooms = new Map();
const onlineUsers = new Map(); // userId -> { name, lastSeen, socketId, roomCode }

io.on('connection', (socket) => {
  // Set default name from authenticated user
  socket.data.name = socket.data.user?.name || `Guest-${Math.floor(1000 + Math.random() * 9000)}`;

  // Client will call join-room with room code (string)
  socket.on('join-room', async ({ roomId }) => {
    if (!roomId) return;

    // Leave old room if any
    if (socket.data.roomCode) {
      const oldCode = socket.data.roomCode;
      socket.leave(oldCode);
      const oldRoomMap = rooms.get(oldCode);
      if (oldRoomMap) {
        oldRoomMap.delete(socket.id);
        io.to(oldCode).emit('online', Array.from(oldRoomMap.values()));
      }
    }

    // Ensure a Room exists for this code
    let room = await prisma.room.findUnique({ where: { code: roomId } });
    if (!room) {
      // create room owned by current user
      room = await prisma.room.create({ data: { code: roomId, ownerId: socket.data.user.id } });
      socket.emit('system', `Created new room ${roomId}`);
    }

    // Ensure membership exists
    await prisma.membership.upsert({
      where: { userId_roomId: { userId: socket.data.user.id, roomId: room.id } },
      update: {},
      create: { userId: socket.data.user.id, roomId: room.id },
    });

    // Join socket.io room by code
    socket.join(roomId);
    socket.data.roomCode = roomId;
    socket.data.roomDbId = room.id;

    if (!rooms.has(roomId)) rooms.set(roomId, new Map());
    const roomUsers = rooms.get(roomId);
    roomUsers.set(socket.id, socket.data.name);

    // Track online user with last seen
    onlineUsers.set(socket.data.user.id, {
      name: socket.data.name,
      lastSeen: new Date(),
      socketId: socket.id,
      roomCode: roomId
    });

    socket.emit('system', `You joined room ${roomId} as ${socket.data.name}`);
    socket.broadcast.to(roomId).emit('system', `${socket.data.name} joined the room`);
    io.to(roomId).emit('online', Array.from(roomUsers.values()));

    // Emit updated friends list to all users
    const friendsList = Array.from(onlineUsers.values()).map(user => ({
      name: user.name,
      isOnline: true,
      lastSeen: user.lastSeen
    }));
    io.emit('friends-update', friendsList);

    // Send recent chat history (last 100 messages) for this room
    try {
      const history = await prisma.message.findMany({
        where: { roomId: room.id },
        orderBy: { createdAt: 'asc' },
        take: 100,
        include: { user: true },
      });
      socket.emit('history', history.map((m) => ({
        id: m.id,
        userId: m.userId,
        from: m.user.name,
        text: m.text,
        ts: new Date(m.createdAt).getTime(),
        deletedAt: m.deletedAt ? new Date(m.deletedAt).getTime() : null,
        editedAt: m.editedAt ? new Date(m.editedAt).getTime() : null,
        attachmentUrl: m.attachmentUrl || null,
        attachmentType: m.attachmentType || null,
        attachmentName: m.attachmentName || null,
        attachmentSize: m.attachmentSize || null,
        attachmentMime: m.attachmentMime || null,
        attachmentEnc: m.attachmentEnc || false,
        attachmentIv: m.attachmentIv || null,
        // Reply / Forward metadata
        replyToId: m.replyToId || null,
        forwardFromMessageId: m.forwardFromMessageId || null,
        forwardedByUserId: m.forwardedByUserId || null,
        forwardedOriginalSenderName: m.forwardedOriginalSenderName || null,
        forwardedOriginalTimestamp: m.forwardedOriginalTimestamp ? new Date(m.forwardedOriginalTimestamp).getTime() : null,
      })));
    } catch (err) {
      console.error('Error loading history:', err);
    }
  });

  // List rooms the current user is a member of (for forwarding UI)
  socket.on('list-my-rooms', async (ack) => {
    try {
      const memberships = await prisma.membership.findMany({
        where: { userId: socket.data.user.id },
        include: { room: true },
        orderBy: { createdAt: 'desc' },
      });
      const roomsList = memberships.map(m => ({ id: m.room.id, code: m.room.code }));
      if (ack) ack({ ok: true, rooms: roomsList });
    } catch (e) {
      if (ack) ack({ ok: false, error: 'Failed to list rooms' });
    }
  });

  // Broadcast message to current room and persist with ownership
  socket.on('message', async (payload) => {
    const roomCode = socket.data.roomCode;
    const roomDbId = socket.data.roomDbId;
    if (!roomCode || !roomDbId) return; // not in a room
    const isObj = payload && typeof payload === 'object' && !Array.isArray(payload);
    const msgText = String((isObj ? payload.text : payload) || '').trim();
    const replyToId = isObj ? (payload.replyToId ? Number(payload.replyToId) : null) : null;
    const forwardFromMessageId = isObj ? (payload.forwardFromMessageId ? Number(payload.forwardFromMessageId) : null) : null;
    const forwardedOriginalSenderName = isObj ? (payload.forwardedOriginalSenderName || null) : null;
    const forwardedOriginalTimestamp = isObj && payload.forwardedOriginalTimestamp ? new Date(Number(payload.forwardedOriginalTimestamp)) : null;
    if (!msgText) return;

    try {
      const created = await prisma.message.create({
        data: {
          roomId: roomDbId,
          userId: socket.data.user.id,
          text: msgText,
          replyToId: replyToId || undefined,
          forwardFromMessageId: forwardFromMessageId || undefined,
          forwardedByUserId: forwardFromMessageId ? socket.data.user.id : undefined,
          forwardedOriginalSenderName: forwardedOriginalSenderName || undefined,
          forwardedOriginalTimestamp: forwardedOriginalTimestamp || undefined,
        },
      });
      const msg = {
        id: created.id,
        userId: socket.data.user.id,
        from: socket.data.name,
        text: msgText,
        ts: new Date(created.createdAt).getTime(),
        replyToId: created.replyToId || null,
        forwardFromMessageId: created.forwardFromMessageId || null,
        forwardedByUserId: created.forwardedByUserId || null,
        forwardedOriginalSenderName: created.forwardedOriginalSenderName || null,
        forwardedOriginalTimestamp: created.forwardedOriginalTimestamp ? new Date(created.forwardedOriginalTimestamp).getTime() : null,
      };
      io.to(roomCode).emit('message', msg);
    } catch (err) {
      console.error('Error saving message:', err);
    }
  });

  // Broadcast attachment to current room and persist with metadata
  // Supports room-secret E2EE for attachments
  socket.on('attachment', async (att) => {
    const roomCode = socket.data.roomCode;
    const roomDbId = socket.data.roomDbId;
    if (!roomCode || !roomDbId) return;
    if (!att || !att.url) return;
    try {
      const created = await prisma.message.create({
        data: {
          roomId: roomDbId,
          userId: socket.data.user.id,
          text: '',
          attachmentUrl: att.url,
          attachmentType: att.type || null,
          attachmentName: att.name || null,
          attachmentSize: att.size || null,
          attachmentMime: att.mime || null,
          attachmentEnc: att.enc ? true : false,
          attachmentIv: att.enc && att.iv ? String(att.iv) : null,
          replyToId: att.replyToId ? Number(att.replyToId) : undefined,
          forwardFromMessageId: att.forwardFromMessageId ? Number(att.forwardFromMessageId) : undefined,
          forwardedByUserId: att.forwardFromMessageId ? socket.data.user.id : undefined,
          forwardedOriginalSenderName: att.forwardedOriginalSenderName || undefined,
          forwardedOriginalTimestamp: att.forwardedOriginalTimestamp ? new Date(Number(att.forwardedOriginalTimestamp)) : undefined,
        },
      });
      const msg = {
        id: created.id,
        from: socket.data.name,
        text: '',
        ts: new Date(created.createdAt).getTime(),
        attachmentUrl: created.attachmentUrl,
        attachmentType: created.attachmentType,
        attachmentName: created.attachmentName,
        attachmentSize: created.attachmentSize,
        attachmentMime: created.attachmentMime,
        attachmentEnc: created.attachmentEnc,
        attachmentIv: created.attachmentIv,
        replyToId: created.replyToId || null,
        forwardFromMessageId: created.forwardFromMessageId || null,
        forwardedByUserId: created.forwardedByUserId || null,
        forwardedOriginalSenderName: created.forwardedOriginalSenderName || null,
        forwardedOriginalTimestamp: created.forwardedOriginalTimestamp ? new Date(created.forwardedOriginalTimestamp).getTime() : null,
      };
      io.to(roomCode).emit('message', msg);
    } catch (err) {
      console.error('Error saving attachment:', err);
    }
  });

  // Forward pre-encrypted items to specific target rooms
  // Payload: { items: [{ roomCode, text?, attachment?: { url, type, name, size, mime, enc, iv }, replyToId?, forwardFromMessageId?, forwardedOriginalSenderName?, forwardedOriginalTimestamp? }] }
  socket.on('forward-to', async (payload, ack) => {
    if (!payload || !Array.isArray(payload.items)) { if (ack) ack({ ok: false, error: 'Invalid payload' }); return; }
    const results = [];
    for (const item of payload.items) {
      try {
        if (!item.roomCode) { results.push({ ok: false, error: 'Missing roomCode' }); continue; }
        let room = await prisma.room.findUnique({ where: { code: item.roomCode } });
        if (!room) {
          room = await prisma.room.create({ data: { code: item.roomCode, ownerId: socket.data.user.id } });
          await prisma.membership.create({ data: { userId: socket.data.user.id, roomId: room.id } });
        } else {
          // Ensure membership
          await prisma.membership.upsert({
            where: { userId_roomId: { userId: socket.data.user.id, roomId: room.id } },
            update: {},
            create: { userId: socket.data.user.id, roomId: room.id },
          });
        }
        const data = {
          roomId: room.id,
          userId: socket.data.user.id,
          text: item.text || '',
          attachmentUrl: item.attachment?.url || null,
          attachmentType: item.attachment?.type || null,
          attachmentName: item.attachment?.name || null,
          attachmentSize: item.attachment?.size || null,
          attachmentMime: item.attachment?.mime || null,
          attachmentEnc: item.attachment?.enc ? true : false,
          attachmentIv: item.attachment?.iv ? String(item.attachment.iv) : null,
          replyToId: item.replyToId ? Number(item.replyToId) : undefined,
          forwardFromMessageId: item.forwardFromMessageId ? Number(item.forwardFromMessageId) : undefined,
          forwardedByUserId: item.forwardFromMessageId ? socket.data.user.id : undefined,
          forwardedOriginalSenderName: item.forwardedOriginalSenderName || undefined,
          forwardedOriginalTimestamp: item.forwardedOriginalTimestamp ? new Date(Number(item.forwardedOriginalTimestamp)) : undefined,
        };
        const created = await prisma.message.create({ data });
        const msg = {
          id: created.id,
          userId: socket.data.user.id,
          from: socket.data.name,
          text: created.text,
          ts: new Date(created.createdAt).getTime(),
          attachmentUrl: created.attachmentUrl,
          attachmentType: created.attachmentType,
          attachmentName: created.attachmentName,
          attachmentSize: created.attachmentSize,
          attachmentMime: created.attachmentMime,
          attachmentEnc: created.attachmentEnc,
          attachmentIv: created.attachmentIv,
          replyToId: created.replyToId || null,
          forwardFromMessageId: created.forwardFromMessageId || null,
          forwardedByUserId: created.forwardedByUserId || null,
          forwardedOriginalSenderName: created.forwardedOriginalSenderName || null,
          forwardedOriginalTimestamp: created.forwardedOriginalTimestamp ? new Date(created.forwardedOriginalTimestamp).getTime() : null,
        };
        io.to(item.roomCode).emit('message', msg);
        results.push({ ok: true, id: created.id, roomCode: item.roomCode });
      } catch (e) {
        console.error('Forward error:', e);
        results.push({ ok: false, error: 'Forward failed' });
      }
    }
    if (ack) ack({ ok: true, results });
  });

  // Change display name (updates user profile)
  socket.on('set-name', async (name) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const newName = String(name || '').trim();
    if (!newName) return;
    const old = socket.data.name;
    try {
      await prisma.user.update({ where: { id: socket.data.user.id }, data: { name: newName } });
      socket.data.name = newName;
      const roomUsers = rooms.get(roomCode);
      if (roomUsers) {
        roomUsers.set(socket.id, socket.data.name);
        io.to(roomCode).emit('online', Array.from(roomUsers.values()));
      }
      io.to(roomCode).emit('system', `${old} is now known as ${socket.data.name}`);
    } catch (e) {
      console.error('Error updating name', e);
    }
  });

  // Delete your own message
  socket.on('delete-message', async (messageId, ack) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) { if (ack) ack({ ok: false, error: 'Not in a room' }); return; }
    try {
      console.log('[server] delete-message received', {
        messageId,
        userId: socket.data.user?.id,
        isAdmin: !!(socket.data.user && socket.data.user.isAdmin),
        roomCode
      });
      const msg = await prisma.message.findUnique({ where: { id: Number(messageId) } });
      const isOwner = msg && msg.userId === socket.data.user.id;
      const isAdmin = socket.data.user && socket.data.user.isAdmin;
      if (!msg) {
        console.log('[server] delete-message failed: message not found', { messageId });
        if (ack) ack({ ok: false, error: 'Message not found' });
        return;
      }
      if (!isOwner && !isAdmin) {
        console.log('[server] delete-message failed: not authorized', { messageId, userId: socket.data.user?.id });
        if (ack) ack({ ok: false, error: 'Not authorized to delete this message' });
        return;
      }
      await prisma.message.update({ where: { id: msg.id }, data: { deletedAt: new Date() } });
      console.log('[server] delete-message success, broadcasting message-deleted', { id: msg.id, roomCode });
      if (ack) ack({ ok: true, id: msg.id });
      io.to(roomCode).emit('message-deleted', msg.id);
    } catch (e) {
      console.error('Delete message error', e);
      if (ack) ack({ ok: false, error: 'Failed to delete message' });
    }
  });

  // Edit your own message (within 15 minutes)
  socket.on('edit-message', async ({ messageId, newText }, ack) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    try {
      const msg = await prisma.message.findUnique({ where: { id: Number(messageId) } });
      if (!msg) return;
      const isOwner = msg.userId === socket.data.user.id;
      const isAdmin = socket.data.user && socket.data.user.isAdmin;
      if (!isOwner && !isAdmin) return;
      if (msg.deletedAt) return; // cannot edit deleted
      // WhatsApp-like edit window: 15 minutes
      const EDIT_WINDOW_MS = 15 * 60 * 1000;
      const withinWindow = (Date.now() - new Date(msg.createdAt).getTime()) <= EDIT_WINDOW_MS;
      if (!isAdmin && !withinWindow) return;
      const cleanText = String(newText || '').trim();
      if (!cleanText) return;
      const updated = await prisma.message.update({ where: { id: msg.id }, data: { text: cleanText, editedAt: new Date() } });
      if (ack) ack({ ok: true, id: updated.id, text: updated.text, editedAt: new Date(updated.editedAt).getTime() });
      io.to(roomCode).emit('message-edited', { id: updated.id, text: updated.text, editedAt: new Date(updated.editedAt).getTime() });
    } catch (e) {
      console.error('Edit message error', e);
      if (ack) ack({ ok: false, error: 'Failed to edit message' });
    }
  });

  // Clear entire room (owner only)
  socket.on('clear-room', async () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    try {
      const room = await prisma.room.findUnique({ where: { code: roomCode } });
      if (!room || room.ownerId !== socket.data.user.id) return; // only owner
      await prisma.message.deleteMany({ where: { roomId: room.id } });
      io.to(roomCode).emit('room-cleared');
    } catch (e) {
      console.error('Clear room error', e);
    }
  });

  // Typing indicator
  socket.on('typing', (isTyping) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    socket.broadcast.to(roomCode).emit('typing', { from: socket.data.name, isTyping: !!isTyping });
  });

  // Message seen/read receipt
  socket.on('message-seen', async (messageId) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    try {
      const message = await prisma.message.findUnique({ where: { id: Number(messageId) } });
      if (!message) return;
      
      // Emit to the message sender that their message was seen
      const senderSocket = Array.from(io.sockets.sockets.values())
        .find(s => s.data.user && s.data.user.id === message.userId);
      
      if (senderSocket) {
        senderSocket.emit('message-seen-by', {
          messageId: message.id,
          seenBy: socket.data.name,
          seenAt: new Date()
        });
      }
    } catch (e) {
      console.error('Message seen error', e);
    }
  });

  // Message delivered receipt (recipient's client received the message)
  socket.on('message-delivered', async (messageId) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    try {
      const message = await prisma.message.findUnique({ where: { id: Number(messageId) } });
      if (!message) return;
      // Notify the original sender that their message has been delivered
      const senderSocket = Array.from(io.sockets.sockets.values())
        .find(s => s.data.user && s.data.user.id === message.userId);
      if (senderSocket) {
        senderSocket.emit('message-delivered', {
          messageId: message.id,
          deliveredBy: socket.data.name,
          deliveredAt: new Date()
        });
      }
    } catch (e) {
      console.error('Message delivered error', e);
    }
  });

  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const roomUsers = rooms.get(roomCode);
    if (roomUsers) {
      const name = roomUsers.get(socket.id) || socket.data.name;
      roomUsers.delete(socket.id);
      io.to(roomCode).emit('system', `${name} left the room`);
      io.to(roomCode).emit('online', Array.from(roomUsers.values()));
      if (roomUsers.size === 0) {
        rooms.delete(roomCode);
      }
    }
    
    // Update user's last seen and remove from online users
    if (socket.data.user) {
      const userId = socket.data.user.id;
      if (onlineUsers.has(userId)) {
        const userData = onlineUsers.get(userId);
        userData.lastSeen = new Date();
        userData.isOnline = false;
        onlineUsers.delete(userId);
        
        // Emit updated friends list to all users
        const friendsList = Array.from(onlineUsers.values()).map(user => ({
          name: user.name,
          isOnline: true,
          lastSeen: user.lastSeen
        }));
        io.emit('friends-update', friendsList);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
// Start server after best-effort admin bootstrap
(async () => {
  await bootstrapAdmin();
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
})();

// Load environment variables and initialize Supabase client
