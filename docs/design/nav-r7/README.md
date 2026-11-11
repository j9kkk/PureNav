# PureNav r7 —— 全能自托管收藏夹管理器（Bookmark Manager）开发级设计规格说明书

> **入库留档说明**：本轮（`nav-r7`）为最终选定并落地的架构方案，入库保留 `BRIEF.md`、`README.md`、`bookmark-manager.html` 原型及关键状态与真实应用截图（`bm-all-dark.png`、`impl/impl-all-dark.png`、`impl/impl-all-light.png`、`impl/impl-folder-dev-dark.png`、`impl/impl-context-dark.png`、`impl/impl-capture-dark.png`、`impl/impl-doctor-dark.png`、`impl/impl-admin-items-dark.png`、`impl/impl-login-dark.png`、`impl/impl-640-dark.png`）；被否决的 `nav-r5` / `nav-r6` 门户探索轮次及其余中间状态帧保留在本地未入库。

## 1. 架构定位：从「启动页门户」到「全能收藏夹管理器」

### 1.1 为什么转向「A 方向：全能自托管收藏夹管理器」
在 r5 与 r6 轮次中，PureNav 探索了单页全量平铺的门户方案。然而，当真正承载用户成百上千条真实书签与多级文件夹时，单页平铺暴露了无法回避的问题：
1. **规模断层（Scale Collapse）**：成百上千条书签纵向无限平铺会导致页面滚不到底；仅含 1 条站点的叶级子分组（如 `Apple 研发`）在网格中独占一行，产生高达 70%+ 的右侧白洞。
2. **前后台割裂（Split Brain）**：修改书签标题、整理目录、删除死链必须跳转至 `/admin` 后台表格。真正的现代书签管理器（如 Chrome Bookmark Manager、Raindrop.io、Arc）必须做到**「浏览与原地管理合一」**。
3. **收录摩擦高（Capture Friction）**：传统手工新增需要填写多个字段，缺少**「输入 URL 自动抓取元数据 + 库内重复网址实时预警」**，缺少**「浏览器书签栏一键收录（Bookmarklet）」**。
4. **缺少全生命周期健康治理（Bookmark Doctor）**：历史书签容易沉淀重复 URL、301 永久重定向失效、内网局域网探测超时等问题，需要专门的健康巡检中心进行一键修复。

因此，PureNav r7 彻底定调为 **「全能自托管收藏夹管理器（A 方向）」**，构建前后台合一的**「三区一浮层」桌面级收藏夹工作台（App Shell）**。

---

## 2. 核心空间架构：「三区一浮层」桌面级工作台

整个系统运行于 `100vh` 固定视口，绝不产生整页滚动条：
- **左侧导航区（248px 固定宽，独立纵向滚动）**：
  - 品牌区域与醒目的 `+ 快速收录` 核心 CTA（快捷键 `N`）；
  - **智能视图（Smart Views）**：`全部书签 (24)`、`常用置顶 (6)`、`最近访问 (8)`、`待整理收件箱 (2)`、`书签体检 (3)`；
  - **多级文件夹树（Folder Tree）**：可折叠展开多层级目录（`开发与基础设施` 下含 `文档与规范 3`、`Apple 研发 1`；`自建与内网 4`；`设计与产品 6` 下含 `色彩与字体 2`；`技术阅读 4`），带新建文件夹按钮；
  - **标签筛选区（Tag Pills）**：`全部 24`、`常用 8`、`内部 8`、`外部 6`、`新上线 2`；
  - **底部状态区**：当前管理员账户 `admin`、明暗主题即时切换、管理后台快捷入口。
