// 分组树的纯函数工具：构建、展开、拖拽移动与快照序列化。
import type { AdminGroupDto } from '../api';

export interface GroupNode {
  group: AdminGroupDto;
  children: GroupNode[];
  depth: number;
}

export type DropMode = 'into' | 'before' | 'after';

/** 由扁平分组列表构建树； parentId 悬空（父级被删/不可见）时按根处理。服务器已按全局 sort_order 排序，兄弟相对顺序得以保留。 */
export function buildGroupTree(groups: AdminGroupDto[]): GroupNode[] {
  const byId = new Map<string, GroupNode>();
  for (const group of groups) byId.set(group.id, { group, children: [], depth: 0 });

  const roots: GroupNode[] = [];
  for (const node of byId.values()) {
    const parent = node.group.parentId ? byId.get(node.group.parentId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  const assignDepth = (nodes: GroupNode[], depth: number) => {
    for (const node of nodes) {
      node.depth = depth;
      assignDepth(node.children, depth + 1);
    }
  };
  assignDepth(roots, 0);
  return roots;
}

/** DFS 展开可见节点（仅进入已展开的分支）。 */
export function flattenVisibleTree(roots: GroupNode[], expanded: Set<string>): GroupNode[] {
  const out: GroupNode[] = [];
  const walk = (nodes: GroupNode[]) => {
    for (const node of nodes) {
      out.push(node);
      if (expanded.has(node.group.id) && node.children.length > 0) walk(node.children);
    }
  };
  walk(roots);
  return out;
}

/** 树快照（DFS 前序），对应 PUT /admin/groups/order 的 nodes 载荷。 */
export function treeToSnapshot(nodes: GroupNode[], parentId: string | null = null): { id: string; parentId: string | null }[] {
  const out: { id: string; parentId: string | null }[] = [];
  for (const node of nodes) {
    out.push({ id: node.group.id, parentId });
    out.push(...treeToSnapshot(node.children, node.group.id));
  }
  return out;
}

/** 判断 candidateId 是否为 ancestorId 的子孙（或同一节点）。 */
export function isSameOrDescendant(groups: AdminGroupDto[], ancestorId: string, candidateId: string): boolean {
  const parentById = new Map(groups.map((group) => [group.id, group.parentId]));
  let cursor: string | null = candidateId;
  while (cursor) {
    if (cursor === ancestorId) return true;
    cursor = parentById.get(cursor) ?? null;
  }
  return false;
}

/**
 * 在扁平分组列表上执行一次拖拽移动，返回新的分组数组（已调整 parentId 与兄弟内 sort_order）。
 * - into: 追加到目标分组的子级末尾
 * - before / after: 与目标同级并插入其前/后
 * 非法移动（移入自己或自己的子孙）返回 null。
 */
export function applyGroupMove(
  groups: AdminGroupDto[],
  draggedId: string,
  targetId: string,
  mode: DropMode,
): AdminGroupDto[] | null {
  if (draggedId === targetId) return null;
  const dragged = groups.find((group) => group.id === draggedId);
  const target = groups.find((group) => group.id === targetId);
  if (!dragged || !target) return null;
  if (isSameOrDescendant(groups, draggedId, targetId)) return null;

  const nextParentId = mode === 'into' ? target.id : target.parentId;

  let nextSort: number;
  if (mode === 'into') {
    const children = groups.filter((group) => (group.parentId ?? null) === target.id && group.id !== draggedId);
    const maxSort = children.reduce((max, group) => Math.max(max, group.sortOrder), 0);
    nextSort = maxSort + 1024;
  } else {
    const siblings = groups
      .filter((group) => (group.parentId ?? null) === (target.parentId ?? null) && group.id !== draggedId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = siblings.findIndex((group) => group.id === targetId);
    if (mode === 'before') {
      const prev = idx > 0 ? siblings[idx - 1] : undefined;
      nextSort = ((prev?.sortOrder ?? target.sortOrder - 2048) + target.sortOrder) / 2;
    } else {
      const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined;
      nextSort = (target.sortOrder + (next?.sortOrder ?? target.sortOrder + 2048)) / 2;
    }
  }

  return groups
    .map((group) =>
      group.id === draggedId ? { ...group, parentId: nextParentId ?? null, sortOrder: nextSort } : group,
    )
    // 快照的 DFS 序 = 最终顺序：兄弟必须按新 sort_order 就位，否则重排是空操作
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
