const socket = io();

const lobby = document.getElementById('lobby');
const game = document.getElementById('game');
const nameInput = document.getElementById('nameInput');
const codeInput = document.getElementById('codeInput');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const lobbyError = document.getElementById('lobbyError');
const roomCodeEl = document.getElementById('roomCode');
const copyBtn = document.getElementById('copyBtn');
const statusEl = document.getElementById('status');
const boardEl = document.getElementById('board');
const countBlackEl = document.getElementById('countBlack');
const countWhiteEl = document.getElementById('countWhite');
const nameBlackEl = document.getElementById('nameBlack');
const nameWhiteEl = document.getElementById('nameWhite');
const scoreBlackEl = document.getElementById('scoreBlack');
const scoreWhiteEl = document.getElementById('scoreWhite');
const rematchBtn = document.getElementById('rematchBtn');
const leaveBtn = document.getElementById('leaveBtn');
const chatLog = document.getElementById('chatLog');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const audioToggleBtn = document.getElementById('audioToggleBtn');

let myColor = null;
let currentState = null;
let prevState = null;

const audio = {
  bgm: new Audio('sounds/bgm.mp3'),
  place: new Audio('sounds/place.mp3'),
  turn: new Audio('sounds/turn.mp3'),
  win: new Audio('sounds/win.mp3'),
  lose: new Audio('sounds/lose.mp3'),
};
audio.bgm.loop = true;
audio.bgm.volume = 0.3;
audio.place.volume = 0.6;
audio.turn.volume = 0.5;
audio.win.volume = 0.6;
audio.lose.volume = 0.6;
Object.values(audio).forEach(a => { a.preload = 'auto'; });

let audioEnabled = localStorage.getItem('osero.audio') !== 'off';

function updateAudioButton() {
  if (!audioToggleBtn) return;
  audioToggleBtn.textContent = audioEnabled ? '♪ ON' : '♪ OFF';
  audioToggleBtn.classList.toggle('audio-off', !audioEnabled);
}
updateAudioButton();

function playSE(name) {
  if (!audioEnabled) return;
  const a = audio[name];
  if (!a) return;
  try {
    a.currentTime = 0;
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
  } catch {}
}

function startBGM() {
  if (!audioEnabled) return;
  const p = audio.bgm.play();
  if (p && p.catch) p.catch(() => {});
}

function stopBGM() {
  audio.bgm.pause();
}

if (audioToggleBtn) {
  audioToggleBtn.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    localStorage.setItem('osero.audio', audioEnabled ? 'on' : 'off');
    updateAudioButton();
    if (audioEnabled) startBGM();
    else stopBGM();
  });
}

const cells = [];
for (let r = 0; r < 8; r++) {
  for (let c = 0; c < 8; c++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.row = r;
    cell.dataset.col = c;
    cell.addEventListener('click', () => onCellClick(r, c));
    boardEl.appendChild(cell);
    cells.push(cell);
  }
}

function cellAt(r, c) {
  return cells[r * 8 + c];
}

function savedName() {
  return localStorage.getItem('osero.name') || '';
}

function saveName(n) {
  localStorage.setItem('osero.name', n);
}

nameInput.value = savedName();

const urlParams = new URLSearchParams(location.search);
const urlRoom = urlParams.get('room');
if (urlRoom) codeInput.value = urlRoom.toUpperCase();

function showError(msg) {
  lobbyError.textContent = msg || '';
}

createBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'Player';
  saveName(name);
  showError('');
  socket.emit('createRoom', { name }, (res) => {
    if (!res || !res.ok) return showError(res?.error || '作成に失敗しました');
    enterGame(res.code, res.color);
  });
});

joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'Player';
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return showError('ルームコードを入力してください');
  saveName(name);
  showError('');
  socket.emit('joinRoom', { code, name }, (res) => {
    if (!res || !res.ok) return showError(res?.error || '参加に失敗しました');
    enterGame(res.code, res.color);
  });
});

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase();
});

function enterGame(code, color) {
  myColor = color;
  roomCodeEl.textContent = code;
  lobby.classList.add('hidden');
  game.classList.remove('hidden');
  history.replaceState(null, '', `?room=${code}`);
  startBGM();
}

