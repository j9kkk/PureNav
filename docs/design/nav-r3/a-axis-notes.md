# PureNav 顶部导航栏重构「方案 A：定轴三栏」高保真设计与落地说明

本产物为 PureNav 顶部导航栏重构「方案 A：定轴三栏」的完整高保真原型交付包。所有数据均来自 Chrome (Chromium) 真实渲染及 `getBoundingClientRect()` 实测导出，已完成像素级视觉自查与代码级落地方案映射。

---

## 一、方案核心结构与定轴原理

方案 A 恪守 PureNav 的根本原则：**功能层用液态玻璃，内容层用实色面；灰阶承担结构，界面本身退场**。
保留「单条玻璃栏 + 下方独立分段筛选」的双层 Chrome 架构，彻底重构顶栏内部布局秩序与材质语法。

### 1. 三栏定轴机制（The Optical Axis Anchor）
- **左侧·品牌区（Brand Zone）**：
  - 固定宽 `256px` (`flex: 0 0 256px; width: 256px`)。
  - 仅容纳 30×30 品牌 Mark（圆角 8px）与品牌标题 "PureNav"（`--fs-heading` 17px/700）。
  - 若极端窄屏或标题过长，设置 `overflow: hidden; text-overflow: ellipsis;` 截断保护。
- **中间·搜索区（Search Zone）**：
  - 唯一的弹性撑满项：`flex: 1 1 0; min-width: 0;`。
  - 在 1440 视口下宽度达到 `624px`，弹性吸收基线中遗留的全部 30.1% 视觉真空。
  - 搜索框几何中心位于 `x = 720.0px`，相对于栏左缘 `x = 124.0px` 的偏移为 `596.0px`，占顶栏全宽 1192px 的 **50.00%**。搜索框精确锚定在整栏的光学与几何正中轴上！
- **右侧·动作区（Actions Zone）**：
  - 固定宽 `256px` (`flex: 0 0 256px; width: 256px`)，与品牌区严格对称。
  - 左侧靠齐与搜索框相接，内部间距为标准基线 `16px`（≤ 24px 严格达标）。
  - 按钮靠左排布，时钟推至最右侧末端，形成类似 macOS 状态栏的清晰层级。

---

## 二、逐条回应 AUDIT.md 缺陷清单

| 缺陷编号 | AUDIT.md 审查指出的原实现问题 | 方案 A 重构解法与设计实施 | 闭环验证结果 |
|---|---|---|---|
| **P0-1** | **中段真空（30.1%）**：`flex: 0 1 420px` 锁死搜索宽度，动作组 `flex: 1 1 0` 导致右侧空档 358.9px。 | 翻转弹性规则：动作区设为 `flex: 0 0 256px`，搜索区改为全栏唯一弹性项 `flex: 1 1 0`。搜索框自适应撑开至 624px，空档直接由 358.9px 压缩至 16px。 | 实测间距 = 16.0px；中心占比 = 50.0%。 |
| **P0-2** | **玻璃上叠玻璃**：`.icon-btn` 与时钟胶囊带有 `border + 82% 白底 + backdrop-filter: blur(24px)`，在玻璃栏上形成 3 块白瓷砖与 1 块药丸。 | 彻底取缔栏内子元素的 backdrop-filter 与白瓷砖底色。按钮改为纯矢量图标 + 仅 hover 展现 `--hover-fill`（5% 软灰）圆角微块。时钟完全脱离胶囊容器，降为纯文字。 | 实测 `stackedGlassViolationCount = 0`，违规数为 0。 |
| **P0-3** | **时钟侵占品牌区**：时钟作为 `.brand` 第三子元素挤占标题，且自成胶囊、带边框，抢走注意力且每分钟重绘。 | 将时钟移出品牌区，迁入动作区最右末端；去除底色、边框、投影与圆角，降级为 `--text-dim`（12px caption）与 `tabular-nums`，前面加 1px `--rule` 发丝线分隔。 | 品牌区纯粹，时钟回归最弱环境信息（whisper-level）。 |
| **P1-1** | **圆角与高度没有唯一节奏**：一行混排 30/28/40/34 四套高度与 8/9999/12 三套圆角。 | 统一节奏：所有可点交互控件高度锁定为 **36px**（栏高 = 8 + 36 + 8 = 52px）。内部控件圆角按同心公式严格收敛至 **12px**（`--lg-r 20 − --lg-pad 8`）。9999 圆角彻底驱逐出顶栏。 | `controlsHeightUniqueCount = 1`（唯有 36px）；栏内圆角 ∈ {6, 8, 12, 20}。 |
| **P1-2** | **快捷键提示重复**：placeholder 写「搜索站点或敲 /」，右侧又挂 `<kbd>/</kbd>` 键帽，重复占 40px 内边距。 | placeholder 精简为「搜索站点...」；仅在右侧保留极简无彩键帽 `<kbd>/</kbd>`（20px 高，圆角 6px）。无冗余文案。 | 单次提示，搜索内边距左右对称（36px）。 |
| **P1-3** | **图标语义混淆**：视图切换用汉堡三横线（易混淆为菜单），管理后台用滑块（易混淆为参数调节）。 | 视图切换换用标准的 **四宫格网格图标（Grid Icon）**；管理后台换用标准的 **齿轮图标（Settings/Gear Icon）**；主题保留月牙（Moon Icon）。三者视觉描边与大小完全对齐。 | 语义清晰零歧义，权重一致。 |
| **P2-1** | **两条 Chrome 形状割裂悬空**：顶栏 20 圆角矩形，标签条 9999 胶囊且仅占 24%，右缘悬空，间距靠负 margin 手调。 | 废除负 margin 手调，垂直距离走 4px 基线标准（实测间距 20px）；标签条左缘与顶栏左缘精确对齐（x = 124.0px）；每个标签增设数据计数徽标（caption2 11px），充实内容并使分段条具备扎实质感。 | 见下文「双层 Chrome 形状差异合规说明」。 |
| **P2-2** | **窄屏响应式割裂**：640px 断点强制 grid 换行导致搜索左缘不对齐。 | 640px 断点重构：取消 grid 换行，保持优雅单行结构；时钟静默折叠，品牌收缩为 30px 图标，搜索区弹性保留 336px，无溢出无换行。 | 640px 实测 `scrollWidth == innerWidth`，0 横向滚动。 |