- **右侧主工作区（`flex: 1`，独立纵向滚动）**：
  - **顶栏 Header（52px 固定高）**：
    - 全局即席搜索框（`/` 或 `⌘K` 唤起，支持拼音缩写、标题、域名、IP、路径、标签匹配）；
    - 排序方式选择器（按访问频次降序 / 按标题升序 / 按添加时间倒序）；
    - 视图模式切换（双列高密度卡片 / 单列紧凑列表）；
    - 外部管理后台跳转通道 `管理后台 ↗`。
  - **主内容画布（`overflow-y: auto`）**：
    - 顶部 **常用置顶 Dock**（仅在 `全部` 视图常驻，6 个高频站点横向紧凑快捷槽，单卡 38px 高，0 滚动直达）；
    - 顶部 **面包屑导航** 与 **横向子文件夹入口卡（Subfolder Cards）**：`[📁 文档与规范 · 3 ›]`、`[📁 Apple 研发 · 1 ›]`；
    - 核心 **双列高密度书签行卡网格（Row Card Grid）**：单卡 68px 高，严格双列对齐，说明文字 100% 完整展示；
    - 专门的 **书签体检治理面板（Bookmark Doctor）**、**待整理收件箱（Inbox）** 与 **空库新手引导面板（Empty Onboarding）**。
  - **底部状态栏 Status Bar（32px 固定高）**：
    - 左侧统计：`共 24 条书签 · 4 个根文件夹 · 内网可达 3/4 · 体检发现 3 项`；
    - 右侧快捷键提示：`按 / 搜索 · 右键管理 · N 快速收录`。
- **浮层系统（Overlays）**：
  - **原地管理右键菜单（In-Place Context Menu）**：右键点击或点击卡片 `···` 呼出，包含打开、内网外网切换、置顶、移动到文件夹（展开二级子菜单）、编辑、复制网址、移入收件箱、删除全套 8 项操作；
  - **快速收录弹窗（Quick Capture Modal）**：居中浮层，包含自动解析元数据提示、琥珀色防重预警条、自动回填表单、底部可拖拽 Bookmarklet 药丸组件。

---

## 3. 核心功能点与界面区域对应表

| 功能模块 | 对应界面区域 / DOM 容器 | 核心交互逻辑与设计表现 |
| :--- | :--- | :--- |
| **快速收录 (Quick Capture)** | `.btn-quick-capture` / `#captureModalBackdrop` | 按 `N` 或点击按钮唤起居中弹窗；URL 输入框输入时触发自动抓取模拟；检测到重复域名弹出琥珀色防重预警条并提供一键合并；自动回填标题/描述/微章/目录/标签；底部带可拖拽 Bookmarklet 药丸。 |
| **智能视图导航** | `.sidebar .nav-list` (`#navAll`, `#navPinned`, etc.) | 聚合视图秒级过滤：全部、常用置顶、最近访问、待整理收件箱、书签体检；体检项带琥珀色数字徽标。 |
| **多级文件夹树** | `.folder-group` (`.tree-node-parent`, `.tree-children`) | 支持多级折叠展开；点击节点钻取至对应目录并联动顶部面包屑与子目录入口卡；空库时数字自动联动清零。 |
| **常用置顶 Dock** | `#pinnedDock` (`.pinned-dock-section`) | 仅在「全部书签」默认视图置顶展示 6 个核心高频站点；高度紧凑（38px），双字母微章 + 标题，0 滚动直达。 |
| **消灭子目录白洞** | `.subfolders-bar` (`.subfolder-card`) | 含子目录的父级文件夹顶部先渲染紧凑横向入口卡 `[文档与规范 3 ›]` 与 `[Apple 研发 1 ›]`；下方书签卡片全局双列流动排布，单条目子目录绝不独占一行产生右半屏白洞。 |
| **双列高密度书签行卡** | `.bookmark-cards-grid` (`.item-card`) | 第一行：Monogram 双字母徽标 + 标题 + 域名/IP + LAN/WAN 切换药丸 + 标签 + 访问频次 + 更多按钮；第二行：100% 完整站点说明（零省略号、零截断）+ 所属路径徽标。 |
| **原地管理右键菜单** | `#contextMenuPopover` (`.context-item`, `#ctxSubmenu`) | 右键或点击 `···` 原地弹出，带高亮边框和柔和阴影；支持 8 项完整管理动作；移动到文件夹项悬停向左展开完整层级二级子菜单。 |
| **书签健康体检** | `.doctor-container` (`.doctor-summary-card`, `.doctor-issue-card`) | 顶部健康分环与全库统计；下方展示重复收藏合并、301 重定向更新、内网超时回退 3 类真实卡片；点击操作按钮可即时修复、扣减计数并弹出 Toast。 |
| **空库双行动引导** | `.empty-state-card` | 空库状态下居中展示优雅虚线卡片；提供「导入浏览器书签 HTML」与「快速收录第一个网页」双行动按钮；侧栏与状态栏数据同步清零。 |
| **内网 / 外网一键切换** | `.lan-toggle-chip` | 具备 `lanUrl` 的站点卡片显示 `内网/外网` 药丸控件；点击阻止打开链接，原地切换当前访问线路与展示域名，并在 Toast 中反馈。 |

