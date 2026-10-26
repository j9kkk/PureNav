import type Database from 'better-sqlite3';
import { ulid } from '../lib/ids.js';

export const MIGRATIONS: { id: string; sql: string; after?: (db: Database.Database) => void }[] = [
  {
    id: '0001_init',
    sql: `
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL,
  username_key  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','viewer')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  failed_count  INTEGER NOT NULL DEFAULT 0,
  locked_until  TEXT,
  last_login_at TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_users_username_key ON users(username_key);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT,
  ip           TEXT,
  user_agent   TEXT
);
CREATE UNIQUE INDEX ux_sessions_token_hash ON sessions(token_hash);
CREATE INDEX ix_sessions_user ON sessions(user_id);

CREATE TABLE groups (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  sort_order  INTEGER NOT NULL,
  collapsed   INTEGER NOT NULL DEFAULT 0,
  visibility  TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  enabled     INTEGER NOT NULL DEFAULT 1,
  owner_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX ix_groups_order ON groups(sort_order);

CREATE TABLE assets (
  id          TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  width       INTEGER,
  height      INTEGER,
  checksum    TEXT,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_assets_storage_key ON assets(storage_key);

CREATE TABLE items (
  id              TEXT PRIMARY KEY,
  group_id        TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  url             TEXT NOT NULL,
  lan_url         TEXT,
  description     TEXT,
  icon_type       TEXT NOT NULL DEFAULT 'auto'
                  CHECK (icon_type IN ('auto','url','iconify','asset','text')),
  icon_ref        TEXT,
  icon_asset_id   TEXT REFERENCES assets(id) ON DELETE SET NULL,
  open_in_new_tab INTEGER NOT NULL DEFAULT 1,
  pinned          INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL,
  visibility      TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  enabled         INTEGER NOT NULL DEFAULT 1,
  owner_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (
    (icon_type = 'asset'   AND icon_asset_id IS NOT NULL) OR
    (icon_type = 'url'     AND icon_ref IS NOT NULL) OR
    (icon_type = 'iconify' AND icon_ref IS NOT NULL) OR
    (icon_type IN ('auto','text'))
  )
);
CREATE INDEX ix_items_group_order ON items(group_id, sort_order);
CREATE INDEX ix_items_title ON items(title);
CREATE INDEX ix_items_enabled ON items(enabled, visibility);

CREATE TABLE tags (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  name_key   TEXT NOT NULL,
  color      TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_tags_name_key ON tags(name_key);

CREATE TABLE item_tags (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);
CREATE INDEX ix_item_tags_tag ON item_tags(tag_id);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE audit_logs (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  payload     TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX ix_audit_created ON audit_logs(created_at DESC);
CREATE INDEX ix_audit_entity ON audit_logs(entity_type, entity_id);
`,
  },
  {
    id: '0002_group_tree',
    sql: `
ALTER TABLE groups ADD COLUMN parent_id TEXT REFERENCES groups(id) ON DELETE CASCADE;
CREATE INDEX ix_groups_parent ON groups(parent_id);
`,
    after: backfillGroupTree,
  },
];

/**
 * One-time backfill: bookmark imports once stored the whole folder hierarchy inside the
 * group name ("收藏夹栏 / private / VPN"). Rebuilds real parent links from those paths and
 * renames each group to its last segment, matching how Edge/natively-managed trees look.
 */
function backfillGroupTree(db: Database.Database): void {
  interface Row {
    id: string;
    name: string;
  }
  const rows = db.prepare('SELECT id, name FROM groups').all() as Row[];

  // fullPath -> group id; seeds with existing full-path names so already-imported
  // parents are reused instead of duplicated.
  const knownPaths = new Map<string, string>();
  for (const row of rows) {
    if (row.name.includes(' / ')) knownPaths.set(row.name, row.id);
  }

  const insert = db.prepare(
    `INSERT INTO groups (id, name, sort_order, collapsed, visibility, enabled, parent_id, created_at, updated_at)
     VALUES (?, ?, ?, 0, 'public', 1, ?, ?, ?)`,
  );
  const rename = db.prepare('UPDATE groups SET name = ?, parent_id = ?, updated_at = ? WHERE id = ?');
  let orderSeq = (db.prepare('SELECT MAX(sort_order) AS m FROM groups').get() as { m: number | null }).m ?? 0;

  for (const row of rows) {
    if (!row.name.includes(' / ')) continue;
    const segments = row.name.split(' / ').map((part) => part.trim()).filter(Boolean);
    if (segments.length < 2) continue;

    let parentId: string | null = null;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const pathKey = segments.slice(0, i + 1).join(' / ');
      let ancestorId = knownPaths.get(pathKey);
      if (!ancestorId) {
        ancestorId = ulid();
        orderSeq += 1024;
        insert.run(ancestorId, segments[i]!, orderSeq, parentId, new Date().toISOString(), new Date().toISOString());
        knownPaths.set(pathKey, ancestorId);
      }
      parentId = ancestorId;
    }

    // Register the original full path before renaming so deeper descendants can find it.
    knownPaths.set(row.name, row.id);
    rename.run(segments[segments.length - 1]!, parentId, new Date().toISOString(), row.id);
  }
}

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((row) => String((row as { id: string }).id)),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(
        migration.id,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
      migration.after?.(db);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
