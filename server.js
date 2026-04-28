const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const db = require('./db');
const {
  validateName,
  validatePassword,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  authMiddleware,
} = require('./auth');
const { updateRatings } = require('./elo');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
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
    endReason: null,
    resignedBy: null,
    rematchRequests: { [BLACK]: false, [WHITE]: false },
    recorded: false,
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
    endReason: room.endReason,
    resignedBy: room.resignedBy,
    rematchRequests: room.rematchRequests,
    players: {
      [BLACK]: room.players[BLACK]
        ? { name: room.players[BLACK].name, rating: room.players[BLACK].rating, connected: room.players[BLACK].connected }
        : null,
      [WHITE]: room.players[WHITE]
        ? { name: room.players[WHITE].name, rating: room.players[WHITE].rating, connected: room.players[WHITE].connected }
        : null,
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
  room.endReason = 'normal';
}

async function recordResultIfNeeded(room) {
  if (room.recorded) return;
  if (room.status !== 'finished') return;
  const black = room.players[BLACK];
  const white = room.players[WHITE];
  if (!black || !white) return;
  room.recorded = true;

  const blackBefore = black.rating;
  const whiteBefore = white.rating;

  let scoreA;
  if (room.winner === BLACK) scoreA = 1;
  else if (room.winner === WHITE) scoreA = 0;
  else scoreA = 0.5;

  const { newA: blackAfter, newB: whiteAfter } = updateRatings(blackBefore, whiteBefore, scoreA);

  black.rating = blackAfter;
  white.rating = whiteAfter;

  const winnerText = room.winner === BLACK ? 'black' : room.winner === WHITE ? 'white' : 'draw';

  try {
    await db.recordGameResult({
      blackId: black.userId,
      whiteId: white.userId,
      winner: winnerText,
      endReason: room.endReason || 'normal',
      blackRatingBefore: blackBefore,
      whiteRatingBefore: whiteBefore,
      blackRatingAfter: blackAfter,
      whiteRatingAfter: whiteAfter,
    });
  } catch (err) {
    console.error('対局結果の保存に失敗:', err);
    room.recorded = false;
  }
}

app.post('/api/register', async (req, res) => {
  try {
    const { name, password } = req.body || {};
    const nameErr = validateName(name);
    if (nameErr) return res.status(400).json({ error: nameErr });
    const passErr = validatePassword(password);
    if (passErr) return res.status(400).json({ error: passErr });

    const existing = await db.findUserByName(name);
    if (existing) return res.status(409).json({ error: 'このアカウント名は既に使われています' });

    const passHash = await hashPassword(password);
    const user = await db.createUser(name, passHash);
    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, wins: user.wins, losses: user.losses, draws: user.draws, rating: user.rating },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { name, password } = req.body || {};
    if (!name || !password) return res.status(400).json({ error: 'アカウント名とパスワードを入力してください' });
    const user = await db.findUserByName(name);
    if (!user) return res.status(401).json({ error: 'アカウント名またはパスワードが違います' });
    const ok = await verifyPassword(password, user.pass_hash);
    if (!ok) return res.status(401).json({ error: 'アカウント名またはパスワードが違います' });
    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, wins: user.wins, losses: user.losses, draws: user.draws, rating: user.rating },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.findUserById(req.user.uid);
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    res.json({
      user: { id: user.id, name: user.name, wins: user.wins, losses: user.losses, draws: user.draws, rating: user.rating },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('AUTH_REQUIRED'));
    const payload = verifyToken(token);
    if (!payload) return next(new Error('AUTH_INVALID'));
    const user = await db.findUserById(payload.uid);
    if (!user) return next(new Error('AUTH_INVALID'));
    socket.data.user = { id: user.id, name: user.name, rating: user.rating };
    next();
  } catch (err) {
    next(new Error('AUTH_FAILED'));
  }
});

io.on('connection', (socket) => {
  let joinedRoom = null;
  let myColor = null;

  function buildPlayer() {
    return {
      id: socket.id,
      userId: socket.data.user.id,
      name: socket.data.user.name,
      rating: socket.data.user.rating,
      connected: true,
    };
  }

  socket.on('createRoom', (_payload, ack) => {
    const room = createRoom();
    room.players[BLACK] = buildPlayer();
    socket.join(room.code);
    joinedRoom = room.code;
    myColor = BLACK;
    ack && ack({ ok: true, code: room.code, color: BLACK });
    broadcast(room);
  });

  socket.on('joinRoom', ({ code }, ack) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return ack && ack({ ok: false, error: 'ルームが見つかりません' });

    const myUserId = socket.data.user.id;
    const existingColor = [BLACK, WHITE].find(c => room.players[c] && room.players[c].userId === myUserId);
    if (existingColor) {
      room.players[existingColor] = buildPlayer();
      socket.join(room.code);
      joinedRoom = room.code;
      myColor = existingColor;
      if (room.players[BLACK] && room.players[WHITE] && room.status === 'waiting') {
        room.status = 'playing';
      }
      ack && ack({ ok: true, code: room.code, color: existingColor });
      broadcast(room);
      return;
    }

    let assigned = null;
    if (!room.players[BLACK]) assigned = BLACK;
    else if (!room.players[WHITE]) assigned = WHITE;
    if (!assigned) return ack && ack({ ok: false, error: 'ルームは満員です' });

    room.players[assigned] = buildPlayer();
    socket.join(room.code);
    joinedRoom = room.code;
    myColor = assigned;
    if (room.players[BLACK] && room.players[WHITE] && room.status === 'waiting') {
      room.status = 'playing';
    }
    ack && ack({ ok: true, code: room.code, color: assigned });
    broadcast(room);
  });

  socket.on('move', async ({ row, col }, ack) => {
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
    if (room.status === 'finished') {
      await recordResultIfNeeded(room);
    }
    broadcast(room);
  });

  socket.on('resign', async () => {
    const room = rooms.get(joinedRoom);
    if (!room || !myColor || room.status !== 'playing') return;
    room.status = 'finished';
    room.winner = opponent(myColor);
    room.endReason = 'resign';
    room.resignedBy = myColor;
    await recordResultIfNeeded(room);
    broadcast(room);
  });

  socket.on('rematch', () => {
    const room = rooms.get(joinedRoom);
    if (!room || !myColor || room.status !== 'finished') return;
    if (!room.players[BLACK] || !room.players[WHITE]) return;
    room.rematchRequests[myColor] = true;
    if (room.rematchRequests[BLACK] && room.rematchRequests[WHITE]) {
      room.board = createBoard();
      room.turn = BLACK;
      room.lastMove = null;
      room.winner = null;
      room.passed = false;
      room.endReason = null;
      room.resignedBy = null;
      room.rematchRequests = { [BLACK]: false, [WHITE]: false };
      room.status = 'playing';
      room.recorded = false;
    }
    broadcast(room);
  });

  socket.on('cancelRematch', () => {
    const room = rooms.get(joinedRoom);
    if (!room || !myColor || room.status !== 'finished') return;
    room.rematchRequests[myColor] = false;
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

db.init()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Othello server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('DB 初期化に失敗:', err);
    process.exit(1);
  });
