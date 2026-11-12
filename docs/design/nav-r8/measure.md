# nav-r8 单页统一工作台 —— 逐区坐标表与帧↔组件映射

> 全部数值由浏览器实测（`getBoundingClientRect`，1440×900 画板内相对坐标，单位 CSS px）。
> 视觉稿：`unified-workspace.html`；稳定态截图：`frames/frame-1-visitor.png`、`frames/frame-2-editor.png`、`frames/frame-3-appearance.png`（均为 2x，2880×1800）。

## 1. 三区骨架（三帧共用，不含抽屉）

| 区域 | x | y | w | h | 说明 |
| --- | --- | --- | --- | --- | --- |
| 侧栏 `.nx-sidebar` | 1 | 1 | 248 | 898 | 固定，不随内容滚动 |
| 顶栏 `.nx-topbar` | 249 | 1 | 1190 | 52 | 高度锁定 52 |
| 内容区 `.nx-content` | 249 | 53 | 1190 | 814 | 唯一滚动容器，`padding: 20px 24px 40px` |
| 底栏 `.nx-statusbar` | 249 | 867 | 1190 | 32 | 高度锁定 32 |

## 2. 关键控件几何

| 控件 | 帧 | x | y | w | h |
| --- | --- | --- | --- | --- | --- |
| 登录主按钮 | ①访客态 | 1347 | 12 | 72 | 30 |
| 编辑开关 `.nx-edit-switch` | ②③ | 1375 | 15 | 44 | 24 |
| 置顶 Dock `.nx-dock` | ② | 273 | 73 | 1127 | 90 |
| 首张卡片 `.nx-card` | ② | 273 | 257 | 559 | 73 |
| 外观抽屉 `.nx-drawer` | ③ | 1079 | 53 | 360 | 814 |
| 抽屉遮罩 `.nx-drawer-backdrop` | ③ | 1 | 53 | 1078 | 814 |

## 3. 卡片内部栅格（列内必须零位移）

| 量 | 值 |
| --- | --- |
| 卡片内边距 | `12px 14px 12px 24px`（左侧 24px 是把手预留槽） |
| 图标盒 `.nx-mono-lg` | 30×30，左边缘距卡片左缘 **25px**（padding 24 + border 1） |
| 拖拽把手 `.nx-drag-handle` | `left:6px; width:12px; height:24px`，绝对定位，占 x 320–332 |
| 左列图标盒 x | **338**（13 张卡片全部一致） |
| 右列图标盒 x | **907**（全部一致） |

> 实测结论：把手是绝对定位、坐在预留槽内，不参与流式布局。视觉评审曾报「GitHub 卡片图标被把手推歪」，实测 13 张卡片图标盒左边缘完全一致（左列 338 / 右列 907），属评审误读，非缺陷。

## 4. 内容区纵向节奏

| 元素 | 高度 / 间距 |
| --- | --- |
| 内容区上下内边距 | 20 / 40 |
| 区块间距 `gap` | 14 |
| 卡片高度 | 73 |
| 末行卡片底 ↔ 内容区底 | -1 / -15（未被裁切，40px 底部内边距留白） |
| 内容区滚动余量 | 25–39px（即底部内边距，不产生内容裁切） |

## 5. 三种状态 ↔ DOM 契约

| 状态 | 根属性 | 显隐规则 |
| --- | --- | --- |
| 访客 | `.nx-app[data-auth="anon"]` | `.nx-edit-switch`、把手、`⋯`、树 `＋`、标签 `＋`、顶栏功能组全部 `display:none`；顶栏只留 `.nx-login-btn` |
| 登录 · 浏览 | `.nx-app[data-auth="admin"][data-edit="false"]` | 顶栏功能组可见，编辑控件仍隐藏（只有 `.nx-edit-switch` 为 off） |
| 登录 · 编辑 | `.nx-app[data-auth="admin"][data-edit="true"]` | 把手、`⋯`、树 `＋`/`⋯`、标签 `＋`、插入线全部出现 |

## 6. 帧 ↔ 组件映射

| 帧 | 画板 id | 对应实现组件 | 关键类名 |
| --- | --- | --- | --- |
| ① 访客态 | `#artboard-visitor` | `NavPage` + `renderSidebar` + `ItemCard`（只读分支） | `.nx-sidebar` `.nx-topbar` `.nx-login-btn` `.nx-card` `.nx-statusbar` |
| ② 登录 + 编辑态 | `#artboard-editor` | `NavPage` + `EditToolbar` + `ItemCard`（编辑分支）+ `GroupTree`（可编辑） | `.nx-edit-switch` `.nx-drag-handle` `.nx-drag-insert-line` `.nx-drag-dot` `.nx-insert-badge` `.nx-tree-drop` |
| ③ 外观抽屉 | `#artboard-drawer` | `AppearanceDrawer`（新）+ `NavPage`（背景不变） | `.nx-drawer` `.nx-drawer-backdrop` `.nx-seg-control` `.nx-seg-btn` `.nx-color-swatches` `.nx-color-dot` `.nx-drawer-footer` |

## 7. 验收记录

| 项 | 结果 |
| --- | --- |
| 三画板尺寸 | 1440×900 全部命中 |
| 水平溢出 | `scrollWidth - clientWidth = 0` × 3 |
| 末行卡片裁切 | 无（-1 ~ -15px，全在留白内） |
| 图标列对齐 | 左列 338 / 右列 907，13 张全一致 |
| Emoji | 正文无；`<title>` 已去 Emoji（浏览器标签残留为 file:// 缓存） |
