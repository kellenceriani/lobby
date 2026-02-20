const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { initWordCache } = require('./server/core/gameEngine');
const registerSocketHandlers = require('./server/socket/socketHandlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(__dirname + '/public'));

app.get('/temp', (req, res) => {
  res.sendFile(__dirname + '/public/temp/index.html');
});

initWordCache();
registerSocketHandlers(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 LobbyWARS Server running on port ${PORT}`);
});
