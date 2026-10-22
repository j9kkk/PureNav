import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 8092;
const CDP_PORT = 9229;
const DATA_DIR = path.resolve('./data-preview');
const WEB_DIST = path.resolve('./apps/web/dist');

// Clean up old preview data
if (fs.existsSync(DATA_DIR)) {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DATA_DIR, { recursive: true });

process.env.PORT = String(PORT);
process.env.HOST = '127.0.0.1';
process.env.PURE_DATA_DIR = DATA_DIR;
process.env.PURE_WEB_DIST = WEB_DIST;

console.log('Starting PureNav server on port', PORT);
const { buildApp } = await import('../apps/server/dist/app.js');
const app = await buildApp();
await app.listen({ host: '127.0.0.1', port: PORT });
console.log('PureNav server running at http://127.0.0.1:' + PORT);

// 1. Setup Admin user
console.log('Setting up admin account...');
const setupRes = await fetch(`http://127.0.0.1:${PORT}/api/v1/auth/setup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PORT}` },
  body: JSON.stringify({ username: 'admin', password: 'adminpassword123' }),
});
const setupCookies = setupRes.headers.get('set-cookie');
console.log('Setup response:', setupRes.status);

// Login to obtain admin session cookie
const loginRes = await fetch(`http://127.0.0.1:${PORT}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PORT}` },
  body: JSON.stringify({ username: 'admin', password: 'adminpassword123' }),
});
const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];
console.log('Login cookie obtained:', !!cookie);

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Origin: `http://127.0.0.1:${PORT}`,
    Cookie: cookie || '',
    ...options.headers,
  };
  const res = await fetch(`http://127.0.0.1:${PORT}/api/v1${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${path} (${res.status}): ${text}`);
  }
  return res.json();
}

console.log('Seeding groups and items...');

// Create Groups
const g1 = await api('/admin/groups', {
  method: 'POST',
  body: JSON.stringify({ name: '⚡ 常用协同与开发', description: '代码仓库、原型设计与团队协同工具', icon: '💻' }),
});
const g2 = await api('/admin/groups', {
  method: 'POST',
  body: JSON.stringify({ name: '🛠️ 基础设施与云原生', description: '容器编排、指标监控与云端网络服务', icon: '☁️' }),
});
const g3 = await api('/admin/groups', {
  method: 'POST',
  body: JSON.stringify({ name: '🤖 AI 与大模型应用', description: '智能对话助手、代码补全与开源模型生态', icon: '✨' }),
});

// Create Items
const items = [
  // G1
  {
    groupId: g1.id,
    title: 'GitHub',
    url: 'https://github.com',
    description: '全球领先的开源代码托管平台与开发者协作社区，提供 CI/CD 工作流。',
    icon: { type: 'iconify', ref: 'mdi:github' },
    pinned: true,
    tags: ['开发', '代码', 'Git'],
  },
  {
    groupId: g1.id,
    title: 'Figma',
    url: 'https://figma.com',
    description: '现代协作式界面设计工具，支持全团队实时白板与高保真原型交互。',
    icon: { type: 'iconify', ref: 'ph:figma-logo' },
    pinned: true,
    tags: ['设计', '原型'],
  },
  {
    groupId: g1.id,
    title: 'Notion',
    url: 'https://notion.so',
    description: '一站式团队知识库、结构化项目管理看板与灵活笔记中心。',
    icon: { type: 'iconify', ref: 'simple-icons:notion' },
    tags: ['协同', '文档', '知识库'],
  },
  {
    groupId: g1.id,
    title: 'Vercel',
    url: 'https://vercel.com',
    description: '专为前端开发者设计的云原生交付平台，支持秒级部署与边缘函数。',
    icon: { type: 'iconify', ref: 'simple-icons:vercel' },
    tags: ['开发', '部署', '云平台'],
  },
  // G2
  {
    groupId: g2.id,
    title: 'Grafana 看板',
    url: 'https://grafana.com',
    lanUrl: 'http://192.168.1.120:3000',
    description: '多源指标可视化、实时日志流与分布式分布式可观测大屏。',
    icon: { type: 'iconify', ref: 'simple-icons:grafana' },
    pinned: true,
    tags: ['监控', '运维', '看板'],
  },
  {
    groupId: g2.id,
    title: 'Portainer',
    url: 'https://portainer.io',
    lanUrl: 'http://192.168.1.120:9443',
    description: '轻量级容器管理面板，可视化编排 Docker 与 Kubernetes 集群。',
    icon: { type: 'iconify', ref: 'simple-icons:portainer' },
    tags: ['容器', 'Docker', '运维'],
  },
  {
    groupId: g2.id,
    title: 'Cloudflare',
    url: 'https://cloudflare.com',
    description: '全球高性能网络边缘 CDN 加速、智能 DNS 解析与 DDoS 高级防护。',
    icon: { type: 'iconify', ref: 'simple-icons:cloudflare' },
    tags: ['网络', 'CDN', '安全'],
  },
  // G3
  {
    groupId: g3.id,
    title: 'ChatGPT',
    url: 'https://chatgpt.com',
    description: 'OpenAI 旗舰级通用大模型对话与深度推理助手，支持多模态输入。',
    icon: { type: 'iconify', ref: 'simple-icons:openai' },
    pinned: true,
    tags: ['AI', '大模型', 'OpenAI'],
  },
  {
    groupId: g3.id,
    title: 'Claude',
    url: 'https://claude.ai',
    description: 'Anthropic 专注于长文本理解、复杂编程逻辑与安全架构设计的智能助手。',
    icon: { type: 'iconify', ref: 'ph:sparkle-bold' },
    pinned: true,
    tags: ['AI', '大模型', '代码'],
  },
  {
    groupId: g3.id,
    title: 'Hugging Face',
    url: 'https://huggingface.co',
    description: '全球最大的开源 AI 社区，汇聚数万模型权重、数据集与在线应用 Spaces。',
    icon: { type: 'iconify', ref: 'simple-icons:huggingface' },
    tags: ['AI', '开源', '模型'],
  },
];