---

## 4. 逐帧 / 各状态核心组件实测坐标与度量表（1440×900 & 640×900）

以下数据基于 Microsoft Edge (Chromium 内核) 渲染管线于 2x 设备像素比下实测提取：

### 4.1 桌面端主工作台（1440×900，`?theme=dark&view=all`）
| 组件名称 | 选择器 | X (px) | Y (px) | 宽 (px) | 高 (px) | 圆角 (Border-Radius) | 字号 / 规范 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **左侧导航侧栏** | `.sidebar` | 0 | 0 | 248 | 900 | 0px | 13px (Base) |
| **顶栏搜索与操作条** | `.topbar` | 248 | 0 | 1192 | 52 | 0px | 13px |
| **底部固定状态栏** | `.statusbar` | 248 | 868 | 1192 | 32 | 0px | 11px |
| **常用置顶 Dock 容器** | `.pinned-dock-section` | 272 | 72 | 1129 | 90 | 8px | 13px |
| **常用置顶卡片 (单格)** | `.dock-card` | 287 | 111 | 177 | 38 | 6px | 12px (500) |
| **子文件夹导航卡** | `.subfolder-card` | 272 | 286 | 130 | 34 | 6px | 12px (500) |
| **双列书签行卡 (单格)** | `.item-card` | 272 | 336 | 560 | 68 | 8px | 标题 13px / 说明 12px |
| **书签 Monogram 徽章** | `.item-monogram` | 286 | 347 | 30 | 30 | 6px | 12px (600) |
| **右键原地菜单 (Popover)** | `#contextMenuPopover` | 956 | 380 | 220 | 268 | 8px | 12px |
| **移动到文件夹二级子菜单** | `#ctxSubmenu` | 782 | 472 | 170 | 226 | 8px | 12px |

### 4.2 快速收录弹窗（1440×900，`?modal=capture`）
| 组件名称 | 选择器 | X (px) | Y (px) | 宽 (px) | 高 (px) | 圆角 | 关键规范 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **居中收录对话框** | `#captureDialog` | 450 | 97 | 540 | 705 | 8px | 阴影 `0 20px 40px rgba(0,0,0,0.5)` |
| **琥珀色重复预警条** | `#captureDupWarning` | 471 | 249 | 498 | 86 | 6px | 琥珀底 `rgba(245,158,11,0.14)` |
| **Bookmarklet 拖拽区** | `.bookmarklet-zone` | 471 | 670 | 498 | 53 | 6px | 虚线边框，可拖拽药丸 |

### 4.3 书签体检中心（1440×900，`?view=doctor`）
| 组件名称 | 选择器 | X (px) | Y (px) | 宽 (px) | 高 (px) | 圆角 | 关键规范 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **体检概览统计卡** | `.doctor-summary-card` | 272 | 72 | 1144 | 78 | 8px | 内置健康分圆环与重新扫描按钮 |
| **健康评分圆环徽标** | `.doctor-score-circle` | 293 | 89 | 44 | 44 | 50% | 16px 粗体 / 88分 |
| **单条治理条目卡片** | `.doctor-issue-card` | 272 | 166 | 1144 | 70 | 8px | 内置操作按钮与代码化 URL |

