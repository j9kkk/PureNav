# PureNav 视觉重构：G1「透镜玻璃·浅色」设计规范与实测报告

交付方案：**G1 透镜玻璃 · 浅色（Lens Glass Light）**  
基线承接：方案 A「定轴三栏」（已选定）  
原型件路径：`docs/design/nav-r4/g1-lens-light.html`  
实测数据：`docs/design/nav-r4/g1-metrics.json`  

---

## 一、透镜语言（Lens Glass）CSS 纯物理复刻

参考项目（GooseHyperGlass）经实测为纯 WebGL 画布组件，不仅体积臃肿（>340KB），且每个组件自带暗色/蓝紫壁纸场景、shadowRoot 内只有 canvas 无 DOM 文本、不可选中且无无障碍支持、画布按 1x 光栅化导致 Retina 细线与中文发虚。

本方案在保持 PureNav「无彩账簿 + 浅色纸」基调的前提下，**抛弃 WebGL 运行时，完全使用现代原生 CSS 盒模型与多层光学投影栈复刻透镜质感**：

### 1. 关键 CSS 实现片段

```css
/* G1 透镜玻璃核心令牌栈 */
:root {
  --lg-r: 20px;
  --lg-pad: 8px;
  --lg-fill: rgba(255, 255, 255, 0.48);

  /* ① 双缘高光：内缘顶边 1.5px 锐光 + 内缘底边 1px 凝聚折射 + 外缘 1px 物理厚度深线 */
  --lens-rim-inner-top: 0 1.5px 0 0 rgba(255, 255, 255, 0.95);
  --lens-rim-inner-bot: 0 -1px 0 0 rgba(255, 255, 255, 0.35);
  --lens-edge-outer: 0 0 0 1px rgba(12, 18, 30, 0.08);

  /* ② 折射环：内侧环形 1px 极淡折射光 */
  --lens-refract-ring: inset 0 0 0 1px rgba(255, 255, 255, 0.45);

  /* ③ 边缘棱镜色差：极克制蓝紫微分离（上沿偏蓝、下沿偏紫），不造成彩色描边脏感 */
  --lens-prism-chroma: inset 0 1px 2px 0 rgba(80, 110, 255, 0.16),
                       inset 0 -1px 2px 0 rgba(180, 80, 255, 0.10);

  /* ④ 体积暗腔与落地软影 */
  --lens-volume-shadow: inset 0 -12px 24px -16px rgba(12, 18, 30, 0.14);
  --lens-drop-shadow: 0 20px 48px -24px rgba(12, 18, 30, 0.22),
                      0 4px 12px -6px rgba(12, 18, 30, 0.08);
}

/* 顶栏透镜材质 */
.topbar {
  height: 52px;
  padding: 8px 12px;
  border-radius: var(--lg-r);
  
  /* 上部迎光面反射渐变，中部通透，下部微聚光 */
  background: linear-gradient(180deg,
    color-mix(in oklab, var(--lg-fill) 80%, #ffffff 20%) 0%,
    var(--lg-fill) 45%,
    color-mix(in oklab, var(--lg-fill) 92%, #000000 8%) 100%);
  
  /* 七层叠加透镜光学栈 */
  box-shadow:
    inset var(--lens-rim-inner-top),
    inset var(--lens-rim-inner-bot),
    var(--lens-edge-outer),
    var(--lens-refract-ring),
    var(--lens-prism-chroma),
    var(--lens-volume-shadow),
    var(--lens-drop-shadow);
    
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
}

/* 坚守不变量：栏内子元素严禁二次叠玻璃 */
.topbar * {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
```

### 2. 液滴语言（Droplet Elastic Motion）
- 展开搜索框不是突兀的 `display: none ↔ block` 切替，而是模拟液滴被拉出：
  - 宽度从 220px 经 `width`、`transform: scale()` 和 `box-shadow` 在 240ms 内使用 `--ease-spring: cubic-bezier(0.16, 1, 0.3, 1)` 平滑张开到 520px。
  - 触发器与展开层共享绝对定位起点，收起态平滑微缩淡出，展开层弹簧拉开，给用户连续的物理实体感。
- **内容层卡片守则**：遵照 `DESIGN.md`，卡片绝对不上玻璃，保持 `#ffffff`（暗色 `#1c1c1e`）实色面 + 1px 发丝描边 + 软阴影，严格贯彻「玻璃是功能层，内容是实色账簿」。

---

## 二、搜索收起/展开状态机与 a11y 规范

### 1. 状态转移图

