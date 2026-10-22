import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, nowIso } from '../db/index.js';
import { config } from '../config.js';
import { ulid } from '../lib/ids.js';
import { ApiError, assertSameOrigin, requireAdmin } from '../lib/http.js';
import { audit, bumpVersion, getSetting, mergeSetting } from '../lib/settings.js';

const settingsSchema = z.object({
  identity: z
    .object({
      title: z.string().trim().min(1).max(60).optional(),
      logo: z.string().max(2048).nullish(),
      favicon: z.string().max(2048).nullish(),
      description: z.string().max(300).nullish(),
    })
    .optional(),
  theme: z
    .object({
      mode: z.enum(['light', 'dark', 'auto']).optional(),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      radius: z.number().int().min(0).max(48).optional(),
      shadow: z.enum(['none', 'soft', 'strong']).optional(),
    })
    .optional(),
  layout: z
    .object({
      density: z.enum(['compact', 'comfortable']).optional(),
      cardSize: z.enum(['sm', 'md', 'lg']).optional(),
      showDescription: z.boolean().optional(),
      defaultView: z.enum(['grid', 'list']).optional(),
    })
    .optional(),
});

const SETTING_KEYS: Record<keyof z.infer<typeof settingsSchema>, string> = {
  identity: 'site.identity',
  theme: 'site.theme',
  layout: 'site.layout',
};

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/settings', async (req) => {
    requireAdmin(req);
    return {
      identity: getSetting('site.identity'),
      theme: getSetting('site.theme'),
      layout: getSetting('site.layout'),
      security: getSetting('site.security'),
      meta: getSetting('site.meta'),
    };
  });

  app.patch('/admin/settings', async (req) => {
    assertSameOrigin(req);
    const user = requireAdmin(req);
    const body = settingsSchema.parse(req.body);

    for (const [section, patch] of Object.entries(body) as [keyof typeof SETTING_KEYS, Record<string, unknown>][]) {
      if (!patch) continue;
      mergeSetting(SETTING_KEYS[section], patch, user.id);
    }

    bumpVersion();
    audit(user.id, 'settings.update', 'settings', null, body, req.ip);
    return {
      identity: getSetting('site.identity'),
      theme: getSetting('site.theme'),
      layout: getSetting('site.layout'),
      security: getSetting('site.security'),
      meta: getSetting('site.meta'),
    };
  });

  app.get('/admin/export', async (req, reply) => {
    requireAdmin(req);
    const format = (req.query as { format?: string }).format ?? 'json';

    const groups = db.prepare('SELECT * FROM groups ORDER BY sort_order ASC').all();
    const items = db.prepare('SELECT * FROM items ORDER BY group_id ASC, sort_order ASC').all();
    const tags = db.prepare('SELECT * FROM tags').all();
    const itemTags = db.prepare('SELECT * FROM item_tags').all();
    const settings = db.prepare('SELECT key, value FROM settings').all();

    if (format === 'bookmarks.html') {
      const html = toNetscapeBookmarks(groups as ExportGroup[], items as ExportItem[]);
      reply.header('Content-Type', 'text/html; charset=utf-8');
      reply.header('Content-Disposition', 'attachment; filename="purenav-bookmarks.html"');
      return reply.send(html);
    }

    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="purenav-export.json"');
    return reply.send({
      format: 'purenav/v1',
      exportedAt: nowIso(),
      groups,
      items,
      tags,
      itemTags,
      settings,
    });
  });

  app.post('/admin/import', async (req) => {
    assertSameOrigin(req);
    const user = requireAdmin(req);
    const mode = (req.query as { mode?: string }).mode ?? 'merge';
    const body = req.body as Record<string, unknown> | undefined;

    if (!body || body.format !== 'purenav/v1') {
      throw new ApiError(422, 'VALIDATION_FAILED', '不支持的文件格式');
    }

    const importedGroups = (body.groups as RawGroup[] | undefined) ?? [];
    const importedItems = (body.items as RawItem[] | undefined) ?? [];
    if (!Array.isArray(importedGroups) || !Array.isArray(importedItems)) {
      throw new ApiError(422, 'VALIDATION_FAILED', 'groups/items 必须是数组');
    }

    // The export carries tag definitions and their item links; ignoring them silently
    // loses every tag on import, so rebuild the mapping through the old item ids.
    const importedTags = Array.isArray(body.tags) ? (body.tags as RawTag[]) : [];
    const importedItemTags = Array.isArray(body.itemTags) ? (body.itemTags as RawItemTag[]) : [];
    const tagNameByOldId = new Map(importedTags.map((tag) => [String(tag.id), String(tag.name ?? '')]));

    const now = nowIso();
    let created = 0;

    db.transaction(() => {
      if (mode === 'replace') {
        db.prepare('DELETE FROM items').run();
        db.prepare('DELETE FROM groups').run();
        db.prepare('DELETE FROM tags').run();
      }

      const groupIdMap = new Map<string, string>();
      for (const group of importedGroups) {
        const id = ulid();
        groupIdMap.set(group.id, id);
        db.prepare(
          `INSERT INTO groups (id, name, description, icon, sort_order, collapsed, visibility, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          String(group.name ?? '未命名分组').slice(0, 40),
          group.description ?? null,
          group.icon ?? null,
          Number(group.sort_order ?? 1024),
          group.collapsed ? 1 : 0,
          group.visibility === 'private' ? 'private' : 'public',
          group.enabled === 0 ? 0 : 1,
          now,
          now,
        );
        created += 1;
      }

      const itemIdMap = new Map<string, string>();
      for (const item of importedItems) {
        const groupId = groupIdMap.get(String(item.group_id)) ?? groupIdMap.values().next().value;
        if (!groupId) continue;
        const iconType = ['auto', 'url', 'iconify', 'asset', 'text'].includes(String(item.icon_type))
          ? String(item.icon_type)
          : 'auto';
        const newItemId = ulid();
        if (item.id) itemIdMap.set(String(item.id), newItemId);
        db.prepare(
          `INSERT INTO items (id, group_id, title, url, lan_url, description, icon_type, icon_ref, icon_asset_id,
                              open_in_new_tab, pinned, sort_order, visibility, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          newItemId,
          groupId,
          String(item.title ?? '未命名').slice(0, 80),
          String(item.url ?? ''),
          item.lan_url ?? null,
          item.description ?? null,
          iconType === 'asset' ? 'auto' : iconType,
          iconType === 'asset' ? null : item.icon_ref ?? null,
          null,
          item.open_in_new_tab === 0 ? 0 : 1,
          item.pinned ? 1 : 0,
          Number(item.sort_order ?? 1024),
          item.visibility === 'private' ? 'private' : 'public',
          item.enabled === 0 ? 0 : 1,
          now,
          now,
        );
        created += 1;
      }

      // Rebuild tag links: old item id -> new item id, old tag id -> tag name -> tag row.
      if (importedItemTags.length > 0) {
        const findOrCreateTag = (name: string): string | null => {
          const trimmed = name.trim();
          if (!trimmed) return null;
          const key = trimmed.toLowerCase();
          const existing = db.prepare('SELECT id FROM tags WHERE name_key = ?').get(key) as { id: string } | undefined;
          if (existing) return existing.id;
          const id = ulid();
          db.prepare('INSERT INTO tags (id, name, name_key, created_at) VALUES (?, ?, ?, ?)').run(id, trimmed, key, now);
          return id;
        };

        for (const link of importedItemTags) {
          const newItemId = itemIdMap.get(String(link.item_id));
          const tagName = tagNameByOldId.get(String(link.tag_id));
          if (!newItemId || !tagName) continue;
          const tagId = findOrCreateTag(tagName);
          if (!tagId) continue;
          db.prepare('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)').run(newItemId, tagId);
        }
      }
    })();

    bumpVersion();
    audit(user.id, 'import', 'settings', null, { mode, created }, req.ip);
    return { created, mode };
  });

  app.get('/admin/audit-logs', async (req) => {
    requireAdmin(req);
    const query = req.query as { limit?: string; cursor?: string; entityType?: string };
    const limit = Math.min(200, Math.max(1, Number.parseInt(query.limit ?? '50', 10) || 50));

    const where: string[] = [];
    const params: unknown[] = [];
    if (query.cursor) {
      where.push('created_at < ?');
      params.push(query.cursor);
    }
    if (query.entityType) {
      where.push('entity_type = ?');
      params.push(query.entityType);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = db
      .prepare(`SELECT * FROM audit_logs ${clause} ORDER BY created_at DESC LIMIT ?`)
      .all(...params, limit) as Record<string, unknown>[];

    return {
      items: rows,
      nextCursor: rows.length === limit ? rows[rows.length - 1]?.created_at ?? null : null,
    };
  });
}

interface ExportGroup {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface ExportItem {
  group_id: string;
  title: string;
  url: string;
  description: string | null;
  [key: string]: unknown;
}

interface RawGroup {
  id: string;
  name?: string;
  [key: string]: unknown;
}

interface RawTag {
  id: string;
  name?: string;
  color?: string | null;
  [key: string]: unknown;
}

interface RawItemTag {
  item_id: string;
  tag_id: string;
  [key: string]: unknown;
}

interface RawItem {
  group_id: string;
  title?: string;
  url?: string;
  [key: string]: unknown;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toNetscapeBookmarks(groups: ExportGroup[], items: ExportItem[]): string {
  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>PureNav Bookmarks</TITLE>',
    '<H1>PureNav Bookmarks</H1>',
    '<DL><p>',
  ];

  for (const group of groups) {
    lines.push(`    <DT><H3>${escapeHtml(group.name)}</H3>`);
    lines.push('    <DL><p>');
    for (const item of items.filter((entry) => entry.group_id === group.id)) {
      const desc = item.description ? ` DESC="${escapeHtml(item.description)}"` : '';
      lines.push(`        <DT><A HREF="${escapeHtml(item.url)}"${desc}>${escapeHtml(item.title)}</A>`);
    }
    lines.push('    </DL><p>');
  }

  lines.push('</DL><p>');
  return lines.join('\n');
}

/**
 * SVG is deliberately excluded. Serving user-supplied SVG from our own origin means
 * any embedded script or external reference runs in our context, and sanitising SVG
 * correctly is a moving target. Bitmap formats cover every icon use case here.
 */
const ALLOWED_MIME = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);

const MAX_UPLOAD_BYTES = 512 * 1024;

const ICONIFY_SEARCH_URL = 'https://api.iconify.design/search';
const ICONIFY_PREFIX_URL = 'https://api.iconify.design';
const ICONIFY_TIMEOUT_MS = 5000;
/** Iconify's own limits: 32 results per request, 999 max. */
const ICONIFY_MAX_RESULTS = 32;

interface IconifySearchResponse {
  icons?: string[];
  total?: number;
}

/**
 * Proxies Iconify search so the browser never has to know a third-party origin, and
 * so we control the outbound request (fixed host, timeout, size cap).
 */
async function searchIconify(query: string, limit: number): Promise<{ id: string; url: string }[]> {
  const url = new URL(ICONIFY_SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('limit', String(Math.min(limit, ICONIFY_MAX_RESULTS)));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ICONIFY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return [];

    const text = await response.text();
    // Guard against an unexpectedly large body; the real payload is a few KB.
    if (text.length > 256 * 1024) return [];

    const payload = JSON.parse(text) as IconifySearchResponse;
    return (payload.icons ?? []).map((id) => ({ id, url: `${ICONIFY_PREFIX_URL}/${id.replace(':', '/')}.svg` }));
  } catch {
    // Search is a convenience; a network failure returns an empty list, not an error.
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function assetUploadRoutes(app: FastifyInstance): Promise<void> {
  app.post('/admin/icons/upload', async (req, reply) => {
    assertSameOrigin(req);
    const user = requireAdmin(req);

    const file = await req.file();
    if (!file) throw new ApiError(422, 'VALIDATION_FAILED', '缺少上传文件');

    const buffer = await file.toBuffer();
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new ApiError(422, 'VALIDATION_FAILED', '图片不能超过 512KB');
    }

    const ext = ALLOWED_MIME.get(file.mimetype);
    if (!ext) throw new ApiError(422, 'VALIDATION_FAILED', '仅支持 png/jpeg/webp');

    // Magic-byte check: never trust the declared Content-Type alone.
    if (!looksLike(file.mimetype, buffer)) {
      throw new ApiError(422, 'VALIDATION_FAILED', '文件内容与声明的类型不符');
    }

    const assetId = ulid();
    const storageKey = `${assetId}.${ext}`;
    const target = path.join(config.assetsDir, storageKey);
    await fs.promises.writeFile(target, buffer);

    db.prepare(
      `INSERT INTO assets (id, storage_key, mime, size, checksum, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(assetId, storageKey, file.mimetype, buffer.byteLength, randomBytes(8).toString('hex'), user.id, nowIso());

    audit(user.id, 'asset.upload', 'asset', assetId, { size: buffer.byteLength, mime: file.mimetype }, req.ip);
    return reply.status(201).send({ assetId, url: `/uploads/${storageKey}` });
  });

  app.get('/admin/icons/search', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    handler: async (req) => {
      requireAdmin(req);
      const { q, limit } = req.query as { q?: string; limit?: string };
      const query = (q ?? '').trim();
      if (query.length < 2) return { items: [] };

      const parsed = Number.parseInt(limit ?? String(ICONIFY_MAX_RESULTS), 10);
      const items = await searchIconify(query, Number.isFinite(parsed) ? parsed : ICONIFY_MAX_RESULTS);
      return { items };
    },
  });
}

/** Served from the site root so icon URLs stay short and CDN-cacheable. */
export async function assetReadRoutes(app: FastifyInstance): Promise<void> {
  app.get('/uploads/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    const storageKey = path.basename(key);
    const row = db.prepare('SELECT mime FROM assets WHERE storage_key = ?').get(storageKey) as { mime: string } | undefined;
    if (!row) throw new ApiError(404, 'NOT_FOUND', '资源不存在');

    const filePath = path.join(config.assetsDir, storageKey);
    if (!fs.existsSync(filePath)) throw new ApiError(404, 'NOT_FOUND', '资源文件缺失');

    reply.header('Content-Type', row.mime);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    reply.header('X-Content-Type-Options', 'nosniff');
    return reply.send(fs.createReadStream(filePath));
  });
}

/**
 * Magic-byte check. The declared MIME is only a hint; the bytes decide. Kept in sync
 * with ALLOWED_MIME — any format absent here is rejected regardless of its label.
 */
export function looksLike(mime: string, buffer: Buffer): boolean {
  if (mime === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mime === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}
