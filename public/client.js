const TOKEN_KEY = 'osero.token';
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

const socket = io({ autoConnect: false, auth: (cb) => cb({ token: getToken() }) });

const authSection = document.getElementById('auth');
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const authName = document.getElementById('authName');
const authPassword = document.getElementById('authPassword');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authError = document.getElementById('authError');

const meNameEl = document.getElementById('meName');
const meRatingEl = document.getElementById('meRating');
const meWinsEl = document.getElementById('meWins');
const meLossesEl = document.getElementById('meLosses');
const meDrawsEl = document.getElementById('meDraws');
const meWinRateEl = document.getElementById('meWinRate');
const logoutBtn = document.getElementById('logoutBtn');

const lobby = document.getElementById('lobby');
const game = document.getElementById('game');
const codeInput = document.getElementById('codeInput');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const lobbyError = document.getElementById('lobbyError');
const ratingBlackEl = document.getElementById('ratingBlack');
const ratingWhiteEl = document.getElementById('ratingWhite');
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
const resignBtn = document.getElementById('resignBtn');
const leaveBtn = document.getElementById('leaveBtn');
const chatLog = document.getElementById('chatLog');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const audioToggleBtn = document.getElementById('audioToggleBtn');

let myColor = null;
let currentState = null;
let prevState = null;

const BGM_PLAYLIST = [
  'sounds/bgm1.mp3',
  'sounds/bgm2.mp3',
  'sounds/bgm3.mp3',
  'sounds/bgm4.mp3',
  'sounds/bgm5.mp3',
];

const audio = {
  bgm: new Audio(),
  place: new Audio('sounds/place.mp3'),
  turn: new Audio('sounds/turn.mp3'),
  win: new Audio('sounds/win.mp3'),
  lose: new Audio('sounds/lose.mp3'),
};
audio.bgm.volume = 0.3;
audio.place.volume = 0.6;
audio.turn.volume = 0.5;
audio.win.volume = 0.6;
audio.lose.volume = 0.6;
Object.values(audio).forEach(a => { a.preload = 'auto'; });

let bgmIndex = 0;
let bgmFailCount = 0;

function loadBgmTrack(index) {
  bgmIndex = ((index % BGM_PLAYLIST.length) + BGM_PLAYLIST.length) % BGM_PLAYLIST.length;
  audio.bgm.src = BGM_PLAYLIST[bgmIndex];
}

function playNextBgm() {
  bgmFailCount++;
  if (bgmFailCount >= BGM_PLAYLIST.length) {
    bgmFailCount = 0;
    return;
  }
  loadBgmTrack(bgmIndex + 1);
  if (audioEnabled) {
    const p = audio.bgm.play();
    if (p && p.catch) p.catch(() => {});
  }
}

audio.bgm.addEventListener('ended', () => {
  bgmFailCount = 0;
  loadBgmTrack(bgmIndex + 1);
  if (audioEnabled) {
    const p = audio.bgm.play();
    if (p && p.catch) p.catch(() => {});
  }
});

audio.bgm.addEventListener('error', () => {
  playNextBgm();
});

loadBgmTrack(0);

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
  bgmFailCount = 0;
  const p = audio.bgm.play();
  if (p && p.catch) p.catch(() => {});
}

function stopBGM() {
  audio.bgm.pause();
}

