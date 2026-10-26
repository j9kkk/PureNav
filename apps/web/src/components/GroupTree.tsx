import { useEffect, useRef, useState } from 'react';
import type { AdminGroupDto } from '../api';
import { buildGroupTree, type DropMode, type GroupNode } from '../lib/groupTree';
import { IconChevronRight, IconFolder, IconGrip } from './icons';

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
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // 点击外部关闭行内操作菜单：延迟到下一微任务监听，避免当前点击事件直接冒泡触发关闭
  useEffect(() => {
    if (!activeMenuId) return;
    let timer: number;
    const onDocClick = () => setActiveMenuId(null);
    timer = window.setTimeout(() => {
      window.addEventListener('click', onDocClick);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('click', onDocClick);
    };
  }, [activeMenuId]);

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
      const menuOpen = activeMenuId === node.group.id;

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
                    setActiveMenuId((cur) => (cur === node.group.id ? null : node.group.id));
                  }}
                  aria-expanded={menuOpen}
                  title="操作分组"
                  aria-label={`操作分组 ${node.group.name}`}
                >
                  ···
                </button>
                {menuOpen && (
                  <div className="dropdown-menu tree-nav-dropdown pn-fade">
                    {onCreateChild && (
                      <button
                        type="button"
                        className="dropdown-item"
                        onClick={() => {
                          setActiveMenuId(null);
                          onCreateChild(node.group);
                        }}
                      >
                        + 新建子分组
                      </button>
                    )}
                    {onEdit && (
                      <button
                        type="button"
                        className="dropdown-item"
                        onClick={() => {
                          setActiveMenuId(null);
                          onEdit(node.group);
                        }}
                      >
                        编辑分组
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        className="dropdown-item dropdown-item-danger"
                        onClick={() => {
                          setActiveMenuId(null);
                          onDelete(node.group);
                        }}
                      >
                        删除分组
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {hasChildren && isOpen && <div className="tree-nav-children">{renderNodes(node.children)}</div>}
        </div>
      );
    });

  return <div className="tree-nav">{renderNodes(buildGroupTree(groups))}</div>;
}