### 4.4 移动端响应式窄屏（640×900，`?theme=dark`）
| 维度 / 组件 | 响应式规则 | 实测表现 | 验收结论 |
| :--- | :--- | :--- | :--- |
| **侧栏抽屉化** | `left: -248px`，通过顶栏汉堡按钮唤起 | 默认收起至视口外，点击汉堡菜单平滑弹出 | 零遮挡，零空间挤压 |
| **置顶 Dock 自适应** | 从 6 列横排重排为 `repeat(3, minmax(0, 1fr))` | 变为 3 列 × 2 行整齐矩阵，单卡高度不变 | 完整展示，零换行错位 |
| **书签卡片单列化** | `grid-template-columns: minmax(0, 1fr) !important` | 双列自适应变为单列流式，单卡宽度扩至 608px | 标题/说明文字无截断 |
| **横向越界** | `document.documentElement.scrollWidth` | 实测 `640px` 等于 `window.innerWidth (640px)` | **零横向滚动条** |

---

## 5. 状态机与 URL 查询参数映射表

`docs/design/nav-r7/bookmark-manager.html` 原型在初始化时通过标准 `URLSearchParams` 解析状态，并由 `AppState` 控制器统一响应与双向同步：

| URL 参数模式 | 视图模式 / 模态框状态 | 内部状态字段 (`AppState`) | 对应截图文件名 |
| :--- | :--- | :--- | :--- |
| `?theme=dark&view=all` | 全部书签暗色工作台 | `{ theme: 'dark', view: 'all' }` | `bm-all-dark.png` |
| `?theme=light&view=all` | 全部书签浅色工作台 | `{ theme: 'light', view: 'all' }` | `bm-all-light.png` |
| `?theme=dark&view=folder&folder=dev` | 开发与基础设施钻取视图 | `{ theme: 'dark', view: 'folder', folder: 'dev' }` | `bm-folder-dev-dark.png` |
| `?theme=dark&modal=context&target=synology&submenu=true` | Synology NAS 呼出右键菜单与二级目录 | `{ theme: 'dark', modal: 'context', contextTargetId: 'synology', showSubmenu: true }` | `bm-context-dark.png` |
| `?theme=dark&modal=capture` | 快速收录弹窗与重复预警 | `{ theme: 'dark', modal: 'capture' }` | `bm-capture-dark.png` |
| `?theme=dark&view=doctor` | 收藏夹健康体检治理面板 | `{ theme: 'dark', view: 'doctor' }` | `bm-doctor-dark.png` |
| `?theme=dark&state=empty` | 空库初始化双行动引导态 | `{ theme: 'dark', state: 'empty' }` | `bm-empty-dark.png` |
| `?theme=dark` (视口 640×900) | 移动端响应式单列窄屏态 | `{ theme: 'dark' }` (窄屏媒体查询生效) | `bm-640-dark.png` |
| `?q=<关键词>` | 全文即席检索状态 | `{ searchQuery: '<关键词>' }` | 站内过滤，若无结果展示 4 引擎兜底 |
| `?view=inbox` | 待整理收件箱视图 | `{ view: 'inbox' }` | 呈现 2 条暂存待整理书签 |

---

## 6. 硬性红线自动化实测验收记录

全部 8 张状态截图均在本地启动真实 HTTP 服务下，通过 Node.js 原生 WebSocket + Microsoft Edge CDP (Edg 157.0.4341.42) 进行 2x Retina 高清捕获与 DOM 几何断言测试，所有指标 100% 达标：

