import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AdminGroupDto } from '../api';
import { buildGroupTree, type DropMode, type GroupNode } from '../lib/groupTree';
import { IconChevronRight, IconFolder, IconGrip } from './icons';

interface MenuState {
  group: AdminGroupDto;
  anchor: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  isContext?: boolean;
}

function calculateMenuStyle(anchor: MenuState['anchor'], isContext?: boolean): React.CSSProperties {
  const menuWidth = 136;
  const estimatedHeight = 112;
  const gap = 4;
  const padding = 8;

  let left: number;
  if (isContext) {
    // 右键上下文菜单：跟随光标坐标
    left = anchor.left;
  } else {
    // 点击 ··· 按钮：在侧栏内右对齐，落在按钮正下方
    left = anchor.right - menuWidth;
  }

  // 保证水平不超出视口两端
  if (left < padding) {
    left = padding;
  } else if (left + menuWidth > window.innerWidth - padding) {
    left = window.innerWidth - padding - menuWidth;
  }

  // 垂直定位：优先向下展示，若下方空间不足则向上翻转
  let top = anchor.bottom + gap;
  if (top + estimatedHeight > window.innerHeight - padding) {
    top = Math.max(padding, anchor.top - estimatedHeight - gap);
  }

  return {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
  };
}

/** groups 异步到达后，把根层级展开一次（随后完全交给用户控制）。 */
function useExpandRootsOnce(groups: AdminGroupDto[]) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current && groups.length > 0) {
      initializedRef.current = true;
      setExpanded(new Set(groups.filter((group) => group.parentId === null).map((group) => group.id)));
    }
  }, [groups]);
  return [expanded, setExpanded] as const;
}

interface NavProps {
  groups: AdminGroupDto[];
  activeGroup: string | null;
  onSelect: (groupId: string | null) => void;
  onMove?: (draggedId: string, targetId: string, mode: DropMode) => void;
  onEdit?: (group: AdminGroupDto) => void;
  onDelete?: (group: AdminGroupDto) => void;
  onCreateChild?: (parentGroup: AdminGroupDto) => void;
}

/**
 * 侧栏统一目录树（macOS Finder / Arc 风格）：
 * - 点击选中筛选右侧站点
 * - 支持拖拽重排与换父（移入中部为子级，边缘为同级前后）
 * - 悬浮展现 ··· 快捷操作（新建子分组、编辑、删除）
 * - 折叠/展开，平滑过渡
 */
