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

type G = { id: string; name: string; parent?: string; collapsed?: number };
const groups: G[] = [
  { id: 'g_dev', name: '开发与基础设施' },
  { id: 'g_docs', name: '文档与规范', parent: 'g_dev' },
  { id: 'g_apple', name: 'Apple 研发', parent: 'g_dev' },
  { id: 'g_self', name: '自建与内网服务' },
  { id: 'g_design', name: '设计与产品协作' },
  { id: 'g_tokens', name: '色彩与字体', parent: 'g_design' },
  { id: 'g_read', name: '技术阅读与社区' },
];

type I = {
  g: string;
  title: string;
  url: string;
  lanUrl?: string;
  desc: string;
  tags?: string[];
  pinned?: number;
  isInbox?: number;
  visits: number;
  httpStatus?: number | null;
  finalUrl?: string | null;
};

const items: I[] = [
  // 1. 开发与基础设施 (直属 6 条)
  { g: 'g_dev', title: 'GitHub', url: 'https://github.com', desc: '代码托管、Issue 追踪与 PR 评审', tags: ['常用'], pinned: 1, visits: 142 },
  { g: 'g_dev', title: 'Vercel', url: 'https://vercel.com', desc: '前端边缘部署与分支预览环境', tags: ['常用'], pinned: 1, visits: 89 },
  { g: 'g_dev', title: 'Cloudflare', url: 'https://dash.cloudflare.com', desc: '全球 DNS 解析、Zero Trust 隧道与缓存', tags: ['内部'], visits: 67 },
  { g: 'g_dev', title: 'Sentry', url: 'https://sentry.io', desc: '线上异常堆栈捕获与性能追踪', tags: ['内部'], visits: 45 },
  { g: 'g_dev', title: 'Docker Hub', url: 'https://hub.docker.com', desc: '容器基础镜像仓库与多架构分发', tags: ['外部'], visits: 38 },
  { g: 'g_dev', title: 'npm Registry', url: 'https://www.npmjs.com', desc: 'JavaScript 包检索与版本变更对比', tags: ['外部'], visits: 52 },

  // 1.1 开发与基础设施 / 文档与规范 (3 条)
  { g: 'g_docs', title: 'MDN Web Docs', url: 'https://developer.mozilla.org', desc: 'Web 标准、CSS 与 DOM API 权威参考', tags: ['常用'], pinned: 1, visits: 116 },
  { g: 'g_docs', title: 'React Docs', url: 'https://react.dev', desc: 'Hooks、并发渲染机制与组件模式指南', visits: 74, httpStatus: 301, finalUrl: 'https://react.dev/reference/react' },
  { g: 'g_docs', title: 'Vite', url: 'https://vite.dev', desc: '现代前端开发构建配置与插件生态', visits: 63 },

  // 1.2 开发与基础设施 / Apple 研发 (1 条)
  { g: 'g_apple', title: 'Apple Developer', url: 'https://developer.apple.com', desc: '证书签名、公证流水线与 HIG 人机界面规范', tags: ['常用'], visits: 29 },

  // 2. 自建与内网服务 (4 条，全部配双地址)
  { g: 'g_self', title: 'Synology NAS', url: 'https://nas.tdcode.tech', lanUrl: 'http://192.168.1.10:5000', desc: '存储池阵列、快照备份与容器编排', tags: ['内部'], pinned: 1, visits: 156 },
  { g: 'g_self', title: 'OpenWrt 路由网关', url: 'https://gw.tdcode.tech', lanUrl: 'http://192.168.1.1', desc: '主旁路由策略、DNS 分流与 DHCP 租约', tags: ['内部'], visits: 94 },
  { g: 'g_self', title: 'Gitea 私有代码库', url: 'https://git.tdcode.tech', lanUrl: 'http://192.168.1.10:3000', desc: '内网 Git 托管、CI Runner 与私有制品库', tags: ['内部'], visits: 81 },
  { g: 'g_self', title: 'Immich 家庭相册', url: 'https://photo.tdcode.tech', lanUrl: 'http://192.168.1.10:2283', desc: '手机原片自动备份、人脸聚类与时间线', tags: ['新上线', '内部'], visits: 42, httpStatus: 504 },

  // 3. 设计与产品协作 (直属 4 条)
  { g: 'g_design', title: 'Figma', url: 'https://www.figma.com', desc: '设计系统令牌、组件库与开发交付标注', tags: ['常用'], pinned: 1, visits: 128 },
  { g: 'g_design', title: 'Linear', url: 'https://linear.app', desc: '研发周期排期、需求拆分与缺陷闭环', tags: ['内部'], visits: 95 },
  { g: 'g_design', title: 'Notion', url: 'https://www.notion.so', desc: '产品规格文档、架构评审与团队知识库', tags: ['常用'], visits: 104 },
  { g: 'g_design', title: 'Iconify', url: 'https://icon-sets.iconify.design', desc: '开源矢量图标集统一检索与纯净 SVG 导出', tags: ['外部'], visits: 51 },

  // 3.1 设计与产品 / 色彩与字体 (2 条)
  { g: 'g_tokens', title: 'OKLCH Picker', url: 'https://oklch.com', desc: '感知均匀色彩空间调制与对比度计算', tags: ['新上线'], visits: 33 },
  { g: 'g_tokens', title: 'Fontshare', url: 'https://www.fontshare.com', desc: '免费商用几何与人文主义字体下载站', tags: ['外部'], visits: 27 },

  // 4. 技术阅读与社区 (4 条)
  { g: 'g_read', title: 'Hacker News', url: 'https://news.ycombinator.com', desc: '全球工程师一线技术讨论与硅谷动态', tags: ['常用'], pinned: 1, visits: 135 },
  { g: 'g_read', title: '少数派', url: 'https://sspai.com', desc: '数字工具深度评测与高效工作流实践', tags: ['常用'], visits: 88 },
  { g: 'g_read', title: 'arXiv CS', url: 'https://arxiv.org', desc: '人工智能、编程语言与系统方向预印本', tags: ['外部'], visits: 41 },
  { g: 'g_read', title: 'V2EX', url: 'https://www.v2ex.com', desc: '开发者技术节点讨论与独立开发分享', tags: ['外部'], visits: 76 },

  // 5. 待整理收件箱 (2 条)
  { g: 'g_dev', title: 'Vite Guide', url: 'https://vite.dev/', desc: '构建指南与插件钩子速查（待归档）', tags: ['待归档'], isInbox: 1, visits: 12 },
  { g: 'g_design', title: 'Excalidraw', url: 'https://excalidraw.com', desc: '轻量手绘风格白板草图与架构图即时协作', tags: ['待归档'], isInbox: 1, visits: 18 },
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
  insertGroup.run(g.id, g.name, null, null, (i + 1) * 1024, g.collapsed ?? 0, 'public', 1, now, now, g.parent ?? null),
);

