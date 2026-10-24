import fs from 'node:fs';
import path from 'node:path';

const PORT = 8090;
const DATA_DIR = path.resolve('./data-local');
const WEB_DIST = path.resolve('./apps/web/dist');

// Initialize local data directory
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

process.env.PORT = String(PORT);
process.env.HOST = '0.0.0.0';
process.env.PURE_DATA_DIR = DATA_DIR;
process.env.PURE_WEB_DIST = WEB_DIST;

console.log('🚀 正在启动 PureNav 苹果设计规范实例 (端口: ' + PORT + ')...');
const { buildApp } = await import('../apps/server/dist/app.js');
const app = await buildApp();
await app.listen({ host: '0.0.0.0', port: PORT });
console.log(`✅ PureNav 实例已在 http://127.0.0.1:${PORT} 运行！`);

// 1. Setup Admin user if not setup
try {
  await fetch(`http://127.0.0.1:${PORT}/api/v1/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PORT}` },
    body: JSON.stringify({ username: 'admin', password: 'adminpassword123' }),
  });
} catch {
  // Already setup
}

// Login
const loginRes = await fetch(`http://127.0.0.1:${PORT}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PORT}` },
  body: JSON.stringify({ username: 'admin', password: 'adminpassword123' }),
});
const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];

async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Origin: `http://127.0.0.1:${PORT}`,
    Cookie: cookie || '',
    ...options.headers,
  };
  const res = await fetch(`http://127.0.0.1:${PORT}/api/v1${endpoint}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${endpoint} (${res.status}): ${text}`);
  }
  return res.json();
}

