const socket = io();

let player = {};
let currentRoom = '';

function joinRoom() {
  const name = document.getElementById('name').value.trim();
  const room = document.getElementById('room').value.trim().toUpperCase();
  if (!name || !room) return alert('Please enter both name and room code.');

  player = { name, char: '' };
  currentRoom = room;

  socket.emit('joinRoom', { name, room });

  // Wait for response to show lobby
}

socket.on('joinError', (msg) => {
  alert(msg);
});

socket.on('roomData', (roomData) => {
  // If this is the first time joining, show lobby UI
  if (document.getElementById('join').style.display !== 'none') {
    document.getElementById('join').style.display = 'none';
    document.getElementById('lobby').style.display = 'block';
    document.getElementById('roomCode').textContent = currentRoom;
  }

  updatePlayerList(roomData.players);
});

function updatePlayerList(players) {
  const ul = document.getElementById('playerList');
  ul.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = `${p.name} ${p.char ? ' - ' + p.char : ''}`;
    ul.appendChild(li);
  });
}

function showCharSelect() {
  document.getElementById('charSelect').style.display = 'block';
}

function selectChar(c) {
  player.char = c;
  document.getElementById('charConfirm').textContent = `You selected: ${c}`;
  socket.emit('selectChar', c);
}