---

## 三、实测坐标表（浏览器 `getBoundingClientRect()` 导出）

数据运行环境：1440×900 视口，Device Scale Factor = 2.0，页面渲染稳定态（CSS 动效 settle 后）。完整原始文件见 `a-axis-metrics.json`。

| 元素 | 选择器 | x (px) | y (px) | w (px) | h (px) | computed borderRadius | computed fontSize | 作用与形态 |
|---|---|---|---|---|---|---|---|---|
| **顶栏外壳** | `.topbar` | **124.0** | **16.0** | **1192.0** | **52.0** | `20px` (Sheet) | 14px | 单层液态玻璃容器，模糊 22px |
| **品牌区** | `.brand` | 136.0 | 27.0 | 256.0 | 30.0 | `0px` | 14px | 左侧定轴基座，固定宽度 |
| **品牌图标** | `.brand-mark` | 136.0 | 27.0 | 30.0 | 30.0 | `8px` (Control) | 14px | 苹果蓝 `#0071e3` 实色填充 |
| **搜索区** | `.search` | 408.0 | 24.0 | 624.0 | 36.0 | `0px` | 14px | 居中中轴，弹性撑满容器 |
| **搜索输入框** | `.search input` | 408.0 | 24.0 | 624.0 | **36.0** | **12px** (Inner) | 13px | 实色白面/深灰，同心圆角 12px |
| **视图切换按钮** | `.icon-btn:nth(1)` | 1048.0 | 24.0 | 36.0 | **36.0** | **12px** (Inner) | 13.3px | 四宫格图标，纯图标无底色 |
| **主题切换按钮** | `.icon-btn:nth(2)` | 1092.0 | 24.0 | 36.0 | **36.0** | **12px** (Inner) | 13.3px | 月牙图标，纯图标无底色 |
| **管理后台按钮** | `.icon-btn:nth(3)` | 1136.0 | 24.0 | 36.0 | **36.0** | **12px** (Inner) | 13.3px | 齿轮图标，纯图标无底色 |
| **状态时钟** | `.topbar-clock` | 1192.2 | 33.0 | 111.8 | 18.0 | `0px` (无容器) | 12px (Caption) | 纯文字排印，数字等宽 |
| **标签筛选条** | `.tag-filter-bar` | **124.0** | **88.0** | 333.7 | 36.0 | `9999px` (Pill) | 14px | 独立 Chrome，左缘与顶栏对齐 |