```
--- Starting 8-Shot Verification & Capturing ---
[bm-all-dark.png] 全部书签 (暗色):
  Emoji: PASS (0 emoji)
  Horizontal overflow: PASS (scrollWidth: 1440 <= innerWidth: 1440)
  Truncation (truncCount): PASS (0)
  Contrast (lowContrastCount): PASS (0)
  -> Saved bm-all-dark.png (509.5 KB)

[bm-all-light.png] 全部书签 (浅色):
  Emoji: PASS (0 emoji)
  Horizontal overflow: PASS (scrollWidth: 1440 <= innerWidth: 1440)
  Truncation (truncCount): PASS (0)
  Contrast (lowContrastCount): PASS (0)
  -> Saved bm-all-light.png (511.0 KB)

[bm-folder-dev-dark.png] 开发与基础设施钻取目录 (暗色):
  Emoji: PASS (0 emoji)
  Horizontal overflow: PASS (scrollWidth: 1440 <= innerWidth: 1440)
  Truncation (truncCount): PASS (0)
  Contrast (lowContrastCount): PASS (0)
  -> Saved bm-folder-dev-dark.png (406.5 KB)

[bm-context-dark.png] 右键原地管理菜单 (暗色):
  Emoji: PASS (0 emoji)
  Horizontal overflow: PASS (scrollWidth: 1440 <= innerWidth: 1440)
  Truncation (truncCount): PASS (0)
  Contrast (lowContrastCount): PASS (0)
  -> Saved bm-context-dark.png (625.8 KB)

[bm-capture-dark.png] 快速收录 Quick Capture (暗色):
  Emoji: PASS (0 emoji)
  Horizontal overflow: PASS (scrollWidth: 1440 <= innerWidth: 1440)
  Truncation (truncCount): PASS (0)
  Contrast (lowContrastCount): PASS (0)
  -> Saved bm-capture-dark.png (621.9 KB)

[bm-doctor-dark.png] 书签体检健康治理面板 (暗色):
  Emoji: PASS (0 emoji)
  Horizontal overflow: PASS (scrollWidth: 1440 <= innerWidth: 1440)
  Truncation (truncCount): PASS (0)
  Contrast (lowContrastCount): PASS (0)
  -> Saved bm-doctor-dark.png (325.6 KB)

[bm-empty-dark.png] 空库引导状态 (暗色):
  Emoji: PASS (0 emoji)
  Horizontal overflow: PASS (scrollWidth: 1440 <= innerWidth: 1440)
  Truncation (truncCount): PASS (0)
  Contrast (lowContrastCount): PASS (0)
  -> Saved bm-empty-dark.png (219.5 KB)

[bm-640-dark.png] 移动端响应式窄屏 (暗色):
  Emoji: PASS (0 emoji)
  Horizontal overflow: PASS (scrollWidth: 640 <= innerWidth: 640)
  Truncation (truncCount): PASS (0)
  Contrast (lowContrastCount): PASS (0)
  -> Saved bm-640-dark.png (275.5 KB)

ALL CHECKS PASSED PERFECTLY! (Exit code: 0)
```

### 6.1 核心红线达标汇总
1. **零 Emoji（Zero-Emoji Rule）**：
   - 检验断言：`/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u.test(document.body.innerText)` 恒为 `false`。
   - 实现：全页面所有智能视图、文件夹树、置顶图钉、搜索放大镜、健康听诊器、右键操作图标等全部手写精炼的 `1.5px` 描边线性 SVG，无任何外部字体库或 Emoji。
2. **零外部网络请求（Zero-External-Request）**：
   - 站点图标一律采用规整的 Monogram 几何双字母微章（如 GH, VC, SY, AP 等）；
   - 彻底杜绝 Google Fonts、Iconify CDN 或任何第三方外部 Favicon API。
3. **零文本截断（`truncCount === 0`）**：
   - 卡片说明文字设置 `white-space: normal; overflow: visible;`；
   - 在 1440 宽下，右侧工作区 1192px，双列行卡单列宽 560px，正文文字区宽达 480px，24 条真实站点的完整说明文字 100% 完整展现，无任何 `...` 截断。
