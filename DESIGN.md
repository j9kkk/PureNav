---
version: alpha
name: PureNav
description: 无彩账簿式界面，色彩只落在数据上；功能层用液态玻璃，内容层用实色面。
colors:
  primary: "#1D1D1F"
  secondary: "#56565C"
  tertiary: "#0071E3"
  neutral: "#F5F5F7"
  surface: "#FFFFFF"
  surface-sunken: "#EBEBED"
  ink-muted: "#5C5C62"
  line: "#E3E3E8"
  rule: "#EEEEF0"
  control-line: "#C9C9CE"
  accent-fill: "#0071E3"
  accent-ink: "#0066CC"
  positive: "#1D7A3E"
  negative: "#D70015"
  glass-tint: "rgba(255, 255, 255, 0.46)"
  glass-tint-raised: "rgba(255, 255, 255, 0.62)"
  glass-rim: "rgba(255, 255, 255, 0.92)"
  glass-edge: "rgba(12, 18, 30, 0.07)"
typography:
  caption2:
    fontFamily: SF Pro Text
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.01em"
  caption:
    fontFamily: SF Pro Text
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "0.01em"
  secondary:
    fontFamily: SF Pro Text
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
  body:
    fontFamily: SF Pro Text
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  callout:
    fontFamily: SF Pro Text
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  heading:
    fontFamily: SF Pro Display
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  title:
    fontFamily: SF Pro Display
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
rounded:
  nested: 4px
  xs: 6px
  control: 8px
  inner: 12px
  card: 16px
  sheet: 20px
  pill: 9999px
spacing:
  hairline: 1px
  nudged: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
components:
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.card}"
    padding: 14px
  card-secondary:
    textColor: "{colors.secondary}"
    typography: "{typography.secondary}"
  button-primary:
    backgroundColor: "{colors.accent-fill}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    padding: 10px
    height: 36px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
    padding: 10px
    height: 36px
  tag-pill:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.pill}"
    height: 32px
  topbar-glass:
    backgroundColor: "{colors.glass-tint}"
    textColor: "{colors.primary}"
    rounded: "{rounded.card}"
  topbar-glass-raised:
    backgroundColor: "{colors.glass-tint-raised}"
    textColor: "{colors.primary}"
    rounded: "{rounded.card}"
  page:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
  divider:
    backgroundColor: "{colors.rule}"
    height: 1px
  card-caption:
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
  link:
    textColor: "{colors.accent-ink}"
    typography: "{typography.body}"
  status-positive:
    textColor: "{colors.positive}"
    typography: "{typography.caption}"
  status-negative:
    textColor: "{colors.negative}"
    typography: "{typography.caption}"
---

## Overview

PureNav 是一张自用的书签台：一天要扫几百个站点，所以界面本身必须“退场”。
视觉基调是**无彩账簿**——灰阶承担结构，颜色只出现在两处：站点图标/分组徽标（数据），
和主操作（蓝）。任何装饰性的彩色都在抢注意力，不做。

材质上分两层，来自 Apple HIG 与 WWDC25「Liquid Glass」：

- **功能层**（顶栏、搜索、分段筛选、弹层、后台侧栏）：液态玻璃。它会实时弯折背后的内容，
  边缘有一圈镜面高光，投影随滚动位置连续变化。
- **内容层**（站点卡片、表格行、表单）：实色面 + 发丝线 + 极淡投影。玻璃绝不叠在内容上。

这条分界是整个设计的地基：玻璃是“浮在内容之上的一层”，不是“内容的样式”。

**标识**：一条路线收成字母 P —— 竖笔是路径，碗口在回到竖笔前停住（开口 ≈1.6/32），
表示路还没走完。纯几何 SVG（无位图、不依赖字体），描边走 `currentColor`，
所以放在深/浅色、任何强调色底上都成立；30px 落地、20px 做 favicon 都不糊。
品牌图标底色用 `--accent-fill`，圆角取 8（control 档，按 30px 图标 ≈22% 的 Apple 比例）。

## Colors

灰阶不是随手取的，每一级都有明确职责：