### 派生关键指标对比（基线 vs 方案 A）

| 派生指标项 | 基线（当前实现） | 方案 A（定轴三栏） | 审查要求标准 | 判定 |
|---|---|---|---|---|
| **搜索框右缘至首个动作控件间距** | 358.9 px (30.1% 空档) | **16.0 px** | ≤ 24 px | **完美达标** |
| **搜索框中心相对顶栏宽度的百分比** | 41.5% (左偏压迫感) | **50.0%** (精确中轴) | 45.0% – 55.0% | **完美达标** |
| **顶栏内可点控件高度档位数** | 4 档 (40 / 34 / 30 / 28) | **1 档 (严格唯一 36px)** | 必须唯一 (count === 1) | **完美达标** |
| **顶栏内 9999 胶囊圆角残留** | 存在（时钟为 9999 胶囊） | **0 处（彻底消除）** | 禁止 9999 出现在栏内 | **完美达标** |
| **玻璃叠玻璃违规数** | 4 处（3 按钮 + 1 时钟） | **0 处** | `stackedGlassViolationCount === 0` | **完美达标** |
| **640px 视口横向溢出** | 换行割裂，内边距错位 | **0 溢出（scrollWidth === innerWidth）** | document.scrollWidth <= innerWidth | **完美达标** |

---

## 四、双层 Chrome 形状差异的合规说明（为什么两层造型可以不同）

基线审查 P2-1 提出了「顶栏 20 圆角矩形 vs 标签条 9999 胶囊」的不一致。方案 A 明确主张**保留标签条的胶囊造型，但统一其空间逻辑与语法意义**：

1. **层级语义差异（Structural Chrome vs. Token Control）**：
   - **顶栏（Top Bar）** 是整个视口的宏观导航容器（Structural Chrome），属于 DESIGN.md 中的 `sheet` 档（20px 圆角）。它内部容纳了品牌、搜索输入框、图标动作按钮群、状态时间等异构组件，其本质是一个浮动的控制面板。
   - **标签条（Tag Filter Bar）** 在交互心理学上是**分段选择器（Segmented Control）**。在 Apple HIG 及现代桌面级界面中，分段控件的标准形态即为连续胶囊（Pill, 9999px）。胶囊形态能够强烈暗示「同质化、互斥单选模式」的微交互心智，绝不应将它强行改成矩形。
2. **对齐与间隙的秩序重塑**：
   - 基线之所以读作「一颗散落的药丸」，是因为缺少对齐锚点且使用了负 margin 手调（-14px）。
   - 方案 A 让标签条左边缘绝对对齐顶栏左边缘（`x = 124.0px`），垂直间距严格遵从 4px 韵律（`y_delta = 20px = 4px × 5`）。
   - 胶囊内增加数量徽标（`caption2: 11px`），形成坚实的内容块，与顶栏形成「主功能台（20px 面） + 附属筛选器（9999px 轨）」的主从呼应，秩序严整。

---

## 五、状态覆盖清单与截图索引

| 截图文件名 | 触发状态与测试条件 | 观察验证重点 |
|---|---|---|
| `a-axis-light-1440.png` | 1440×900 浅色默认态 | 中轴对称定轴效果、无白瓷砖纯图标、弱化纯文本时钟、标签条左对齐与徽标。 |
| `a-axis-focus-1440.png` | 搜索输入框获得焦点 (`.search input:focus`) | 苹果蓝焦点光晕（`0 0 0 3px color-mix(accent 18%)`），输入框实色层与玻璃材质的清爽边界。 |
| `a-axis-hover-1440.png` | 第一个图标按钮悬停态 (`.icon-btn.is-hover`) | 撤去瓷砖后，仅悬浮处出现 12px 圆角的 soft `--hover-fill`（5% 灰度填充），自然不突兀。 |
| `a-axis-dark-1440.png` | 深色主题态 (`data-theme="dark"`) | 纯黑 `#000000` 底色，玻璃层自适应微光高光与深色折射，文本与图标对比度舒适不刺眼。 |
| `a-axis-640.png` | 窄屏移动视口 (640×900) | 单行自适应，时钟静默折叠，品牌保留图标，搜索区弹性保持，完全无水平滚动条。 |

---

## 六、工程落地映射（代码改动指南）

针对 `apps/web/` 下的实际代码结构，方案 A 的落地映射极为精准，无需大规模重构组件，只需针对以下两处进行类名与样式调整：

