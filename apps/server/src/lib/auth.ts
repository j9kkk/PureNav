import type { FastifyReply, FastifyRequest } from 'fastify';
import { db, nowIso } from '../db/index.js';
import { randomToken, sha256, ulid } from './ids.js';
import { config } from '../config.js';

export interface SessionUser {
  id: string;
  username: string;
  role: 'admin' | 'viewer';
}

export const SESSION_COOKIE = 'pn_session';

const MAX_FAILED = 10;
const LOCK_MINUTES = 15;

interface UserRow {
  id: string;
  username: string;
  username_key: string;
  password_hash: string;
  role: 'admin' | 'viewer';
  status: string;
  failed_count: number;
  locked_until: string | null;
}

export function findUserByUsername(username: string): UserRow | undefined {
  return db
    .prepare('SELECT * FROM users WHERE username_key = ?')
    .get(username.trim().toLowerCase()) as UserRow | undefined;
}

export function userCount(): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  return row.n;
}

export function isLocked(user: UserRow): boolean {
  return user.locked_until !== null && new Date(user.locked_until).getTime() > Date.now();
}

export function registerFailure(user: UserRow): void {
  const failed = user.failed_count + 1;
  const lock = failed >= MAX_FAILED
    ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
    : null;
  db.prepare('UPDATE users SET failed_count = ?, locked_until = ?, updated_at = ? WHERE id = ?').run(
    lock ? 0 : failed,
    lock,
    nowIso(),
    user.id,
  );
}

export function registerSuccess(userId: string): void {
  db.prepare(
    'UPDATE users SET failed_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?',
  ).run(nowIso(), nowIso(), userId);
}

export function createSession(userId: string, req: FastifyRequest): { token: string; expiresAt: Date } {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 86_400_000);
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ulid(),
    userId,
    sha256(token),
    expiresAt.toISOString(),
    nowIso(),
    nowIso(),
    req.ip ?? null,
    req.headers['user-agent'] ?? null,
  );
  return { token, expiresAt };
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.PURE_SECURE_COOKIE === '1',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function resolveSession(req: FastifyRequest): SessionUser | null {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;

  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, u.id, u.username, u.role, u.status
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(sha256(token)) as
    | { session_id: string; expires_at: string; id: string; username: string; role: 'admin' | 'viewer'; status: string }
    | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    return null;
  }
  if (row.status !== 'active') return null;

  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), row.session_id);
  return { id: row.id, username: row.username, role: row.role };
}

export function destroySession(req: FastifyRequest): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function destroyOtherSessions(userId: string, req: FastifyRequest): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, sha256(token));
}
