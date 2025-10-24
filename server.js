const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from public
app.use(express.static(path.join(__dirname, 'public')));

// Basic health route
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

io.on('connection', (socket) => {
  // Assign a simple guest name if none provided
  const guestName = `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
  socket.data.name = guestName;

  // Notify others
  socket.broadcast.emit('system', `${socket.data.name} joined the chat`);
  socket.emit('system', `You joined as ${socket.data.name}`);

  // Handle incoming messages
  socket.on('message', (text) => {
    const msg = {
      from: socket.data.name,
      text: String(text || ''),
      ts: Date.now(),
    };
    io.emit('message', msg); // broadcast to all
  });

  // Allow client to set a nickname
  socket.on('set-name', (name) => {
    const old = socket.data.name;
    socket.data.name = String(name || old);
    io.emit('system', `${old} is now known as ${socket.data.name}`);
  });

  socket.on('disconnect', () => {
    io.emit('system', `${socket.data.name} left the chat`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