```
                  [点击触发器 / 敲按 / / ⌘K]
 [收起·空查询态] ─────────────────────────────► [展开·输入态]
   (220px 胶囊)                                  (520px 弹簧拉伸)
        ▲                                               │
        │ [无文字按 Esc / 清空后 Esc]                     │
        ├───────────────────────────────────────────────┤
        │                                               │
        │ [有查询词时按 Esc / 失去焦点]                   │ [输入内容]
        ▼                                               ▼
 [收起·过滤态] ◄────────────────────────────── [展开·有词态]
(显式「筛选中:X ×」)   [按 Esc / 点击外部]           (带清空按钮)
```

### 2. a11y 无障碍与焦点管理
1. **触发器为真 button**：
   - 具备 `type="button"`、`aria-haspopup="dialog"`、`aria-expanded="false"`、`aria-controls="searchExpandLayer"`。
   - 宽度贴合内容（220px），绝不是 36px 纯图标，保留放大镜、中文「搜索站点」与右侧 `/` 键帽，保证极佳的可发现性。
2. **同一帧/下一微任务夺焦（Instant Focus）**：
   - 展开逻辑中挂载 `requestAnimationFrame(() => input.focus())`，确保键盘唤起后光标立即可键入，无丢字风险。
3. **Esc 焦点完美回退**：
   - 用户按 `Esc` 收起后，焦点自动通过 `trigger.focus()` 回归触发器，Tab 焦点流不迷失。
4. **有查询时收起的显式反馈（Anti-Trap）**：
   - 最易翻车的设计是收起后用户忘记页面正处于过滤状态。本方案在有查询收起时，触发器自动切换为 `.is-filtered` 状态，文案变为「筛选中: **关键词**」，并附带快捷清除按钮 `×`，点击可一键清除并重置视图。

---

## 三、逐条对应 AUDIT 缺陷

| AUDIT 缺陷编号 | 历史严重度 | AUDIT 记录现象 | G1 透镜玻璃重构方案修复措施 |
|---|---|---|---|
| **P0-1 中段真空** | P0 | flex 权重分配导致搜索右缘到图标留白 358.9px（占 30.1%），重心严重左偏 | 采用方案 A 定轴三栏，搜索区为唯一弹性项占据中轴；收起态定轴居左展现，展开态沿轴向右覆盖拉伸，完全消除割裂感 |
| **P0-2 玻璃上叠玻璃** | P0 | 图标按钮从 styles.css 继承白边框 + 82% 纯白底 + backdrop-filter，像三块白瓷砖浮在玻璃上 | 顶栏内所有子元素强制 `backdrop-filter: none !important`；图标按钮平时纯透明，仅 hover 时显软底 `rgba(0,0,0,0.05)` |
| **P0-3 时钟侵占品牌区** | P0 | 时钟紧挨 PureNav 标题并带边框与模糊背景，被误读为操作胶囊 | 时钟移入右侧动作区末端，剥离所有外框与背景，降为纯文字（12px `--text-dim`），不抢眼 |
| **P1-1 圆角与高度混乱** | P1 | 栏高 56，内部控件并存 28/30/34/40 四种高度与 8/12/9999 三种圆角 | 栏高收敛至唯一 **52px**；所有交互控件（收起触发器、展开搜索框、图标按钮）统一 **36px**；内圆角统一 **12px**（`20 - 8 = 12` 严格同心） |
| **P1-2 快捷键提示重复** | P1 | placeholder 写“搜索站点或敲 /”，右侧又放一个 `/` 键帽 | placeholder 简化为“搜索站点...”，快捷键单一保留右侧 6px 圆角键帽 |
| **P1-3 图标语义混乱** | P1 | 视图切换用汉堡三横线（易混淆为菜单），后台用滑块（易混淆为设置） | 视图切换换用 4 格网格图标（Grid），后台管理换用清晰齿轮图标（Gear） |
| **P2-1 Chrome 形状脱节** | P2 | 顶栏与标签条之间无对齐，药丸形状悬空 | 顶栏与标签条间距对齐至标准 12px，标签条同样应用透镜微调双缘微光，形成视觉统一族谱 |
| **P2-2 空态与窄屏割裂** | P2 | 640px 断点搜索框换行但内边距错位 | 640px 下折叠品牌标题，保留 30px 品牌图标，搜索展开时向左借位满宽覆盖，绝不垂直换行破坏栏高 |

---

## 四、真实实测坐标与断言表（Headless Chrome @2x 实测）

测试环境：1440×900 Viewport，dpr=2，CDP 注入真实设备度量。

