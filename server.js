const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from public
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Room state: roomId -> Map(socketId -> name)
const rooms = new Map();

io.on('connection', (socket) => {
  // Default guest name
  if (!socket.data.name) {
    socket.data.name = `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  // Client will call join-room with roomId and optional name
  socket.on('join-room', ({ roomId, name }) => {
    if (!roomId) return;

    if (name && typeof name === 'string' && name.trim()) {
      socket.data.name = name.trim();
    }

    // Leave old room if any
    if (socket.data.roomId) {
      const old = socket.data.roomId;
      socket.leave(old);
      const oldRoom = rooms.get(old);
      if (oldRoom) {
        oldRoom.delete(socket.id);
        io.to(old).emit('online', Array.from(oldRoom.values()));
      }
    }

    // Join new room
    socket.join(roomId);
    socket.data.roomId = roomId;

    if (!rooms.has(roomId)) rooms.set(roomId, new Map());
    const roomUsers = rooms.get(roomId);
    roomUsers.set(socket.id, socket.data.name);

    socket.emit('system', `You joined room ${roomId} as ${socket.data.name}`);
    socket.broadcast.to(roomId).emit('system', `${socket.data.name} joined the room`);
    io.to(roomId).emit('online', Array.from(roomUsers.values()));
  });

  // Broadcast message to current room
  socket.on('message', (text) => {
    const roomId = socket.data.roomId;
    if (!roomId) return; // not in a room
    const msg = {
      from: socket.data.name,
      text: String(text || ''),
      ts: Date.now(),
    };
    io.to(roomId).emit('message', msg);
  });

  // Change nickname within current room
  socket.on('set-name', (name) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const old = socket.data.name;
    if (name && typeof name === 'string' && name.trim()) {
      socket.data.name = name.trim();
      const roomUsers = rooms.get(roomId);
      if (roomUsers) {
        roomUsers.set(socket.id, socket.data.name);
        io.to(roomId).emit('online', Array.from(roomUsers.values()));
      }
      io.to(roomId).emit('system', `${old} is now known as ${socket.data.name}`);
    }
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const roomUsers = rooms.get(roomId);
    if (roomUsers) {
      const name = roomUsers.get(socket.id) || socket.data.name;
      roomUsers.delete(socket.id);
      io.to(roomId).emit('system', `${name} left the room`);
      io.to(roomId).emit('online', Array.from(roomUsers.values()));
      if (roomUsers.size === 0) {
        rooms.delete(roomId);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
