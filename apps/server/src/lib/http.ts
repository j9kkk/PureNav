import type { FastifyReply, FastifyRequest } from 'fastify';
import { resolveSession, type SessionUser } from './auth.js';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function requireUser(req: FastifyRequest): SessionUser {
  const user = resolveSession(req);
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', '请先登录');
  return user;
}

/** Non-throwing variant for endpoints that need the user only to decide what to include. */
export function resolveRequestUser(req: FastifyRequest): SessionUser | null {
  return resolveSession(req);
}

export function requireAdmin(req: FastifyRequest): SessionUser {
  const user = requireUser(req);
  if (user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', '需要管理员权限');
  return user;
}

/** Same-origin check for state-changing requests; SameSite=Lax is the first line, this is defence in depth. */
export function assertSameOrigin(req: FastifyRequest): void {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const origin = req.headers.origin;
  if (!origin) return;
  const host = req.headers.host;
  try {
    if (new URL(origin).host !== host) {
      throw new ApiError(403, 'FORBIDDEN', '跨站请求被拒绝');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(403, 'FORBIDDEN', '非法的 Origin');
  }
}

export function notFound(message = '资源不存在'): never {
  throw new ApiError(404, 'NOT_FOUND', message);
}

export function sendError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof ApiError) {
    return reply.status(error.status).send({
      error: { code: error.code, message: error.message, details: error.details },
    });
  }
  return reply.status(500).send({
    error: { code: 'INTERNAL', message: '服务器内部错误' },
  });
}