const insertTag = db.prepare('INSERT INTO tags (id, name, name_key, color, created_at) VALUES (?,?,?,?,?)');
tags.forEach((t) => insertTag.run(t.id, t.name, t.name.toLowerCase(), t.color, now));

const insertItem = db.prepare(
  `INSERT INTO items (id, group_id, title, url, lan_url, description, icon_type, icon_ref, icon_asset_id,
                      open_in_new_tab, pinned, is_inbox, visit_count, last_visited_at, http_status, final_url, last_checked_at,
                      sort_order, visibility, enabled, created_at, updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
);
const insertItemTag = db.prepare('INSERT INTO item_tags (item_id, tag_id) VALUES (?,?)');

const seen = new Map<string, number>();
items.forEach((it, i) => {
  const id = `i_${i.toString().padStart(3, '0')}`;
  const local = seen.get(it.g) ?? 0;
  seen.set(it.g, local + 1);
  insertItem.run(
    id,
    it.g,
    it.title,
    it.url,
    it.lanUrl ?? null,
    it.desc ?? null,
    'text',
    null,
    null,
    1,
    it.pinned ?? 0,
    it.isInbox ?? 0,
    it.visits,
    now,
    it.httpStatus ?? 200,
    it.finalUrl ?? null,
    now,
    (local + 1) * 1024,
    'public',
    1,
    now,
    now,
  );
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
  JSON.stringify({ title: 'PureNav', logo: null, favicon: null, description: '全能自托管收藏夹管理器' }),
  now,
);
insertSetting.run(
  'site.theme',
  JSON.stringify({ mode: 'dark', accent: '#6366F1', radius: 8, shadow: 'soft' }),
  now,
);
insertSetting.run(
  'site.layout',
  JSON.stringify({ density: 'comfortable', cardSize: 'md', showDescription: true, defaultView: 'grid' }),
  now,
);

db.close();
console.log('seeded', target);