export function GroupTreeNav({
  groups,
  activeGroup,
  onSelect,
  onMove,
  onEdit,
  onDelete,
  onCreateChild,
}: NavProps) {
  const [expanded, setExpanded] = useExpandRootsOnce(groups);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ id: string; mode: DropMode } | null>(null);
  const [openMenu, setOpenMenu] = useState<MenuState | null>(null);

  // 点击外部、页面滚动、调整窗口或按下 Escape 键时关闭浮动菜单
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const timer = window.setTimeout(() => {
      window.addEventListener('click', close);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('resize', close);
      window.addEventListener('scroll', close, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [openMenu]);

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDragOver = (event: React.DragEvent, node: GroupNode) => {
    if (!draggingId || !onMove) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    const mode: DropMode = ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'into';
    setDropHint((current) =>
      current?.id === node.group.id && current.mode === mode ? current : { id: node.group.id, mode },
    );
  };

  const handleDrop = (event: React.DragEvent, node: GroupNode) => {
    if (!onMove) return;
    event.preventDefault();
    event.stopPropagation();
    const mode = dropHint?.mode ?? 'into';
    if (draggingId && draggingId !== node.group.id) {
      onMove(draggingId, node.group.id, mode);
      if (mode === 'into') {
        setExpanded((current) => new Set(current).add(node.group.id));
      }
    }
    setDraggingId(null);
    setDropHint(null);
  };

  const renderNodes = (nodes: GroupNode[]) =>
    nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const isOpen = expanded.has(node.group.id);
      const active = activeGroup === node.group.id;
      const isDragging = draggingId === node.group.id;
      const hint = dropHint?.id === node.group.id ? dropHint.mode : null;
      const menuOpen = openMenu?.group.id === node.group.id;

      return (
        <div key={node.group.id} className="tree-nav-branch">
          <div
            className={[
              'tree-nav-row',
              active ? 'is-active' : '',
              isDragging ? 'is-dragging' : '',
              hint === 'into' ? 'drop-into' : '',
              hint === 'before' ? 'drop-before' : '',
              hint === 'after' ? 'drop-after' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ paddingLeft: 4 + node.depth * 13 }}
            draggable={!!onMove}
            onDragStart={(event) => {
              if (!onMove) return;
              setOpenMenu(null);
              setDraggingId(node.group.id);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', node.group.id);
            }}
            onDragEnd={() => {
              setDraggingId(null);
              setDropHint(null);
            }}
            onDragOver={(event) => handleDragOver(event, node)}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setDropHint((current) => (current?.id === node.group.id ? null : current));
              }
            }}
            onDrop={(event) => handleDrop(event, node)}
            onContextMenu={(event) => {
              if (!onEdit && !onDelete && !onCreateChild) return;
              event.preventDefault();
              event.stopPropagation();
              setOpenMenu({
                group: node.group,
                anchor: {
                  top: event.clientY,
                  right: event.clientX,
                  bottom: event.clientY,
                  left: event.clientX,
                },
                isContext: true,
              });
            }}
          >
            <button
              type="button"
              className={`tree-chevron${hasChildren ? (isOpen ? ' is-open' : '') : ' is-leaf'}`}
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) toggle(node.group.id);
              }}
              aria-label={isOpen ? '折叠' : '展开'}
              aria-expanded={hasChildren ? isOpen : undefined}
            >
              {hasChildren && <IconChevronRight size={10} />}
            </button>
            <button
              type="button"
              className="tree-nav-label"
              onClick={() => onSelect(node.group.id)}
              title={node.group.name}
            >
              <span className="tree-nav-icon">{node.group.icon || <IconFolder size={13} />}</span>
              <span className="tree-nav-name">{node.group.name}</span>
            </button>

            <span className="tree-nav-count num" title={`含子分组共 ${node.group.totalCount} 个站点`}>
              {node.group.totalCount}
            </span>

            {(onEdit || onDelete || onCreateChild) && (
              <div className="tree-row-menu-wrap" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="tree-row-menu-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setOpenMenu((cur) =>
                      cur?.group.id === node.group.id
                        ? null
                        : {
                            group: node.group,
                            anchor: {
                              top: rect.top,
                              right: rect.right,
                              bottom: rect.bottom,
                              left: rect.left,
                            },
                            isContext: false,
                          },
                    );
                  }}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  title="操作分组"
                  aria-label={`操作分组 ${node.group.name}`}
                >
                  ···
                </button>
              </div>
            )}
          </div>
          {hasChildren && isOpen && <div className="tree-nav-children">{renderNodes(node.children)}</div>}
        </div>
      );
    });

  return (
    <>
      <div className="tree-nav">{renderNodes(buildGroupTree(groups))}</div>
      {openMenu && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="dropdown-menu tree-nav-dropdown pn-fade"
              style={calculateMenuStyle(openMenu.anchor, openMenu.isContext)}
              onClick={(e) => e.stopPropagation()}
              role="menu"
            >
              {onCreateChild && (
                <button
                  type="button"
                  className="dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    const target = openMenu.group;
                    setOpenMenu(null);
                    onCreateChild(target);
                  }}
                >
                  + 新建子分组
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  className="dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    const target = openMenu.group;
                    setOpenMenu(null);
                    onEdit(target);
                  }}
                >
                  编辑分组
                </button>
              )}
              {onDelete && (
                <>
                  {(onCreateChild || onEdit) && <div className="dropdown-divider" />}
                  <button
                    type="button"
                    className="dropdown-item dropdown-item-danger"
                    role="menuitem"
                    onClick={() => {
                      const target = openMenu.group;
                      setOpenMenu(null);
                      onDelete(target);
                    }}
                  >
                    删除分组
                  </button>
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