// Check existing groups
const existingGroups = await api('/admin/groups');
if (existingGroups.length === 0) {
  console.log('📦 正在填充精品示例数据...');

  // Group 1: 常用协同与开发
  const g1 = await api('/admin/groups', {
    method: 'POST',
    body: JSON.stringify({ name: '⚡ 常用协同与开发', description: '代码仓库、团队协同与高效设计工具', icon: '💻' }),
  });

  // Group 2: 云原生与家庭基础设施
  const g2 = await api('/admin/groups', {
    method: 'POST',
    body: JSON.stringify({ name: '🛠️ 云原生与家庭基建', description: '容器编排、监控大屏与云端网络服务', icon: '☁️' }),
  });

  // Group 3: AI 与大模型实验室
  const g3 = await api('/admin/groups', {
    method: 'POST',
    body: JSON.stringify({ name: '🤖 AI 与大模型实验室', description: '智能对话助手、代码生成与开源模型生态', icon: '✨' }),
  });

  // Group 4: 影音娱乐与流媒体
  const g4 = await api('/admin/groups', {
    method: 'POST',
    body: JSON.stringify({ name: '🍿 影音媒体与数字生活', description: '高品质流媒体音乐、视频社区与日常探索', icon: '🎬' }),
  });

  const sampleItems = [
    // G1
    {
      groupId: g1.id,
      title: 'GitHub',
      url: 'https://github.com',
      description: '全球领先的开源代码托管平台与开发者协作社区，提供强大的 CI/CD 工作流。',
      icon: { type: 'iconify', ref: 'mdi:github' },
      pinned: true,
      tags: ['开发', '代码', 'Git'],
    },
    {
      groupId: g1.id,
      title: 'Notion',
      url: 'https://notion.so',
      description: '一站式团队知识库、结构化项目管理与灵活多功能笔记中心。',
      icon: { type: 'iconify', ref: 'simple-icons:notion' },
      tags: ['协同', '文档', '知识库'],
    },
    {
      groupId: g1.id,
      title: 'Figma',
      url: 'https://figma.com',
      description: '现代协作式界面设计工具，支持实时白板头脑风暴与高保真原型交互。',
      icon: { type: 'iconify', ref: 'ph:figma-logo' },
      pinned: true,
      tags: ['设计', '原型'],
    },
    {
      groupId: g1.id,
      title: '咖啡云',
      url: 'https://xn--9kqp0mora.net',
      icon: { type: 'iconify', ref: 'ph:coffee' },
      tags: ['网络', '加速'],
    },
    {
      groupId: g1.id,
      title: 'Vercel',
      url: 'https://vercel.com',
      description: '专为前端开发者设计的云原生交付平台，支持秒级全量部署与边缘计算。',
      icon: { type: 'iconify', ref: 'simple-icons:vercel' },
      tags: ['开发', '部署', '云平台'],
    },

    // G2
    {
      groupId: g2.id,
      title: 'Grafana 看板',
      url: 'https://grafana.com',
      lanUrl: 'http://192.168.1.120:3000',
      description: '多源指标可视化、实时日志流与分布式服务可观测大屏。',
      icon: { type: 'iconify', ref: 'simple-icons:grafana' },
      pinned: true,
      tags: ['监控', '运维', '看板'],
    },
    {
      groupId: g2.id,
      title: 'Portainer',
      url: 'https://portainer.io',
      lanUrl: 'http://192.168.1.120:9443',
      description: '轻量级容器管理面板，可视化编排管理 Docker 与 Kubernetes 集群。',
      icon: { type: 'iconify', ref: 'simple-icons:portainer' },
      tags: ['容器', 'Docker', '运维'],
    },
    {
      groupId: g2.id,
      title: 'Cloudflare',
      url: 'https://cloudflare.com',
      description: '全球高性能网络边缘 CDN 加速、智能 DNS 解析与 DDoS 弹性防护。',
      icon: { type: 'iconify', ref: 'simple-icons:cloudflare' },
      tags: ['网络', 'CDN', '安全'],
    },
    {
      groupId: g2.id,
      title: 'Clash Verge',
      url: 'https://github.com/zzzgydi/clash-verge/releases/tag/v1.3.3',
      icon: { type: 'iconify', ref: 'ph:airplane-tilt' },
      tags: ['工具', '代理'],
      description: '基于 Tauri 框架打造的现代跨平台定制网络代理桌面客户端。',
    },

    // G3
    {
      groupId: g3.id,
      title: 'Claude',
      url: 'https://claude.ai',
      description: 'Anthropic 旗舰级通用大模型，具备极高智力的复杂推理与精准代码架构能力。',
      icon: { type: 'iconify', ref: 'simple-icons:anthropic' },
      pinned: true,
      tags: ['AI', 'LLM', '智能助手'],
    },
    {
      groupId: g3.id,
      title: 'ChatGPT',
      url: 'https://chatgpt.com',
      description: 'OpenAI 广受欢迎的多模态通用对话助手与深度推理模型。',
      icon: { type: 'iconify', ref: 'simple-icons:openai' },
      tags: ['AI', 'OpenAI'],
    },
    {
      groupId: g3.id,
      title: 'Hugging Face',
      url: 'https://huggingface.co',
      description: '全球最大的开源机器学习模型、数据集与开源 AI 应用托管平台。',
      icon: { type: 'iconify', ref: 'ph:smiley' },
      tags: ['AI', '开源', '模型'],
    },
    {
      groupId: g3.id,
      title: 'V2EX',
      url: 'https://v2ex.com',
      description: '创意工作者与技术极客探索交流的知名在线极客社区。',
      icon: { type: 'iconify', ref: 'ph:chat-circle-dots' },
      tags: ['极客', '社区'],
    },

    // G4
    {
      groupId: g4.id,
      title: 'YouTube',
      url: 'https://youtube.com',
      description: '全球最大的音视频创作与分享社区，汇聚世界各领域海量原创内容。',
      icon: { type: 'iconify', ref: 'simple-icons:youtube' },
      pinned: true,
      tags: ['视频', '流媒体'],
    },
    {
      groupId: g4.id,
      title: 'Bilibili',
      url: 'https://bilibili.com',
      description: '国内知名的年轻潮流文化交流社区与高活跃度高质量视频弹幕网站。',
      icon: { type: 'iconify', ref: 'simple-icons:bilibili' },
      tags: ['视频', '弹幕', '二次元'],
    },
    {
      groupId: g4.id,
      title: 'Spotify',
      url: 'https://spotify.com',
      description: '全球领先的流媒体音乐与个性化推荐播客音频服务平台。',
      icon: { type: 'iconify', ref: 'simple-icons:spotify' },
      tags: ['音乐', '流媒体', '播客'],
    },
  ];

  for (const item of sampleItems) {
    await api('/admin/items', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  console.log(`✨ 成功导入 4 个分组与 ${sampleItems.length} 个精选导航站点！`);
}

console.log('\n======================================================');
console.log(`🌐 实例地址: http://127.0.0.1:${PORT}`);
console.log(`🔑 管理后台: http://127.0.0.1:${PORT}/admin`);
console.log('   管理员账号: admin');
console.log('   管理员密码: adminpassword123');
console.log('======================================================\n');
