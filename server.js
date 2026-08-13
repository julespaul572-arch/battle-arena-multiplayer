const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

io.on('connection', (socket) => {
  console.log('[serveur] nouvelle connexion :', socket.id);

  socket.on('create-room', () => {
    let code;
    do { code = genCode(); } while (rooms[code]);
    rooms[code] = { host: socket.id, guest: null };
    socket.join(code);
    socket.data.room = code;
    socket.data.role = 'host';
    socket.emit('room-created', code);
    console.log('[serveur] salle créée :', code, 'par', socket.id);
  });

  socket.on('join-room', (rawCode) => {
    const code = (rawCode || '').toUpperCase().trim();
    const room = rooms[code];
    if (!room) { socket.emit('join-error', 'Code introuvable.'); return; }
    if (room.guest) { socket.emit('join-error', 'Cette salle est déjà pleine.'); return; }
    room.guest = socket.id;
    socket.join(code);
    socket.data.room = code;
    socket.data.role = 'guest';
    socket.emit('room-joined', code);
    io.to(room.host).emit('guest-joined');
  });

  socket.on('input', (data) => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room) return;
    io.to(room.host).emit('remote-input', data);
  });

  socket.on('state', (data) => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room || !room.guest) return;
    io.to(room.guest).emit('remote-state', data);
  });

  socket.on('disconnect', () => {
    const code = socket.data.room;
    if (code && rooms[code]) {
      io.to(code).emit('peer-left');
      delete rooms[code];
    }
  });
});

const PORT = process.env.PORT ||3000;