4. **WCAG AA 高对比度（`lowContrastCount === 0`）**：
   - 暗色模式：主文本 `#F1F5F9`（对比度 16:1），次要文字与说明 `#94A3B8`（对比度 6.5:1 > 4.6:1），内网在线绿 `#34D399`（对比度 8.1:1）；
   - 浅色模式：主文本 `#0F172A`（对比度 16:1），次要文字与说明 `#475569`（对比度 7.2:1 > 4.6:1），内网在线绿 `#047857`（对比度 6.8:1）。
5. **圆角与字号规范纪律**：
   - 圆角严格限定为两档：`6px`（按钮、标签胶囊、键帽、徽章）与 `8px`（卡片、菜单、弹窗）；
   - 字号严格限定为 6 档：`11px`（微标/快捷键）、`12px`（说明/域名）、`13px`（侧栏/按钮/输入）、`14px`（标题/卡片名）、`16px`（分组头/弹窗头）、`20px`（体检分/品牌）。

---

## 7. 交付文件清单

全部成果位于 `/Users/joker/Desktop/work/PureNav/docs/design/nav-r7/`：

1. **高保真可交互原型单文件**：
   - [`bookmark-manager.html`](./bookmark-manager.html)（零外部依赖，单文件自包含 HTML/CSS/JS）
2. **开发级设计规格说明文档**：
   - [`README.md`](./README.md)（本文件）
3. **8 张 2x Retina 高清实测全景截图**：
   - `bm-all-dark.png`：默认暗色「全部书签」主工作台视图（含左侧树、顶部置顶 Dock、子目录卡、双列行卡、底栏）
   - `bm-all-light.png`：浅色高对比度主题对照主工作台视图
   - `bm-folder-dev-dark.png`：钻取进入「开发与基础设施」文件夹（面包屑 + 子目录导航卡 + 双列书签，消灭 Apple 研发白洞）
   - `bm-context-dark.png`：Synology NAS 原地呼出右键原地管理菜单（含内网切换、置顶、展开向左二级子菜单等 8 项）
   - `bm-capture-dark.png`：快速收录弹窗（URL 自动抓取成功 + 琥珀色重复域名预警条 + 自动回填 + Bookmarklet 拖拽区）
   - `bm-doctor-dark.png`：书签体检健康治理面板（全库统计 + 3 项真实治理卡片：重复合并、301 重定向、内网超时回退）
   - `bm-empty-dark.png`：空库初始化双行动引导视图（导入 HTML 书签 + 快速收录首个网页，侧栏与状态栏数据同步清零）
   - `bm-640-dark.png`：640×900 移动端响应式窄屏（抽屉收起、置顶 Dock 换行、单列流动卡片、零水平滚动溢出）

---

## 8. 实现落地（v0.10.0）

原型已 1:1 落进仓库，不再是静态稿。实现截图见 [`impl/`](./impl/)（`impl-*.png`）。

### 8.1 原型 → 代码映射