### 1. JSX 结构调整：`apps/web/src/pages/NavPage.tsx`
原位置：行 694–734：
```tsx
// 改造前：时钟在 brand 内，图标为汉堡和滑块
// 改造后建议：
<div className="topbar-shell">
  <header className="topbar lg">
    {/* 1. 品牌区：纯粹品牌，截断保护 */}
    <div className="brand">
      <span className="brand-mark"><BrandMark /></span>
      <h1 className="brand-title">{config?.site.identity.title ?? 'PureNav'}</h1>
    </div>

    {/* 2. 搜索区：唯一 flex:1 项，文案去重 */}
    <div className="search" onClick={() => searchRef.current?.focus()}>
      <span className="search-icon"><IconSearch size={15} /></span>
      <input
        ref={searchRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索站点..."
        aria-label="搜索站点"
      />
      {!query && <kbd className="search-kbd">/</kbd>}
    </div>

    {/* 3. 动作区：固定宽，清晰语义图标，时钟弱化移至末端 */}
    <div className="topbar-actions">
      <button className="icon-btn" onClick={toggleView} aria-label="切换视图" title="切换视图">
        <IconGrid size={16} /> {/* 替换原 IconListRows / 汉堡 */}
      </button>
      <button className="icon-btn" onClick={toggleTheme} aria-label="切换主题" title="切换主题">
        {themeMode === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
      </button>
      <button className="icon-btn" onClick={authenticated ? onAdmin : onLogin} aria-label="管理后台" title="管理后台">
        <IconSettings size={16} /> {/* 替换原 IconSliders */}
      </button>
      <div className="action-sep" aria-hidden="true" />
      <span className="topbar-clock" title={clock.full}>
        <span className="topbar-clock-date">{clock.date}</span>
        <span className="topbar-clock-time">{clock.time}</span>
      </span>
    </div>
  </header>
</div>
```

### 2. 核心 CSS 调整：`apps/web/src/styles.css` & `glass.css`

```css
/* ---------- 顶栏定轴三栏 ---------- */
.topbar.lg {
  height: 52px;
  padding: 8px 12px;
  gap: 16px;
}

/* 品牌区 */
.brand {
  flex: 0 0 256px;
  width: 256px;
  min-width: 0;
}
.brand-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 搜索区：唯一弹性项，高度 36，圆角 12 */
.search {
  flex: 1 1 0;
  min-width: 0;
  height: 36px;
}
.search input {
  height: 36px;
  border-radius: calc(var(--lg-r) - var(--lg-pad)); /* 20 - 8 = 12px */
  padding: 0 36px 0 36px;
  border: 0;
  background: var(--bg-solid);
}

/* 动作区与按钮：撤销白瓷砖与二次模糊 */
.topbar-actions {
  flex: 0 0 256px;
  width: 256px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--radius-inner); /* 12px */
  background: transparent;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
.icon-btn:hover {
  background: var(--hover-fill);
}

/* 时钟纯文字化 */
.topbar-clock {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-caption);
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  background: transparent !important;
  border: none !important;
  backdrop-filter: none !important;
}
```

---

## 七、方案的取舍与潜在风险

1. **搜索框随屏幕弹性放宽的取舍**：
   - **取舍**：在大屏幕（如 1920 宽）下，由于 `flex: 1`，搜索输入框会伸展得更宽（约 1000px 左右）。
   - **评估与解法**：对于纯书签导航台，宽敞的搜索框是积极属性（输入拼音/网址/联想词时极具呼吸感）；若担心大屏过宽，可在媒体查询中限制 `max-width: 720px` 并保持 `margin: 0 auto` 居中。但在 1440 黄金桌面尺寸下，624px 的宽度黄金适中，完全消除中段真空。
2. **时钟置于末端的取舍**：
   - **取舍**：原时钟紧贴品牌标题，改造后移至最右侧。
   - **评估**：时钟由「视觉焦点」降为了「背景状态信息」，完全符合无彩账簿「界面退场、不干扰扫站点」的初衷，且自然呼应了 macOS 顶部菜单栏右侧常驻时间的心理模型。

---

## 八、一句话推荐理由

> **「定轴三栏以数学级的对称定距消解中段真空，让搜索框稳居光学中轴，在恪守无叠层玻璃与 4px 韵律的同时，交还桌面导航台应有的呼吸感与秩序。」**
