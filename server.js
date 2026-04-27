const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const BLACK = 'B';
const WHITE = 'W';
const EMPTY = null;
const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

function createBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(EMPTY));
  board[3][3] = WHITE;
  board[3][4] = BLACK;
  board[4][3] = BLACK;
  board[4][4] = WHITE;
  return board;
}

function opponent(color) {
  return color === BLACK ? WHITE : BLACK;
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function getFlips(board, row, col, color) {
  if (!inBounds(row, col) || board[row][col] !== EMPTY) return [];
  const opp = opponent(color);
  const flips = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c) && board[r][c] === opp) {
      line.push([r, c]);
      r += dr;
      c += dc;
    }
    if (line.length > 0 && inBounds(r, c) && board[r][c] === color) {
      flips.push(...line);
    }
  }
  return flips;
}

function getValidMoves(board, color) {
  const moves = {};
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const flips = getFlips(board, r, c, color);
      if (flips.length > 0) moves[`${r},${c}`] = flips;
    }
  }
  return moves;
}

function applyMove(board, row, col, color, flips) {
  board[row][col] = color;
  for (const [r, c] of flips) board[r][c] = color;
}

function countPieces(board) {
  let black = 0, white = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === BLACK) black++;
      else if (cell === WHITE) white++;
    }
  }
  return { black, white };
}

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function createRoom() {
  const code = generateRoomCode();
  const room = {
    code,
    players: {},
    board: createBoard(),
    turn: BLACK,
    status: 'waiting',
    lastMove: null,
    passed: false,
    winner: null,
  };
  rooms.set(code, room);
  return room;
}

function publicRoomState(room) {
  const validMoves = room.status === 'playing' ? getValidMoves(room.board, room.turn) : {};
  const counts = countPieces(room.board);
  return {
    code: room.code,
    board: room.board,
    turn: room.turn,
    status: room.status,
    validMoves: Object.keys(validMoves),
    lastMove: room.lastMove,
    counts,
    winner: room.winner,
    players: {
      [BLACK]: room.players[BLACK] ? { name: room.players[BLACK].name, connected: room.players[BLACK].connected } : null,
      [WHITE]: room.players[WHITE] ? { name: room.players[WHITE].name, connected: room.players[WHITE].connected } : null,
    },
  };
}

function broadcast(room) {
  io.to(room.code).emit('state', publicRoomState(room));
}

function advanceTurn(room) {
  const next = opponent(room.turn);
  const nextMoves = getValidMoves(room.board, next);
  if (Object.keys(nextMoves).length > 0) {
    room.turn = next;
    room.passed = false;
    return;
  }
  const ownMoves = getValidMoves(room.board, room.turn);
  if (Object.keys(ownMoves).length > 0) {
    room.passed = true;
    return;
  }
  const { black, white } = countPieces(room.board);
  room.status = 'finished';
  if (black > white) room.winner = BLACK;
  else if (white > black) room.winner = WHITE;
  else room.winner = 'draw';
}

io.on('connection', (socket) => {
  let joinedRoom = null;
  let myColor = null;

  socket.on('createRoom', ({ name }, ack) => {
    const room = createRoom();
    room.players[BLACK] = { id: socket.id, name: (name || 'Player 1').slice(0, 20), connected: true };
    socket.join(room.code);
    joinedRoom = room.code;
    myColor = BLACK;
    ack && ack({ ok: true, code: room.code, color: BLACK });
    broadcast(room);
  });

  socket.on('joinRoom', ({ code, name }, ack) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return ack && ack({ ok: false, error: 'ルームが見つかりません' });
    let assigned = null;
    if (!room.players[BLACK]) assigned = BLACK;
    else if (!room.players[WHITE]) assigned = WHITE;
    else {
      const disconnectedColor = [BLACK, WHITE].find(c => room.players[c] && !room.players[c].connected);
      if (disconnectedColor) {
        room.players[disconnectedColor] = { id: socket.id, name: (name || 'Player').slice(0, 20), connected: true };
        assigned = disconnectedColor;
      }
    }
    if (!assigned) return ack && ack({ ok: false, error: 'ルームは満員です' });
    if (!room.players[assigned] || room.players[assigned].id !== socket.id) {
      room.players[assigned] = { id: socket.id, name: (name || 'Player 2').slice(0, 20), connected: true };
    }
    socket.join(room.code);
    joinedRoom = room.code;
    myColor = assigned;
    if (room.players[BLACK] && room.players[WHITE] && room.status === 'waiting') {
      room.status = 'playing';
    }
    ack && ack({ ok: true, code: room.code, color: assigned });
    broadcast(room);
  });

  socket.on('move', ({ row, col }, ack) => {
    const room = rooms.get(joinedRoom);
    if (!room) return ack && ack({ ok: false, error: 'ルームがありません' });
    if (room.status !== 'playing') return ack && ack({ ok: false, error: 'ゲーム中ではありません' });
    if (myColor !== room.turn) return ack && ack({ ok: false, error: 'あなたの番ではありません' });
    const flips = getFlips(room.board, row, col, myColor);
    if (flips.length === 0) return ack && ack({ ok: false, error: 'その場所には置けません' });
    applyMove(room.board, row, col, myColor, flips);
    room.lastMove = { row, col, color: myColor };
    advanceTurn(room);
    ack && ack({ ok: true });
    broadcast(room);
  });

  socket.on('rematch', () => {
    const room = rooms.get(joinedRoom);
    if (!room || room.status !== 'finished') return;
    room.board = createBoard();
    room.turn = BLACK;
    room.lastMove = null;
    room.winner = null;
    room.passed = false;
    room.status = (room.players[BLACK] && room.players[WHITE]) ? 'playing' : 'waiting';
    const tmp = room.players[BLACK];
    room.players[BLACK] = room.players[WHITE];
    room.players[WHITE] = tmp;
    broadcast(room);
  });

  socket.on('chat', ({ message }) => {
    const room = rooms.get(joinedRoom);
    if (!room || !myColor) return;
    const text = String(message || '').slice(0, 200);
    if (!text.trim()) return;
    io.to(room.code).emit('chat', {
      color: myColor,
      name: room.players[myColor]?.name || 'Player',
      message: text,
      ts: Date.now(),
    });
  });

  socket.on('disconnect', () => {
    const room = rooms.get(joinedRoom);
    if (!room || !myColor) return;
    if (room.players[myColor] && room.players[myColor].id === socket.id) {
      room.players[myColor].connected = false;
    }
    broadcast(room);
    const bothGone = [BLACK, WHITE].every(c => !room.players[c] || !room.players[c].connected);
    if (bothGone) {
      setTimeout(() => {
        const r = rooms.get(joinedRoom);
        if (!r) return;
        const stillGone = [BLACK, WHITE].every(c => !r.players[c] || !r.players[c].connected);
        if (stillGone) rooms.delete(joinedRoom);
      }, 5 * 60 * 1000);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Othello server listening on http://localhost:${PORT}`);
});