copyBtn.addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?room=${roomCodeEl.textContent}`;
  try {
    await navigator.clipboard.writeText(url);
    copyBtn.textContent = 'コピー済';
    setTimeout(() => { copyBtn.textContent = 'コピー'; }, 1500);
  } catch {
    prompt('このURLを共有してください', url);
  }
});

leaveBtn.addEventListener('click', () => {
  location.href = location.pathname;
});

rematchBtn.addEventListener('click', () => {
  socket.emit('rematch');
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = chatInput.value;
  if (!message.trim()) return;
  socket.emit('chat', { message });
  chatInput.value = '';
});

function onCellClick(r, c) {
  if (!currentState) return;
  if (currentState.status !== 'playing') return;
  if (currentState.turn !== myColor) return;
  const key = `${r},${c}`;
  if (!currentState.validMoves.includes(key)) return;
  socket.emit('move', { row: r, col: c }, (res) => {
    if (res && !res.ok) console.warn(res.error);
  });
}

function render(state) {
  if (prevState) {
    const lastA = prevState.lastMove;
    const lastB = state.lastMove;
    const moveChanged = JSON.stringify(lastA) !== JSON.stringify(lastB);
    if (moveChanged && lastB) playSE('place');
    if (prevState.status === 'playing' && state.status === 'playing'
        && prevState.turn !== state.turn && state.turn === myColor) {
      playSE('turn');
    }
    if (prevState.status !== 'finished' && state.status === 'finished') {
      stopBGM();
      if (state.winner === myColor) playSE('win');
      else if (state.winner && state.winner !== 'draw') playSE('lose');
    }
    if (prevState.status === 'finished' && state.status === 'playing') {
      startBGM();
    }
  }
  prevState = state;
  currentState = state;
  const myTurn = state.turn === myColor;
  const validSet = new Set(state.validMoves);

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = cellAt(r, c);
      const piece = state.board[r][c];
      cell.innerHTML = '';
      cell.classList.remove('playable', 'last-move');
      if (piece) {
        const disc = document.createElement('div');
        disc.className = `disc ${piece === 'B' ? 'black' : 'white'}`;
        cell.appendChild(disc);
      } else if (state.status === 'playing' && myTurn && validSet.has(`${r},${c}`)) {
        cell.classList.add('playable');
      }
      if (state.lastMove && state.lastMove.row === r && state.lastMove.col === c) {
        cell.classList.add('last-move');
      }
    }
  }

  countBlackEl.textContent = state.counts.black;
  countWhiteEl.textContent = state.counts.white;
  nameBlackEl.textContent = state.players.B?.name ?? '待機中…';
  nameWhiteEl.textContent = state.players.W?.name ?? '待機中…';

  scoreBlackEl.classList.toggle('active', state.status === 'playing' && state.turn === 'B');
  scoreWhiteEl.classList.toggle('active', state.status === 'playing' && state.turn === 'W');

  if (state.status === 'waiting') {
    statusEl.textContent = '相手の参加を待っています…';
    rematchBtn.classList.add('hidden');
  } else if (state.status === 'playing') {
    const turnName = state.players[state.turn]?.name || (state.turn === 'B' ? '黒' : '白');
    if (myTurn) {
      statusEl.textContent = `あなたの番（${state.turn === 'B' ? '黒' : '白'}）`;
    } else {
      statusEl.textContent = `${turnName} の番`;
    }
    rematchBtn.classList.add('hidden');
  } else if (state.status === 'finished') {
    if (state.winner === 'draw') {
      statusEl.textContent = '引き分け！';
    } else {
      const winnerName = state.players[state.winner]?.name || (state.winner === 'B' ? '黒' : '白');
      const won = state.winner === myColor;
      statusEl.textContent = won ? `🎉 勝ち！（${winnerName}）` : `😢 負け…（勝者: ${winnerName}）`;
    }
    rematchBtn.classList.remove('hidden');
  }
}

socket.on('state', render);

socket.on('chat', ({ color, name, message }) => {
  const div = document.createElement('div');
  div.className = 'chat-msg';
  const who = document.createElement('span');
  who.className = `who ${color}`;
  who.textContent = name + ':';
  const msg = document.createElement('span');
  msg.textContent = ' ' + message;
  div.appendChild(who);
  div.appendChild(msg);
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
});

socket.on('connect_error', () => {
  showError('サーバーに接続できません');
});

socket.on('disconnect', () => {
  if (statusEl) statusEl.textContent = '接続が切れました…再接続中';
});