| 原型区域 | 实现文件 | 关键实现点 |
| --- | --- | --- |
| `.sidebar`（248px 树） | `NavPage.tsx` `renderTree` / `nav-workspace.css` `.nx-sidebar` | 智能视图 5 项 + 递归树（有子节点默认展开）+ 标签筛选 + 底部用户区 |
| `.topbar`（52px） | `NavPage.tsx` 顶栏 JSX | 搜索（`/`、`⌘K`）、排序下拉、双列/单列切换、管理后台入口 |
| `.pinned-dock-section` | `.nx-dock` / `.nx-dock-card` | 置顶项横排，右键同样可管理 |
| `.subfolder-card` | `.nx-subfolder-card` | 父目录视图顶部子目录药丸，数量后缀 `N ›`，同时是拖拽落点 |
| `.item-card` | `ItemCard` / `.nx-card` | 微章 `monogram()`（首词前两字素）+ 标题 + 等宽域名 + 内外网胶囊 + 标签 + 访问数 + `···`；次行描述 + 右下路径 |
| `.statusbar`（32px） | `.nx-statusbar` | 真实统计：`共 X 条书签 · 置顶 Y · 待整理 Z · 体检发现 W 项` |
| 右键菜单 + 二级移动 | `.nx-ctx` | 8 项动作，二级子菜单渲染所有文件夹，窗口右缘自动翻转 |
| 快速收录弹窗 | `.nx-dialog` | 粘 URL → `inspect-url` → 回填标题/描述/图标；重复命中显示琥珀预警 + 一键合并；Bookmarklet 药丸（原生 DOM `setAttribute('href', ...)` 绕过 React 19 `javascript:` 拦截，支持 `/?capture=1` 回跳自动唤起） |
| 体检中心 | `renderDoctor` / `.nx-doctor-*` | 健康分环、三类问题清单、逐条修复与重新扫描 |
| 登录与管理后台收敛 | `LoginPage.tsx` / `AdminPage.tsx` / `SettingsPage.tsx` / `AccountPage.tsx` / `BookmarkImportModal.tsx` | 全站统一迁移到 `.nx-app` 三区工作台 Shell（248px 侧栏 + 52px 顶栏 + 32px 底栏）与 `.nx-*` 实色令牌体系，撤除旧版 `AmbientField` 与 `data-lg="lens"` |
| 窄屏离线抽屉 | `@media (max-width: 900px)` | 侧栏 `fixed` + `transform` 离屏，顶栏出现菜单按钮 |

### 8.2 实测验收（1440×900 与 640×900，DPR 2）

```
1440×900  viewport [1440,900]  scrollWidth 1440  → 零水平溢出
  .nx-sidebar   [0,0,248,900]      .nx-topbar   [248,0,1192,52]
  .nx-dock      [272,72,1129,90]   .nx-card     [272,286,560,68]
  .nx-statusbar [248,868,1192,32]
  卡片 26 / 分组 4 / 置顶 Dock 6 / 智能视图 9 / 标签 5，正文零 Emoji
640×900   viewport [640,900]   scrollWidth 640   → 零水平溢出
  侧栏 position:fixed（离屏抽屉）  顶栏菜单按钮 display:grid  卡片宽 593
```

功能链路实测（演示库 `/tmp/pn-demo`，`scripts/seed-demo.ts` 生成）：

- **快速收录**：注入 `https://vite.dev/` → 抓回标题与描述，弹出「库内已存在相同网址的书签「Vite」（位于：开发与基础设施 / 文档与规范）」+ 合并按钮，合并后弹窗关闭、Toast 提示、卡片数与状态栏同步更新。
- **拖拽归档**：把 `Sentry` 卡片拖到侧栏 `Apple 研发` → 落点高亮 → 移动成功，树内计数 1→2，卡片右下路径变为 `Apple 研发`。
- **右键菜单**：卡片上 `contextmenu` → 菜单完整可见、不被右缘裁切，二级「移动到文件夹」列出全部目录。
- **体检中心**：健康分 88，重复 2 / 301 重定向 1 / HTTP 504 1 三类问题，`重新扫描全库` 走 `doctor/scan`（150 条 / 6 并发）。
- **空态**：清库后显示「收藏夹空空如也」双行动引导，卡片在内容区垂直居中。

### 8.3 复现方式

```bash
npm run build
node --import tsx scripts/seed-demo.ts /tmp/pn-demo      # 24 条站点 + 多级目录 + 热度/收件箱/体检数据
cd apps/server && PURE_DATA_DIR=/tmp/pn-demo \
  PURE_WEB_DIST=$(cd ../.. && pwd)/apps/web/dist PORT=8092 node dist/index.js
# 打开 http://127.0.0.1:8092/ ，管理员 admin / purenav-demo
```

> `PURE_WEB_DIST` 必须是绝对路径，相对路径会让静态托管 404。
