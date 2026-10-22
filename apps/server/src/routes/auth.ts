import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, nowIso } from '../db/index.js';
import { ulid } from '../lib/ids.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  clearSessionCookie,
  createSession,
  destroyOtherSessions,
  destroySession,
  findUserByUsername,
  isLocked,
  registerFailure,
  registerSuccess,
  resolveSession,
  setSessionCookie,
  userCount,
} from '../lib/auth.js';
import { ApiError, assertSameOrigin, requireUser } from '../lib/http.js';
import { audit, setSetting } from '../lib/settings.js';

const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名').max(64),
  password: z.string().min(1, '请输入密码').max(256),
});

const setupSchema = z.object({
  username: z.string().trim().min(3, '用户名至少 3 位').max(64).regex(/^[a-zA-Z0-9_.-]+$/, '用户名只允许字母数字与 _ . -'),
  password: z.string().min(8, '密码至少 8 位').max(256),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8, '密码至少 8 位').max(256),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/auth/state', async (req) => {
    const needsSetup = userCount() === 0;
    const user = needsSetup ? null : resolveSession(req);
    return { needsSetup, authenticated: user !== null, user };
  });

  app.post('/auth/setup', async (req, reply) => {
    assertSameOrigin(req);
    if (userCount() > 0) throw new ApiError(409, 'CONFLICT', '管理员已初始化');
    const body = setupSchema.parse(req.body);

    const id = ulid();
    const now = nowIso();
    db.prepare(
      `INSERT INTO users (id, username, username_key, password_hash, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?)`,
    ).run(id, body.username, body.username.toLowerCase(), await hashPassword(body.password), now, now);

    setSetting('site.meta', { version: 1, setupCompletedAt: now }, id);
    const { token, expiresAt } = createSession(id, req);
    setSessionCookie(reply, token, expiresAt);
    audit(id, 'auth.setup', 'user', id, { username: body.username }, req.ip);

    return reply.status(201).send({ user: { id, username: body.username, role: 'admin' } });
  });

  app.post('/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      assertSameOrigin(req);
      const body = loginSchema.parse(req.body);
      const user = findUserByUsername(body.username);

      if (!user) throw new ApiError(401, 'UNAUTHENTICATED', '用户名或密码错误');
      if (user.status !== 'active') throw new ApiError(403, 'FORBIDDEN', '账号已停用');
      if (isLocked(user)) throw new ApiError(429, 'RATE_LIMITED', '登录失败次数过多，请稍后再试');

      const ok = await verifyPassword(body.password, user.password_hash);
      if (!ok) {
        registerFailure(user);
        throw new ApiError(401, 'UNAUTHENTICATED', '用户名或密码错误');
      }

      registerSuccess(user.id);
      const { token, expiresAt } = createSession(user.id, req);
      setSessionCookie(reply, token, expiresAt);
      audit(user.id, 'auth.login', 'user', user.id, null, req.ip);
      return { user: { id: user.id, username: user.username, role: user.role } };
    },
  });

  app.post('/auth/logout', async (req, reply) => {
    assertSameOrigin(req);
    destroySession(req);
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.get('/auth/me', async (req) => {
    const user = requireUser(req);
    return { user };
  });

  app.post('/auth/password', async (req, reply) => {
    assertSameOrigin(req);
    const user = requireUser(req);
    const body = passwordSchema.parse(req.body);

    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as
      | { password_hash: string }
      | undefined;
    if (!row) throw new ApiError(401, 'UNAUTHENTICATED', '会话失效');

    if (!(await verifyPassword(body.currentPassword, row.password_hash))) {
      throw new ApiError(401, 'UNAUTHENTICATED', '当前密码不正确');
    }

    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      await hashPassword(body.newPassword),
      nowIso(),
      user.id,
    );
    destroyOtherSessions(user.id, req);
    audit(user.id, 'auth.password_changed', 'user', user.id, null, req.ip);
    return reply.status(204).send();
  });

  app.get('/auth/sessions', async (req) => {
    const user = requireUser(req);
    const rows = db
      .prepare('SELECT id, created_at, last_seen_at, ip, user_agent FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC')
      .all(user.id) as { id: string; created_at: string; last_seen_at: string | null; ip: string | null; user_agent: string | null }[];
    return {
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        ip: row.ip,
        userAgent: row.user_agent,
      })),
    };
  });

  app.delete('/auth/sessions/:id', async (req, reply) => {
    assertSameOrigin(req);
    const user = requireUser(req);
    const { id } = req.params as { id: string };
    db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(id, user.id);
    return reply.status(204).send();
  });
}