function skipBGM() {
  bgmFailCount = 0;
  loadBgmTrack(bgmIndex + 1);
  if (audioEnabled) {
    const p = audio.bgm.play();
    if (p && p.catch) p.catch(() => {});
  }
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

const skipBgmBtn = document.getElementById('skipBgmBtn');
if (skipBgmBtn) {
  skipBgmBtn.addEventListener('click', () => {
    if (!audioEnabled) return;
    skipBGM();
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

const urlParams = new URLSearchParams(location.search);
const urlRoom = urlParams.get('room');
if (urlRoom) codeInput.value = urlRoom.toUpperCase();

function showError(msg) {
  lobbyError.textContent = msg || '';
}

let authMode = 'login';
function setAuthMode(mode) {
  authMode = mode;
  tabLogin.classList.toggle('active', mode === 'login');
  tabRegister.classList.toggle('active', mode === 'register');
  authSubmitBtn.textContent = mode === 'login' ? 'ログイン' : '新規登録';
  authPassword.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  authError.textContent = '';
}
tabLogin.addEventListener('click', () => setAuthMode('login'));
tabRegister.addEventListener('click', () => setAuthMode('register'));

function showAuth() {
  authSection.classList.remove('hidden');
  lobby.classList.add('hidden');
  game.classList.add('hidden');
}

function showLobby(user) {
  authSection.classList.add('hidden');
  lobby.classList.remove('hidden');
  game.classList.add('hidden');
  renderProfile(user);
}

function renderProfile(user) {
  if (!user) return;
  meNameEl.textContent = user.name;
  meRatingEl.textContent = user.rating;
  meWinsEl.textContent = user.wins;
  meLossesEl.textContent = user.losses;
  meDrawsEl.textContent = user.draws;
  const total = (user.wins || 0) + (user.losses || 0) + (user.draws || 0);
  meWinRateEl.textContent = total === 0 ? '—' : `${Math.round((user.wins / total) * 100)}%`;
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'リクエスト失敗');
  return data;
}

async function apiGet(path) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'リクエスト失敗');
  return data;
}

authSubmitBtn.addEventListener('click', async () => {
  const name = authName.value.trim();
  const password = authPassword.value;
  authError.textContent = '';
  if (!name || !password) {
    authError.textContent = 'アカウント名とパスワードを入力してください';
    return;
  }
  try {
    const path = authMode === 'login' ? '/api/login' : '/api/register';
    const data = await apiPost(path, { name, password });
    setToken(data.token);
    authPassword.value = '';
    onAuthSuccess(data.user);
  } catch (err) {
    authError.textContent = err.message || '失敗しました';
  }
});

logoutBtn.addEventListener('click', () => {
  clearToken();
  socket.disconnect();
  showAuth();
});

function onAuthSuccess(user) {
  showLobby(user);
  socket.auth = { token: getToken() };
  if (!socket.connected) socket.connect();
}

async function bootstrap() {
  if (!getToken()) {
    showAuth();
    return;
  }
  try {
    const data = await apiGet('/api/me');
    onAuthSuccess(data.user);
  } catch {
    clearToken();
    showAuth();
  }
}

createBtn.addEventListener('click', () => {
  showError('');
  socket.emit('createRoom', {}, (res) => {
    if (!res || !res.ok) return showError(res?.error || '作成に失敗しました');
    enterGame(res.code, res.color);
  });
});

joinBtn.addEventListener('click', () => {
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return showError('ルームコードを入力してください');
  showError('');
  socket.emit('joinRoom', { code }, (res) => {
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
  authSection.classList.add('hidden');
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
  if (!currentState) return;
  const myReq = currentState.rematchRequests?.[myColor];
  if (myReq) {
    socket.emit('cancelRematch');
  } else {
    socket.emit('rematch');
  }
});

resignBtn.addEventListener('click', () => {
  if (!currentState || currentState.status !== 'playing') return;
  if (!confirm('本当に降参しますか？')) return;
  socket.emit('resign');
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
  ratingBlackEl.textContent = state.players.B?.rating != null ? `R${state.players.B.rating}` : '';
  ratingWhiteEl.textContent = state.players.W?.rating != null ? `R${state.players.W.rating}` : '';

  scoreBlackEl.classList.toggle('active', state.status === 'playing' && state.turn === 'B');
  scoreWhiteEl.classList.toggle('active', state.status === 'playing' && state.turn === 'W');

  if (state.status === 'waiting') {
    statusEl.textContent = '相手の参加を待っています…';
    rematchBtn.classList.add('hidden');
    resignBtn.classList.add('hidden');
  } else if (state.status === 'playing') {
    const turnName = state.players[state.turn]?.name || (state.turn === 'B' ? '黒' : '白');
    if (myTurn) {
      statusEl.textContent = `あなたの番（${state.turn === 'B' ? '黒' : '白'}）`;
    } else {
      statusEl.textContent = `${turnName} の番`;
    }
    rematchBtn.classList.add('hidden');
    resignBtn.classList.remove('hidden');
  } else if (state.status === 'finished') {
    const winnerName = state.winner && state.winner !== 'draw'
      ? (state.players[state.winner]?.name || (state.winner === 'B' ? '黒' : '白'))
      : null;
    const won = state.winner === myColor;
    if (state.endReason === 'resign') {
      const resignedName = state.players[state.resignedBy]?.name || (state.resignedBy === 'B' ? '黒' : '白');
      if (state.resignedBy === myColor) {
        statusEl.textContent = `😢 降参しました（勝者: ${winnerName}）`;
      } else {
        statusEl.textContent = `🎉 ${resignedName} が降参！あなたの勝ち`;
      }
    } else if (state.winner === 'draw') {
      statusEl.textContent = '引き分け！';
    } else {
      statusEl.textContent = won ? `🎉 勝ち！（${winnerName}）` : `😢 負け…（勝者: ${winnerName}）`;
    }
    resignBtn.classList.add('hidden');
    rematchBtn.classList.remove('hidden');

    const myReq = state.rematchRequests?.[myColor];
    const oppReq = state.rematchRequests?.[myColor === 'B' ? 'W' : 'B'];
    rematchBtn.classList.remove('waiting');
    if (myReq && !oppReq) {
      rematchBtn.textContent = '再戦希望中… (取消)';
      rematchBtn.classList.add('waiting');
    } else if (!myReq && oppReq) {
      const oppName = state.players[myColor === 'B' ? 'W' : 'B']?.name || '相手';
      rematchBtn.textContent = `${oppName} が再戦希望！同意する`;
      rematchBtn.classList.add('waiting');
    } else {
      rematchBtn.textContent = 'もう一度';
    }
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

socket.on('connect_error', (err) => {
  const msg = err && err.message;
  if (msg === 'AUTH_REQUIRED' || msg === 'AUTH_INVALID' || msg === 'AUTH_FAILED') {
    clearToken();
    showAuth();
    authError.textContent = 'セッションが無効です。再度ログインしてください。';
    return;
  }
  showError('サーバーに接続できません');
});

socket.on('disconnect', () => {
  if (statusEl) statusEl.textContent = '接続が切れました…再接続中';
});

function refreshProfile() {
  apiGet('/api/me').then((data) => renderProfile(data.user)).catch(() => {});
}

let prevStatus = null;
socket.on('state', (state) => {
  if (prevStatus !== 'finished' && state.status === 'finished') {
    refreshProfile();
  }
  prevStatus = state.status;
});

bootstrap();