| 测量项 | 收起态 (Collapsed) | 展开态 (Expanded) | 差值 / 断言 | 验收状态 |
|---|---|---|---|---|
| **栏高 `mainTopbar.height`** | 52.0px | 52.0px | 0.0px（绝对恒定） | **PASS** |
| **首个图标 `btnView.x`** | 1048.0px | 1048.0px | **`iconXShiftPx = 0.0px`** | **PASS** |
| **中间图标 `btnTheme.x`** | 1092.0px | 1092.0px | **`iconXShiftPx = 0.0px`** | **PASS** |
| **末尾图标 `btnAdmin.x`** | 1136.0px | 1136.0px | **`iconXShiftPx = 0.0px`** | **PASS** |
| **动作区按钮宽度/高度** | 36 × 36 px | 36 × 36 px | 0.0px | **PASS** |
| **搜索层宽度** | 220.0px | 520.0px | 膨胀 300px | **PASS** |
| **展开层右缘坐标** | 628.0px | 928.0px | 距图标 1048px 仍有 120px 空档（>=16px） | **PASS** |
| **展开后 `activeElement`** | — | `INPUT#searchInput` | 同一微任务自动夺焦 | **PASS** |
| **按 Esc 后 `activeElement`** | `BUTTON#searchTrigger` | — | 焦点平滑还原触发器 | **PASS** |
| **栏内圆角集合** | 容器 20px / 控件 12px / 键帽 6px | 全部 $\in \{4,6,8,12,16,20\}$ | **PASS** |
| **奇数间距检查** | 0 处奇数像素 | 全部为 4/8/12/16/24 偶数步长 | **PASS** |
| **640px 窄屏适配** | `scrollWidth: 640`, `innerWidth: 640` | `scrollWidth === innerWidth`（无溢出） | **PASS** |

---

## 五、工程落地映射（Production Roadmap）

从原型落到 `apps/web` 源代码的精确修改点：

### 1. `apps/web/src/pages/NavPage.tsx`
- **新增 State**：
  ```tsx
  const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  ```
- **焦点切换驱动**：
  ```tsx
  const handleExpandSearch = () => {
    setIsSearchExpanded(true);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  };

  const handleCollapseSearch = () => {
    setIsSearchExpanded(false);
    searchTriggerRef.current?.focus();
  };
  ```
- **快捷键绑定**：
  - 在已有的 `useEffect` 键盘监听中，捕获 `/` 或 `⌘K` 时调用 `handleExpandSearch()`；捕获 `Escape` 时调用 `handleCollapseSearch()`。
- **收起态过滤提示**：
  - 当 `searchQuery` 非空且 `!isSearchExpanded` 时，触发器渲染 `筛选中: ${searchQuery}` 以及清空按钮。

### 2. `apps/web/src/styles.css` & `glass.css`
- **变量替换**：将 `:root` 的 `--lg-fill`、`--lens-rim-inner-top`、`--lens-refract-ring` 等透镜变量迁入 `glass.css`。
- **撤除污染规则**：删除 `styles.css:486` 中 `.icon-btn` 的默认白色背景与独立 `backdrop-filter`，确保栏内严格单一材质。
- **动效令牌复用**：展开动画复用 `--dur-base`（240ms）与 `--ease-spring`，不增加新的魔法数字。

---

## 六、取舍与潜在风险

1. **覆盖式展开 vs 推挤式展开**：
   - 本方案采用**覆盖式展开（Overlay Expand）**。
   - *优势*：动作区按钮的物理坐标完全不动（`iconXShiftPx === 0`），杜绝了右侧按钮被挤压时的视觉闪烁与重新测量开销；
   - *取舍*：在屏幕极端狭窄（如 <500px）时，搜索层向右展开会遮蔽动作区图标。但搜索作为瞬态操作，完成键入或收起后即可见，属于标准系统级交互（如 iOS Spotlight）。
2. **边缘棱镜色差的克制度**：
   - 参考项目的 WebGL 实现带有明显的红蓝色彩发散，在深色文档站虽然炫目，但移植到浅色纸界面上极易显得“脏”或像 CSS 描边错位。本方案将棱镜偏移深度严格限制在 `0.5px - 1px`，透明度控制在 `0.10 - 0.16`，保证只在斜角光线下提供体积感，不破坏无彩基调。

---

## 七、一句话评价（值不值？）

> **极其超值**：它以零 WebGL 运行负担的纯 CSS 结构，兼得了“透镜高光”的物理质感与“收起搜索”带来的轻量呼吸感；不仅消除了基线 30% 的中段真空，还彻底守护住了动作区 0px 位移的几何尊严。