for (const item of items) {
  await api('/admin/items', { method: 'POST', body: JSON.stringify(item) });
}
console.log('Seeded', items.length, 'items across 3 groups.');

// 2. Launch Edge in headless mode with remote debugging
const edgeProfile = '/tmp/edge-screenshot-profile';
if (fs.existsSync(edgeProfile)) {
  fs.rmSync(edgeProfile, { recursive: true, force: true });
}

console.log('Launching Microsoft Edge in headless debugging mode...');
const edgeProc = spawn('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1280,820',
  `--user-data-dir=${edgeProfile}`,
  'about:blank',
]);

// Wait for CDP to respond
let cdpInfo = null;
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    if (res.ok) {
      cdpInfo = await res.json();
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

if (!cdpInfo) {
  throw new Error('Failed to connect to Edge CDP endpoint');
}
console.log('CDP connected:', cdpInfo.Browser);

// Connect via WebSocket
class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.events = new Map();
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        } else if (msg.method) {
          const listeners = this.events.get(msg.method) || [];
          for (const l of listeners) l(msg.params);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  }
}

// Create a new target/tab
const newTabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?http://127.0.0.1:${PORT}`, {
  method: 'PUT',
});
const tabData = await newTabRes.json();
const client = new CdpClient(tabData.webSocketDebuggerUrl);
await client.init();

await client.send('Page.enable');
await client.send('Runtime.enable');
await client.send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 820,
  deviceScaleFactor: 2,
  mobile: false,
});

async function capture(filePath) {
  const result = await client.send('Page.captureScreenshot', { format: 'png' });
  const buffer = Buffer.from(result.data, 'base64');
  fs.writeFileSync(filePath, buffer);
  console.log('Captured', filePath, `(${buffer.length} bytes)`);
}

// 1. Wait for Home Page dark render
console.log('Waiting for homepage items to render...');
for (let i = 0; i < 40; i++) {
  const cardCount = await client.eval(`document.querySelectorAll('.item-card').length`);
  if (cardCount >= 8) {
    console.log(`Found ${cardCount} cards on page.`);
    break;
  }
  await new Promise((r) => setTimeout(r, 200));
}

// Ensure theme is dark
await client.eval(`
  document.documentElement.dataset.theme = 'dark';
  localStorage.setItem('pn.theme.override', 'dark');
`);
await new Promise((r) => setTimeout(r, 800));

await capture('docs/screenshots/preview-home-dark.png');

// 2. Switch to light mode
console.log('Switching to light mode...');
await client.eval(`
  document.documentElement.dataset.theme = 'light';
  localStorage.setItem('pn.theme.override', 'light');
`);
await new Promise((r) => setTimeout(r, 800));

await capture('docs/screenshots/preview-home-light.png');

// 3. Admin Page
console.log('Navigating to admin page...');
// Set cookie in browser context via Network or document.cookie
await client.send('Network.enable');
await client.send('Network.setCookie', {
  name: 'pn_session',
  value: cookie.replace('pn_session=', ''),
  domain: '127.0.0.1',
  path: '/',
});

await client.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/admin` });

console.log('Waiting for admin table rows to render...');
for (let i = 0; i < 40; i++) {
  const rowCount = await client.eval(`document.querySelectorAll('tbody tr').length`);
  if (rowCount >= 5) {
    console.log(`Found ${rowCount} table rows in admin console.`);
    break;
  }
  await new Promise((r) => setTimeout(r, 200));
}

// Set dark theme for admin console
await client.eval(`
  document.documentElement.dataset.theme = 'dark';
  localStorage.setItem('pn.theme.override', 'dark');
`);
await new Promise((r) => setTimeout(r, 800));

await capture('docs/screenshots/preview-admin.png');

console.log('All screenshots captured successfully!');

// Clean up
edgeProc.kill();
await app.close();
const { closeDb } = await import('../apps/server/dist/db/index.js');
closeDb();
if (fs.existsSync(DATA_DIR)) {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}
if (fs.existsSync(edgeProfile)) {
  fs.rmSync(edgeProfile, { recursive: true, force: true });
}
process.exit(0);
