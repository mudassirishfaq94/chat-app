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

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';

const prisma = new PrismaClient();

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
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB each
});

app.post('/api/upload', requireAuth, upload.array('files', 8), (req, res) => {
  const files = req.files || [];
  const attachments = files.map((f) => {
    const mime = f.mimetype;
    let type = 'file';
    if (mime.startsWith('image/')) type = 'image';
    else if (mime.startsWith('video/')) type = 'video';
    return {
      url: '/uploads/' + path.basename(f.filename),
      name: f.originalname,
      size: f.size,
      mime,
      type,
    };
  });
  res.json({ attachments });
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
        where: { roomId: room.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 100,
        include: { user: true },
      });
      socket.emit('history', history.map((m) => ({
        id: m.id,
        from: m.user.name,
        text: m.text,
        ts: new Date(m.createdAt).getTime(),
        attachmentUrl: m.attachmentUrl || null,
        attachmentType: m.attachmentType || null,
        attachmentName: m.attachmentName || null,
        attachmentSize: m.attachmentSize || null,
        attachmentMime: m.attachmentMime || null,
      })));
    } catch (err) {
      console.error('Error loading history:', err);
    }
  });

  // Broadcast message to current room and persist with ownership
  socket.on('message', async (text) => {
    const roomCode = socket.data.roomCode;
    const roomDbId = socket.data.roomDbId;
    if (!roomCode || !roomDbId) return; // not in a room
    const msgText = String(text || '').trim();
    if (!msgText) return;

    try {
      const created = await prisma.message.create({
        data: {
          roomId: roomDbId,
          userId: socket.data.user.id,
          text: msgText,
        },
      });
      const msg = {
        id: created.id,
        from: socket.data.name,
        text: msgText,
        ts: new Date(created.createdAt).getTime(),
      };
      io.to(roomCode).emit('message', msg);
    } catch (err) {
      console.error('Error saving message:', err);
    }
  });

  // Broadcast attachment to current room and persist with metadata
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
      };
      io.to(roomCode).emit('message', msg);
    } catch (err) {
      console.error('Error saving attachment:', err);
    }
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
  socket.on('delete-message', async (messageId) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    try {
      const msg = await prisma.message.findUnique({ where: { id: Number(messageId) } });
      if (!msg || msg.userId !== socket.data.user.id) return; // only owner can delete
      await prisma.message.update({ where: { id: msg.id }, data: { deletedAt: new Date() } });
      io.to(roomCode).emit('message-deleted', msg.id);
    } catch (e) {
      console.error('Delete message error', e);
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
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});