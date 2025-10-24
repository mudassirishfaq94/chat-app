const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';

const prisma = new PrismaClient();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Auth endpoints
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'Email already in use' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { name, email, passwordHash } });
    const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
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
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Socket auth middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
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

    socket.emit('system', `You joined room ${roomId} as ${socket.data.name}`);
    socket.broadcast.to(roomId).emit('system', `${socket.data.name} joined the room`);
    io.to(roomId).emit('online', Array.from(roomUsers.values()));

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
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.broadcast.to(roomId).emit('typing', { from: socket.data.name, isTyping: !!isTyping });
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
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