- **Primary (#1D1D1F)**：标题、卡片标题、正文。对 #F5F5F7 的对比度 15.5:1。
- **Secondary (#56565C)**：域名、说明、时间戳（6.7:1）。**Ink-muted (#5C5C62)** 用于最弱一级（6.1:1）。
- **Tertiary (#0071E3 / 深色 #0A84FF)**：苹果蓝。只给主操作、焦点环、开关。
- **Neutral (#F5F5F7)** 是地面；**Surface (#FFFFFF)** 是卡片；**Surface-sunken (#EBEBED)** 是分段控件的槽。
- **Line (#E3E3E8) / Rule (#EEEEF0)** 是“耳语级”分隔，几乎看不见但让布局成立；
  **Control-line (#C9C9CE)** 是控件边界，比前两者实一档。

两个常被误用的颜色语义，定死：

- **染背景，不染字形。** 蓝色要出现时优先做填充（主按钮、选中指示块），文字永远是墨色或白。
- **数据色不外溢。** 图标的多彩属于站点自己，不参与界面配色；分组徽标同理。

深色模式不是“反色”，是另一套纸：地面 #000000、面 #1C1C1E、墨 #F5F5F7。
深色下蓝色要压深一档（#0A84FF 只用于指示，填充按钮用 #0A6FD8），否则白字对比度掉到 3.6:1。

## Typography

一条 7 级阶梯，全部来自系统字体（SF Pro Text/Display + PingFang SC），不引入网络字体。
字号一律走 `--fs-*` 令牌，CSS 里不允许出现字面值（图标字形尺寸除外）：

| 级别 | 字号 | 字重 | 用途 |
|---|---|---|---|
| caption2 | 11px | 500 | 徽标计数、快捷键、表格内极密标签（不进正文） |
| caption | 12px | 400 | 时间戳、辅助说明 |
| secondary | 13px | 400 | 域名、辅助说明 |
| body | 14px | 400 | 表单、正文 |
| callout | 15px | 500 | 卡片标题 |
| heading | 17px | 600 | 分组标题 |
| title | 22px | 700 | 页面标题 |

规则：字号只用这 7 档，不插值；行高 1.2–1.45（越小越紧）；大字号给负字距（−0.015~−0.02em），
小字号给正字距（+0.01em）。中文不假斜体，不做全大写。

## Layout

- **4px 基线 + 2px 子步**：布局间距只走 4 / 8 / 12 / 16 / 24 / 32；
  2px 只用于控件内部的紧凑步长（如胶囊内边距），1px 只用于发丝线与光学对中。
  3、5、7、9、13 这类奇数值一律视为“手调残留”，不允许出现在 padding / gap / margin 上。
- 卡片网格按可用宽度自适应：`minmax(220px, 1fr)`，间距 12px；窄屏降到 152px。
- 卡片内部：左图标 40px、间距 8px、内边距 16/14，最小高度 84px。
- 内容最大宽度随视口放宽（大屏不锁 1100px），左右留白 24px。
- 顶栏浮在内容之上，与视口顶边留 14px，不贴边、不做通栏。

## Elevation & Depth

- **实色层**：`--shadow-soft` 一级（1px 接触 + 14px 漫射）。卡片不加第二级。
- **浮层（玻璃）**：靠三样东西成立，而不是靠投影——
  1. **镜面描边**：1px 内描边，顶部最亮、向下衰减、底边回一点微光；
  2. **边缘折射**：圆角矩形距离场生成位移贴图，交给 `backdrop-filter` 弯折背景；
  3. **自投影**：贴顶时只有一层很淡的接触阴影，随滚动**连续**加深（0→1 的插值系数），
     不做“到点切换”的类切换，也不在栏下铺不透明遮罩——那会变成一条黑带。
- 玻璃的模糊半径要足够大（顶栏 ≥22px），让滚到它背后的文字化开；这比加遮罩有效且无接缝。
- **玻璃容器半径跟随站点令牌**：`--lg-r = --radius-card + 4px`（默认 20，落在 sheet 档），
  内部控件一律取 `--lg-r − --lg-pad`（默认 12，inner 档）。两处都必须是 6/8/12/16/20 之一，
  不允许出现 26px、18px、11px 这类“看着顺眼”的推导值。

## Shapes

- 半径六档：嵌套媒体 4、小元素 6、控件 8、浮层内部 12、卡片 16、弹层 20、胶囊 9999。
  全部走 `--radius-*` 令牌，CSS 里不允许出现字面值（`50%` 的圆形除外）。
- **同心圆角**：内元素半径 = 外半径 − 内边距。玻璃容器内边距 8px 时，内部控件用 16（24−8）。
  圆角不同心时，边角会出现“厚度不均”的错觉，这是最常见的廉价感来源。
- 发丝线永不与圆角冲突：分隔线只用 `--rule`，且不跨越圆角区域。

## Components

- **card**：白面（深色 #1C1C1E）+ 1px 线 + 发丝内高光。悬停时抬 1px、线加深、图标轻微放大；
  只有悬停/聚焦的那一张才会临时挂折射滤镜（1760 张卡片同时开滤镜会直接掉帧）。
- **button-primary**：蓝色填充 + 白字，8px 圆角，36px 高。一屏只允许一个。
- **button-secondary**：白面 + 墨字 + `--control-line` 描边，与主按钮同高同圆角。
- **tag-pill**：胶囊，32px 高；选中态用滑动指示块（不是逐个切换背景），位移 240ms 弹簧曲线。
- **topbar-glass**：玻璃材质，内部控件只用填充和活力色——**禁止在玻璃上再叠玻璃**。

## Do's and Don'ts

**Do**

- 先问“这是功能层还是内容层”，再决定用玻璃还是实色。
- 用 `--radius` 推导内层半径，保持同心。
- 让投影随滚动/交互**连续**变化。
- 深色下给蓝填充压深一档，保证白字 ≥4.5:1。
- 用模糊解决“背后的东西太乱”，而不是用遮罩压暗。

**Don't**

- 不要把玻璃铺在卡片、表格行、表单上。
- 不要玻璃叠玻璃（玻璃上的按钮、玻璃里的卡片）。
- 不要在玻璃下压一条不透明渐变——它一定会被看成投影或色带。
- 不要用蓝色做小号文字（浅色下 4.31:1，不到 AA）；要强调就加粗、或用填充。
- 不要引入第二套灰阶、第二套圆角或第二个蓝色。
- 不要用 `control-line` 之外的边框色给控件描边；也不要为了“更精致”把控件边框调到 3:1 以下再叠加填充对比——
  输入框边界低于 1.5:1 时，弱视用户在白面上分不出控件边界（已知取舍，见下）。

**半径与间距的落地约定**：`border-radius`、`font-size`、`padding/gap/margin` 三处
不接受字面值；新增值一律先加令牌再用，避免再次出现 8.5px 这类手调数字。

**已知取舍**：控件描边（#C9C9CE 对白 1.65:1）低于 WCAG 1.4.11 的 3:1。
苹果系统控件本身也是这个量级；把它提到 3:1 会让整页明显变“重”，
所以这里保持视觉优先，用填充差与圆角维持可辨识性。若要做无障碍强化版，
把 `--control-line` 调到 #8E8E93（3.2:1）即可整体达标。
