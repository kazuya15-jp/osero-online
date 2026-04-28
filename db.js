const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL が設定されていません。Render の Postgres を接続するか、ローカルで .env を用意してください。');
  process.exit(1);
}

const useSsl =
  !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) &&
  process.env.PGSSL !== 'disable';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      pass_hash TEXT NOT NULL,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      rating INTEGER NOT NULL DEFAULT 1500,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      black_user_id INTEGER NOT NULL REFERENCES users(id),
      white_user_id INTEGER NOT NULL REFERENCES users(id),
      winner TEXT NOT NULL,
      end_reason TEXT NOT NULL,
      black_rating_before INTEGER NOT NULL,
      white_rating_before INTEGER NOT NULL,
      black_rating_after INTEGER NOT NULL,
      white_rating_after INTEGER NOT NULL,
      played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function findUserByName(name) {
  const { rows } = await pool.query('SELECT * FROM users WHERE name = $1', [name]);
  return rows[0] || null;
}

async function findUserById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createUser(name, passHash) {
  const { rows } = await pool.query(
    'INSERT INTO users (name, pass_hash) VALUES ($1, $2) RETURNING *',
    [name, passHash]
  );
  return rows[0];
}

async function recordGameResult({
  blackId,
  whiteId,
  winner,
  endReason,
  blackRatingBefore,
  whiteRatingBefore,
  blackRatingAfter,
  whiteRatingAfter,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO games
       (black_user_id, white_user_id, winner, end_reason,
        black_rating_before, white_rating_before,
        black_rating_after, white_rating_after)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [blackId, whiteId, winner, endReason, blackRatingBefore, whiteRatingBefore, blackRatingAfter, whiteRatingAfter]
    );

    if (winner === 'black') {
      await client.query('UPDATE users SET wins = wins + 1, rating = $2 WHERE id = $1', [blackId, blackRatingAfter]);
      await client.query('UPDATE users SET losses = losses + 1, rating = $2 WHERE id = $1', [whiteId, whiteRatingAfter]);
    } else if (winner === 'white') {
      await client.query('UPDATE users SET wins = wins + 1, rating = $2 WHERE id = $1', [whiteId, whiteRatingAfter]);
      await client.query('UPDATE users SET losses = losses + 1, rating = $2 WHERE id = $1', [blackId, blackRatingAfter]);
    } else {
      await client.query('UPDATE users SET draws = draws + 1, rating = $2 WHERE id = $1', [blackId, blackRatingAfter]);
      await client.query('UPDATE users SET draws = draws + 1, rating = $2 WHERE id = $1', [whiteId, whiteRatingAfter]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  init,
  findUserByName,
  findUserById,
  createUser,
  recordGameResult,
};
