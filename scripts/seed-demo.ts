// 生成用于视觉验收的演示库：结构、数量、命名都贴近真实使用，但不含隐私数据。
// 用法: node --import tsx scripts/seed-demo.ts <targetDir>
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { hashPassword } from '../apps/server/src/lib/password.ts';
import { migrate } from '../apps/server/src/db/migrations.ts';

const target = path.resolve(process.argv[2] ?? '/tmp/pn-demo');
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.join(target, 'assets'), { recursive: true });

const db = new Database(path.join(target, 'purenav.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
migrate(db);

const now = new Date().toISOString();
const userId = 'u_demo_admin';
db.prepare(
  `INSERT INTO users (id, username, username_key, password_hash, role, status, created_at, updated_at)
   VALUES (?,?,?,?,?,?,?,?)`,
).run(userId, 'admin', 'admin', await hashPassword('purenav-demo'), 'admin', 'active', now, now);

type G = { id: string; name: string; icon: string; parent?: string; collapsed?: number };
const groups: G[] = [
  { id: 'g_dev', name: '开发工具', icon: '🛠' },
  { id: 'g_docs', name: '文档与规范', icon: '📘', parent: 'g_dev' },
  { id: 'g_design', name: '设计资源', icon: '🎨' },
  { id: 'g_team', name: '团队协作', icon: '👥' },
  { id: 'g_read', name: '资讯阅读', icon: '📰' },
  { id: 'g_self', name: '个人服务', icon: '🏠' },
];

type I = { g: string; title: string; url: string; desc?: string; tags?: string[]; pinned?: number };
const items: I[] = [
  // 开发工具
  { g: 'g_dev', title: 'GitHub', url: 'https://github.com', desc: '代码托管、Issue 与 PR 评审', tags: ['常用'], pinned: 1 },
  { g: 'g_dev', title: 'Vercel', url: 'https://vercel.com', desc: '前端部署与预览环境', tags: ['常用'] },
  { g: 'g_dev', title: 'Cloudflare', url: 'https://dash.cloudflare.com', desc: 'DNS、隧道与边缘缓存', tags: ['内部'] },
  { g: 'g_dev', title: 'Docker Hub', url: 'https://hub.docker.com', desc: '镜像仓库与自动化构建', tags: ['内部'] },
  { g: 'g_dev', title: 'npm', url: 'https://www.npmjs.com', desc: '包检索与版本对比', tags: ['外部'] },
  { g: 'g_dev', title: 'Sentry', url: 'https://sentry.io', desc: '线上异常与性能追踪', tags: ['内部'] },
  // 文档与规范（子分组）
  { g: 'g_docs', title: 'MDN', url: 'https://developer.mozilla.org', desc: 'Web 平台 API 参考', tags: ['常用'] },
  { g: 'g_docs', title: 'React', url: 'https://react.dev', desc: 'Hooks 与并发渲染指南' },
  { g: 'g_docs', title: 'Vite', url: 'https://vite.dev', desc: '构建配置与插件体系' },
  // 设计资源
  { g: 'g_design', title: 'Figma', url: 'https://www.figma.com', desc: '组件库与交付标注', tags: ['常用'], pinned: 1 },
  { g: 'g_design', title: 'Dribbble', url: 'https://dribbble.com', desc: '界面与图标灵感' },
  { g: 'g_design', title: 'Unsplash', url: 'https://unsplash.com', desc: '可商用摄影素材' },
  { g: 'g_design', title: 'Iconify', url: 'https://icon-sets.iconify.design', desc: '统一图标检索与导出' },
  { g: 'g_design', title: 'Coolors', url: 'https://coolors.co', desc: '配色方案与对比度检查' },
  // 团队协作
  { g: 'g_team', title: 'Notion', url: 'https://www.notion.so', desc: '需求文档与会议纪要', tags: ['常用'] },
  { g: 'g_team', title: 'Linear', url: 'https://linear.app', desc: '迭代排期与缺陷跟踪', tags: ['内部'] },
  { g: 'g_team', title: 'Slack', url: 'https://app.slack.com', desc: '频道沟通与值班交接', tags: ['内部'] },
  { g: 'g_team', title: 'Figma 评论', url: 'https://www.figma.com/files', desc: '设计走查与批注收敛' },
  // 资讯阅读
  { g: 'g_read', title: 'Hacker News', url: 'https://news.ycombinator.com', desc: '技术社区热榜' },
  { g: 'g_read', title: '少数派', url: 'https://sspai.com', desc: '效率工具与数码评测', tags: ['常用'] },
  { g: 'g_read', title: 'V2EX', url: 'https://www.v2ex.com', desc: '开发者社区讨论' },
  { g: 'g_read', title: 'arXiv', url: 'https://arxiv.org', desc: '预印本检索' },
  // 个人服务
  { g: 'g_self', title: 'NAS 控制台', url: 'http://192.168.1.10:5000', desc: '本地存储与备份任务', tags: ['内部'], pinned: 1 },
  { g: 'g_self', title: '路由器', url: 'http://192.168.1.1', desc: '网络与 DHCP 管理', tags: ['内部'] },
  { g: 'g_self', title: '邮件', url: 'https://mail.example.com', desc: '工作邮箱' },
];

const tags = [
  { id: 't_fav', name: '常用', color: '#0071e3' },
  { id: 't_new', name: '新上线', color: '#34c759' },
  { id: 't_in', name: '内部', color: '#ff9f0a' },
  { id: 't_out', name: '外部', color: '#5e5ce6' },
  { id: 't_old', name: '待归档', color: '#8e8e93' },
];

const insertGroup = db.prepare(
  `INSERT INTO groups (id, name, description, icon, sort_order, collapsed, visibility, enabled, created_at, updated_at, parent_id)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
);
groups.forEach((g, i) =>
  insertGroup.run(g.id, g.name, null, g.icon, i, g.collapsed ?? 0, 'public', 1, now, now, g.parent ?? null),
);

const insertTag = db.prepare('INSERT INTO tags (id, name, name_key, color, created_at) VALUES (?,?,?,?,?)');
tags.forEach((t) => insertTag.run(t.id, t.name, t.name.toLowerCase(), t.color, now));

const insertItem = db.prepare(
  `INSERT INTO items (id, group_id, title, url, lan_url, description, icon_type, icon_ref, icon_asset_id, open_in_new_tab, pinned, sort_order, visibility, enabled, created_at, updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
);
const insertItemTag = db.prepare('INSERT INTO item_tags (item_id, tag_id) VALUES (?,?)');

const seen = new Map<string, number>();
items.forEach((it, i) => {
  const id = `i_${i.toString().padStart(3, '0')}`;
  const local = seen.get(it.g) ?? 0;
  seen.set(it.g, local + 1);
  insertItem.run(id, it.g, it.title, it.url, null, it.desc ?? null, 'text', null, null, 1, it.pinned ?? 0, local, 'public', 1, now, now);
  for (const name of it.tags ?? []) {
    const tag = tags.find((t) => t.name === name);
    if (tag) insertItemTag.run(id, tag.id);
  }
});

const insertSetting = db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)');
insertSetting.run(
  'site.meta',
  JSON.stringify({ version: 1, setupCompletedAt: now }),
  now,
);
insertSetting.run(
  'site.identity',
  JSON.stringify({ title: 'PureNav', logo: null, favicon: null, description: '团队内部导航' }),
  now,
);
insertSetting.run(
  'site.theme',
  JSON.stringify({ mode: 'auto', accent: '#5b8def', radius: 18, shadow: 'soft' }),
  now,
);
insertSetting.run(
  'site.layout',
  JSON.stringify({ density: 'comfortable', cardSize: 'lg', showDescription: true, defaultView: 'grid' }),
  now,
);

db.close();
console.log('seeded', target);
