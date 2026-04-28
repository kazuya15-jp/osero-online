const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-change-in-production';
const JWT_EXPIRES_IN = '30d';

if (!process.env.JWT_SECRET) {
  console.warn('警告: JWT_SECRET 未設定。本番では必ず環境変数で設定してください。');
}

const NAME_RE = /^[A-Za-z0-9_\-]{3,20}$/;

function validateName(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    return 'アカウント名は半角英数字・_-、3〜20文字で入力してください。';
  }
  return null;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6 || password.length > 100) {
    return 'パスワードは6〜100文字で入力してください。';
  }
  return null;
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(user) {
  return jwt.sign({ uid: user.id, name: user.name }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: '認証が必要です' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'トークンが無効です' });
  req.user = payload;
  next();
}

module.exports = {
  validateName,
  validatePassword,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  authMiddleware,
};
