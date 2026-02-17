const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname + '/public')); // serve static files from "public" folder

// In-memory room data
const rooms = {};

// Handle socket connections
io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  socket.on('joinRoom', ({ name, room }) => {
    room = room.toUpperCase();
    if (!rooms[room]) rooms[room] = { players: [] };

    const players = rooms[room].players;

    // Check if name is taken
    if (players.find(p => p.name === name)) {
      socket.emit('joinError', 'Name already taken in this room.');
      return;
    }

    const player = { id: socket.id, name, char: '' };
    players.push(player);
    socket.join(room);

    // Save player's room for easy lookup on disconnect
    socket.data.room = room;
    socket.data.name = name;

    // Send updated player list to everyone in the room
    io.to(room).emit('roomData', rooms[room]);
  });

  socket.on('selectChar', (char) => {
    const room = socket.data.room;
    const name = socket.data.name;
    if (!room || !name) return;

    const players = rooms[room].players;
    const player = players.find(p => p.name === name);
    if (player) {
      player.char = char;
      io.to(room).emit('roomData', rooms[room]);
    }
  });

  socket.on('disconnect', () => {
    const room = socket.data.room;
    const name = socket.data.name;
    if (!room || !name) return;

    const players = rooms[room].players;
    rooms[room].players = players.filter(p => p.name !== name);

    // Notify others in the room
    io.to(room).emit('roomData', rooms[room]);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
