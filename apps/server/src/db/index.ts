import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { migrate } from './migrations.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.assetsDir, { recursive: true });

export const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

migrate(db);

export function closeDb(): void {
  db.close();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export { path };
