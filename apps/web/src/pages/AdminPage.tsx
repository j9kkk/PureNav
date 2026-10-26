import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type AdminGroupDto, type AdminItemDto } from '../api';
import type { SessionUser } from '../types';
import { DragHandle, useRowDrag } from '../components/SortableList';
import { GroupTreeNav } from '../components/GroupTree';
import { applyGroupMove, buildGroupTree, treeToSnapshot, type DropMode, type GroupNode } from '../lib/groupTree';
import { Switch } from '../components/Switch';
import { TagInput } from '../components/TagInput';
import { BookmarkImportModal } from '../components/BookmarkImportModal';
import {
  parseBookmarksHtml,
  bookmarkFoldersToImportPayload,
  type ParsedBookmarkFolder,
} from '../lib/bookmarkParser';
import { SettingsPage } from './SettingsPage';
import { AccountPage } from './AccountPage';
import { getItemPalette } from '../lib/color';
import { detectIconVariant, type IconVariant } from '../lib/iconTone';
import {
  IconDownload,
  IconGrid,
  IconHome,
  IconLogout,
  IconPlus,
  IconSliders,
  IconUser,
} from '../components/icons';

interface Props {
  user: SessionUser;
  onHome: () => void;
  onLoggedOut: () => void;
}

interface ItemForm {
  id?: string;
  groupId: string;
  title: string;
  url: string;
  lanUrl: string;
  description: string;
  iconType: 'auto' | 'url' | 'iconify' | 'text' | 'asset';
  iconRef: string;
  iconAssetId: string;
  iconPreview: string;
  tags: string;
  openInNewTab: boolean;
  pinned: boolean;
}

function ItemPreviewIcon({ item }: { item: AdminItemDto }) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const [variant, setVariant] = useState<IconVariant>('inset');
  const palette = useMemo(() => getItemPalette(item.url, item.title), [item.url, item.title]);

  let src: string | null = null;
  if (item.icon.type === 'asset' && item.icon.ref) src = item.icon.ref;
  else if (item.icon.type === 'url' && item.icon.ref) src = item.icon.ref;
  else if (item.icon.type === 'iconify' && item.icon.ref) {
    src = `https://api.iconify.design/${item.icon.ref.replace(':', '/')}.svg?color=${encodeURIComponent(palette.color)}`;
  } else if (item.icon.type === 'auto') {
    try {
      const host = new URL(item.url).hostname;
      // 与前台一致走同源代理，后台预览才和实际呈现保持一致。
      src = `/api/v1/icons/favicon?host=${encodeURIComponent(host)}`;
    } catch {
      src = null;
    }
  }

  const initial = item.title.trim().slice(0, 1).toUpperCase() || '·';

  return (
    <span
      className="admin-item-icon"
      data-has-image={src && loaded && !broken ? 'true' : 'false'}
      data-variant={variant}
      style={{ color: palette.color }}
    >
      {(!src || broken || !loaded) && <span>{initial}</span>}
      {src && !broken && (
        <img
          src={src}
          alt=""
          loading="lazy"
          onLoad={(e) => {
            setLoaded(true);
            setVariant(detectIconVariant(e.currentTarget));
          }}
          onError={() => setBroken(true)}
        />
      )}
    </span>
  );
}

function ItemActions({
  item,
  canMove,
  onMove,
  onEdit,
  onToggle,
  onRemove,
}: {
  item: AdminItemDto;
  canMove: boolean;
  onMove: (delta: -1 | 1) => void;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDocClick = () => setOpen(false);
    window.addEventListener('click', onDocClick);
    return () => window.removeEventListener('click', onDocClick);
  }, [open]);

  return (
    <div className="action-cell">
      <button className="btn btn-sm" onClick={onEdit}>
        编辑
      </button>
      <div className="dropdown" onClick={(e) => e.stopPropagation()}>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => setOpen((cur) => !cur)}
          aria-expanded={open}
          title="更多操作"
        >
          ···
        </button>
        {open && (
          <div className="dropdown-menu pn-fade">
            {canMove && (
              <>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setOpen(false);
                    onMove(-1);
                  }}
                >
                  ↑ 上移一位
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setOpen(false);
                    onMove(1);
                  }}
                >
                  ↓ 下移一位
                </button>
                <div className="dropdown-divider" />
              </>
            )}
            <button
              className="dropdown-item"
              onClick={() => {
                setOpen(false);
                onToggle();
              }}
            >
              {item.enabled ? '停用此项' : '启用此项'}
            </button>
            <button
              className="dropdown-item dropdown-item-danger"
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
            >
              删除站点
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY_FORM = (groupId: string): ItemForm => ({
  groupId,
  title: '',
  url: '',
  lanUrl: '',
  description: '',
  iconType: 'auto',
  iconRef: '',
  iconAssetId: '',
  iconPreview: '',
  tags: '',
  openInNewTab: true,
  pinned: false,
});

/** 生成带省略号的分页按钮序列，如 [1, '…', 4, 5, 6, '…', 20] */
function pageWindow(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const wanted = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...wanted].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | 'ellipsis')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push('ellipsis');
    out.push(p);
    prev = p;
  }
  return out;
}

/** Debounced Iconify search. Queries shorter than two characters are ignored by the server. */
function IconSearch({ onPick }: { onPick: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const timer = window.setTimeout(() => {
      api
        .searchIcons(term)
        .then((response) => {
          if (!cancelled) setResults(response.items);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="field">
      <label htmlFor="f-icon-search">搜索 Iconify 图标</label>
      <input
        id="f-icon-search"
        value={query}
        placeholder="例如 github、docker"
        onChange={(event) => setQuery(event.target.value)}
      />
      {busy && <span className="hint">搜索中…</span>}
      {!busy && query.trim().length >= 2 && results.length === 0 && (
        <span className="hint">没有匹配结果</span>
      )}
      {results.length > 0 && (
        <div className="icon-results">
          {results.map((icon) => (
            <button
              key={icon.id}
              type="button"
              className="icon-result"
              title={icon.id}
              onClick={() => onPick(icon.id)}
            >
              <img src={icon.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminPage({ user, onHome, onLoggedOut }: Props) {
  const [groups, setGroups] = useState<AdminGroupDto[]>([]);
  const [items, setItems] = useState<AdminItemDto[]>([]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [panel, setPanel] = useState<'items' | 'settings' | 'account'>('items');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<ItemForm | null>(null);
  const [groupDialog, setGroupDialog] = useState<{ id?: string; name: string; icon: string; parentId: string | null } | null>(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [pendingBookmarkFolders, setPendingBookmarkFolders] = useState<ParsedBookmarkFolder[] | null>(null);
  const bookmarkInputRef = useRef<HTMLInputElement>(null);
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [serverTotal, setServerTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const allTags = useMemo(() => Array.from(new Set(items.flatMap((item) => item.tags))).sort(), [items]);

  // 面包屑路径：从根到当前选中分组，支持逐级点击返回
  const activeBreadcrumbs = useMemo(() => {
    if (!activeGroup) return [];
    const byId = new Map(groups.map((g) => [g.id, g]));
    const trail: AdminGroupDto[] = [];
    let cur = byId.get(activeGroup);
    while (cur) {
      trail.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return trail;
  }, [groups, activeGroup]);

  // 服务端分页：列表接口按 page/pageSize/q 返回当前页与总数
  const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));
  const safePage = Math.min(pageIndex, totalPages);
  // 仅当整组数据都在当前页且未搜索时才允许拖拽排序（order 接口要求完整 id 列表）
  const canDragItems = !!activeGroup && serverTotal <= pageSize && !search;

  useEffect(() => {
    setPageIndex(1);
  }, [activeGroup, pageSize, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  };

  const handleBookmarkFile = async (file: File) => {
    setError('');
    try {
      const text = await file.text();
      const folders = parseBookmarksHtml(text);
      if (folders.length === 0) {
        setError('未在文件中识别到有效的浏览器书签');
        return;
      }
      setPendingBookmarkFolders(folders);
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析书签文件失败');
    }
  };

  const handleImportSelectedBookmarks = async (
    selectedFolders: ParsedBookmarkFolder[],
    mode: 'merge' | 'replace',
  ) => {
    if (mode === 'replace' && !window.confirm('替换会清空现有全部分组与站点。确定继续？')) return;
    try {
      const payload = bookmarkFoldersToImportPayload(selectedFolders);
      const result = await api.importConfig(payload, mode);
      setPendingBookmarkFolders(null);
      flash(`书签导入成功，共创建 ${result.created} 条数据`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    }
  };

  const load = async () => {
    setError('');
    try {
      const [groupResult, itemResult] = await Promise.all([
        api.groups(),
        api.items(activeGroup ?? undefined, { page: pageIndex, pageSize, q: search || undefined }),
      ]);
      setGroups(groupResult.items);
      setItems(itemResult.items);
      setServerTotal(itemResult.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup, pageIndex, pageSize, search]);

  const createGroup = async () => {
    if (!groupDialog) return;
    const name = groupDialog.name.trim();
    if (!name) return;
    try {
      if (groupDialog.id) {
        await api.updateGroup(groupDialog.id, {
          name,
          icon: groupDialog.icon.trim() || null,
          parentId: groupDialog.parentId || null,
        });
        flash('分组已更新');
      } else {
        const created = await api.createGroup({
          name,
          icon: groupDialog.icon.trim() || null,
          parentId: groupDialog.parentId || null,
        });
        flash('分组已创建');
        setActiveGroup(created.id);
      }
      setGroupDialog(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const removeGroup = async (group: AdminGroupDto) => {
    const cascade = group.totalCount > 0
      ? window.confirm(`「${group.name}」及其子分组共 ${group.totalCount} 个站点，删除会一并移除。继续？`)
      : window.confirm(`删除分组「${group.name}」？`);
    if (!cascade) return;
    try {
      await api.deleteGroup(group.id, group.totalCount > 0);
      flash('分组已删除');
      if (activeGroup && groupIdsUnder(group.id).includes(activeGroup)) setActiveGroup(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  /** 拖拽分组树：换父或兄弟内排序。乐观更新，失败回滚。 */
  const handleGroupTreeMove = async (draggedId: string, targetId: string, mode: DropMode) => {
    const next = applyGroupMove(groups, draggedId, targetId, mode);
    if (!next) return;
    const snapshot = treeToSnapshot(buildGroupTree(next));
    setGroups(next);
    try {
      await api.reorderGroups(snapshot);
      flash('分组结构已更新');
    } catch (err) {
      setError(err instanceof Error ? err.message : '移动失败');
      await load();
    }
  };

  const groupIdsUnder = (rootId: string): string[] => {
    const out: string[] = [];
    const walk = (id: string) => {
      out.push(id);
      for (const group of groups) {
        if (group.parentId === id) walk(group.id);
      }
    };
    walk(rootId);
    return out;
  };

  const applyItemOrder = async (groupId: string, ordered: string[]) => {
    const inGroup = items.filter((item) => item.groupId === groupId);
    const byId = new Map(inGroup.map((item) => [item.id, item]));
    const reordered = ordered.map((id) => byId.get(id)!).filter(Boolean);
    // Replace just this group's slice, keeping items from other groups in place.
    const others = items.filter((item) => item.groupId !== groupId);
    setItems([...reordered, ...others]);
    try {
      await api.reorderItems(groupId, ordered);
    } catch (err) {
      setError(err instanceof Error ? err.message : '排序失败');
      await load();
    }
  };

  const saveItem = async () => {
    if (!form) return;
    if (!form.title.trim() || !form.url.trim()) {
      setError('标题与地址为必填项');
      return;
    }

    const payload: Record<string, unknown> = {
      groupId: form.groupId,
      title: form.title.trim(),
      url: form.url.trim(),
      lanUrl: form.lanUrl.trim() || null,
      description: form.description.trim() || null,
      openInNewTab: form.openInNewTab,
      pinned: form.pinned,
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      icon:
        form.iconType === 'asset'
          ? { type: 'asset', assetId: form.iconAssetId }
          : form.iconType === 'url' || form.iconType === 'iconify'
            ? { type: form.iconType, ref: form.iconRef.trim() }
            : { type: form.iconType },
    };

    try {
      if (form.id) {
        await api.updateItem(form.id, payload);
        flash('站点已更新');
      } else {
        await api.createItem(payload);
        flash('站点已添加');
      }
      setForm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const removeItem = async (item: AdminItemDto) => {
    if (!window.confirm(`删除「${item.title}」？`)) return;
    try {
      await api.deleteItem(item.id);
      flash('站点已删除');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const moveItem = async (id: string, direction: -1 | 1) => {
    const groupId = items.find((item) => item.id === id)?.groupId;
    if (!groupId) return;
    const inGroup = items.filter((item) => item.groupId === groupId);
    const index = inGroup.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= inGroup.length) return;

    const ordered = inGroup.map((item) => item.id);
    const moved = ordered.splice(index, 1)[0]!;
    ordered.splice(target, 0, moved);
    await applyItemOrder(groupId, ordered);
  };

  const toggleItem = async (item: AdminItemDto) => {
    try {
      await api.updateItem(item.id, { enabled: !item.enabled });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const runBatch = async (op: 'enable' | 'disable' | 'delete' | 'move', moveTo?: string) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (op === 'delete' && !window.confirm(`删除选中的 ${ids.length} 个站点？`)) return;

    try {
      const result = await api.batchItems(op, ids, moveTo);
      flash(`已处理 ${result.affected} 项`);
      setSelectedIds(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量操作失败');
    }
  };

  const logout = async () => {
    await api.logout().catch(() => undefined);
    onLoggedOut();
  };

  const openEdit = (item: AdminItemDto) => {
    const isAsset = item.icon.type === 'asset';
    setForm({
      id: item.id,
      groupId: item.groupId,
      title: item.title,
      url: item.url,
      lanUrl: item.lanUrl ?? '',
      description: item.description ?? '',
      iconType: item.icon.type as ItemForm['iconType'],
      iconRef: item.icon.ref ?? '',
      iconAssetId: item.icon.assetId ?? '',
      iconPreview: isAsset ? (item.icon.ref ?? '') : '',
      tags: item.tags.join(', '),
      openInNewTab: item.openInNewTab,
      pinned: item.pinned ?? false,
    });
  };

  const uploadIcon = async (file: File) => {
    if (!form) return;
    try {
      const asset = await api.uploadIcon(file);
      setForm({ ...form, iconType: 'asset', iconAssetId: asset.assetId, iconPreview: asset.url });
      flash('图标已上传');
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    }
  };

  const visibleGroups = activeGroup ? groups.filter((group) => group.id === activeGroup) : groups;

  // Dragging is only meaningful within one group's slice. In the all-groups view the
  // rows are mixed, so drag stays off and the up/down buttons keep that edit path alive.
  const itemDragIds = activeGroup ? items.filter((item) => item.groupId === activeGroup).map((item) => item.id) : [];
  const itemDrag = useRowDrag(itemDragIds, (ordered) => {
    if (activeGroup) void applyItemOrder(activeGroup, ordered);
  });

  return (
    <div className="admin-layout">
      <aside className="admin-side">
        <div className="brand" style={{ marginBottom: 14, padding: '0 8px' }}>
          <span className="brand-mark">P</span>
          <span className="brand-title">PureNav</span>
          <span className="count-chip">后台</span>
        </div>

        <nav className="admin-nav">
          <button
            className="side-item"
            aria-current={panel === 'items' && activeGroup === null ? 'true' : undefined}
            onClick={() => {
              setPanel('items');
              setActiveGroup(null);
            }}
          >
            <span className="side-icon">
              <IconGrid size={16} />
            </span>
            全部站点
          </button>

          <div className="admin-side-tree">
            <GroupTreeNav
              groups={groups}
              activeGroup={panel === 'items' ? activeGroup : null}
              onSelect={(groupId) => {
                setPanel('items');
                setActiveGroup(groupId);
              }}
              onMove={(draggedId, targetId, mode) => void handleGroupTreeMove(draggedId, targetId, mode)}
              onEdit={(group) => setGroupDialog({ id: group.id, name: group.name, icon: group.icon ?? '', parentId: group.parentId })}
              onDelete={(group) => void removeGroup(group)}
              onCreateChild={(parentGroup) => setGroupDialog({ name: '', icon: '', parentId: parentGroup.id })}
            />
          </div>

          <button
            className="side-item"
            onClick={() => setGroupDialog({ name: '', icon: '', parentId: null })}
          >
            <span className="side-icon">
              <IconPlus size={16} />
            </span>
            新建分组
          </button>

          <div className="side-sep" role="presentation" />

          <button
            className="side-item"
            aria-current={panel === 'settings' ? 'true' : undefined}
            onClick={() => setPanel('settings')}
          >
            <span className="side-icon">
              <IconSliders size={16} />
            </span>
            站点设置
          </button>

          <button
            className="side-item"
            aria-current={panel === 'account' ? 'true' : undefined}
            onClick={() => setPanel('account')}
          >
            <span className="side-icon">
              <IconUser size={16} />
            </span>
            账户与日志
          </button>

          <div className="side-sep" role="presentation" />

          <button className="side-item" onClick={onHome}>
            <span className="side-icon">
              <IconHome size={16} />
            </span>
            返回前台
          </button>
          <button className="side-item" onClick={logout}>
            <span className="side-icon">
              <IconLogout size={16} />
            </span>
            退出登录
          </button>
        </nav>

        <div className="spacer" />
        <div className="side-user">{user.username}</div>
      </aside>

      <main className="admin-main">
        {panel === 'settings' ? (
          <>
            <div className="admin-header">
              <h1>站点设置</h1>
            </div>
            <SettingsPage
              onChanged={() => {
                // Forget the cached snapshot so the front page refetches the new theme.
                try {
                  localStorage.removeItem('pn.config.snapshot');
                } catch {
                  // ignore
                }
              }}
            />
          </>
        ) : panel === 'account' ? (
          <>
            <div className="admin-header">
              <h1>账户与日志</h1>
            </div>
            <AccountPage />
          </>
        ) : (
          <>
        <div className="admin-header">
          <div className="admin-title-wrap">
            {activeBreadcrumbs.length > 0 ? (
              <nav className="admin-breadcrumb" aria-label="分组层级">
                <button
                  type="button"
                  className="crumb-btn"
                  onClick={() => setActiveGroup(null)}
                >
                  全部站点
                </button>
                {activeBreadcrumbs.map((crumb, idx) => {
                  const isLast = idx === activeBreadcrumbs.length - 1;
                  return (
                    <span key={crumb.id} className="crumb-segment">
                      <span className="crumb-sep">/</span>
                      {isLast ? (
                        <h1 className="crumb-current">{crumb.name}</h1>
                      ) : (
                        <button
                          type="button"
                          className="crumb-btn"
                          onClick={() => setActiveGroup(crumb.id)}
                        >
                          {crumb.name}
                        </button>
                      )}
                    </span>
                  );
                })}
              </nav>
            ) : (
              <h1>全部站点</h1>
            )}
            <span className="count-chip num">{serverTotal} 个站点</span>
          </div>
          <div className="spacer" />
          <input
            className="admin-search"
            type="search"
            placeholder="搜索标题或网址…"
            aria-label="搜索站点"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <div className="admin-header-actions">
            <button
              className="btn btn-sm"
              onClick={() => bookmarkInputRef.current?.click()}
              title="支持从 Chrome、Edge、Safari、Firefox 导出的 HTML 格式书签导入"
            >
              <IconDownload size={15} />
              导入书签
            </button>
            <input
              ref={bookmarkInputRef}
              type="file"
              accept=".html,text/html"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleBookmarkFile(file);
                e.target.value = '';
              }}
            />
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                const groupId = activeGroup ?? groups[0]?.id;
                if (!groupId) {
                  setError('请先创建一个分组');
                  return;
                }
                setForm(EMPTY_FORM(groupId));
              }}
            >
              + 添加站点
            </button>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}

        {selectedIds.size > 0 && (
          <div className="bulk-bar pn-fade">
            <span>已选 {selectedIds.size} 项</span>
            <div className="spacer" />
            <button
              className="btn btn-sm"
              onClick={() => void runBatch('enable')}
            >
              启用
            </button>
            <button className="btn btn-sm" onClick={() => void runBatch('disable')}>
              停用
            </button>
            <select
              className="bulk-move"
              value=""
              onChange={(event) => {
                const target = event.target.value;
                if (target) void runBatch('move', target);
              }}
            >
              <option value="">移动到…</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <button className="btn btn-sm btn-danger" onClick={() => void runBatch('delete')}>
              删除
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setSelectedIds(new Set())}>
              取消
            </button>
          </div>
        )}

        <div className="admin-table-wrap">
        <table className="table admin-table">
          <thead>
            <tr>
              <th style={{ width: 34 }} aria-label="排序" />
              <th style={{ width: 34 }}>
                <input
                  type="checkbox"
                  aria-label="全选本页"
                  checked={items.length > 0 && items.every((item) => selectedIds.has(item.id))}
                  onChange={(event) => {
                    setSelectedIds((current) => {
                      const next = new Set(current);
                      for (const item of items) {
                        if (event.target.checked) next.add(item.id);
                        else next.delete(item.id);
                      }
                      return next;
                    });
                  }}
                />
              </th>
              <th style={{ width: 44 }}>图标</th>
              <th>站点</th>
              <th>分组</th>
              <th>标签</th>
              <th style={{ width: 110, textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                {...(canDragItems
                  ? itemDrag.rowProps(item.id, item.enabled ? undefined : 'row-muted')
                  : { className: item.enabled ? undefined : 'row-muted' })}
              >
                <td>
                  <DragHandle
                    disabled={!canDragItems}
                    handleProps={{
                      draggable: canDragItems,
                      onDragStart: itemDrag.start(item.id),
                      onDragEnd: itemDrag.end,
                      onClick: (event) => event.preventDefault(),
                    }}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`选择 ${item.title}`}
                    checked={selectedIds.has(item.id)}
                    onChange={(event) => {
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(item.id);
                        else next.delete(item.id);
                        return next;
                      });
                    }}
                  />
                </td>
                <td>
                  <ItemPreviewIcon item={item} />
                </td>
                <td>
                  <div className="table-item-primary">
                    <a
                      className="table-item-title"
                      href={item.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      title={item.title}
                    >
                      {item.title}
                    </a>
                    <span className="table-item-url">
                      {item.url}
                      {item.lanUrl && <span className="badge badge-lan">内网</span>}
                    </span>
                  </div>
                </td>
                <td>
                  <span className="badge">{groups.find((group) => group.id === item.groupId)?.name ?? '—'}</span>
                </td>
                <td>
                  <div className="table-tag-list">
                    {item.tags.length > 0 ? (
                      <>
                        {item.tags.slice(0, 2).map((t) => (
                          <span key={t} className="badge">
                            {t}
                          </span>
                        ))}
                        {item.tags.length > 2 && (
                          <span className="badge badge-more" title={item.tags.slice(2).join(', ')}>
                            +{item.tags.length - 2}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="hint">—</span>
                    )}
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <ItemActions
                    item={item}
                    canMove={!!activeGroup}
                    onMove={(d) => void moveItem(item.id, d)}
                    onEdit={() => openEdit(item)}
                    onToggle={() => void toggleItem(item)}
                    onRemove={() => void removeItem(item)}
                  />
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                  {search ? '没有匹配的站点' : '这里还没有站点'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        {(totalPages > 1 || serverTotal > 0) && (
          <div className="table-pagination">
            <span className="hint">共 {serverTotal} 个站点{search ? ` · 匹配「${search}」` : ''}</span>
            <select
              className="bulk-move"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              aria-label="每页数量"
            >
              <option value={20}>20 条/页</option>
              <option value={50}>50 条/页</option>
              <option value={100}>100 条/页</option>
            </select>
            {totalPages > 1 && (
              <>
                <div className="spacer" />
                <div className="page-btns">
                  <button className="btn btn-sm" disabled={safePage <= 1} onClick={() => setPageIndex(safePage - 1)}>
                    上一页
                  </button>
                  {pageWindow(safePage, totalPages).map((page, idx) =>
                    page === 'ellipsis' ? (
                      <span key={`e-${idx}`} className="page-ellipsis">…</span>
                    ) : (
                      <button
                        key={page}
                        className={`page-btn${page === safePage ? ' is-current' : ''}`}
                        onClick={() => setPageIndex(page)}
                      >
                        {page}
                      </button>
                    ),
                  )}
                  <button className="btn btn-sm" disabled={safePage >= totalPages} onClick={() => setPageIndex(safePage + 1)}>
                    下一页
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {visibleGroups.length === 0 && groups.length === 0 && (
          <p className="hint" style={{ marginTop: 16 }}>先创建一个分组，然后就能添加站点了。</p>
        )}
          </>
        )}
      </main>

      {form && (
        <div className="modal-backdrop" onClick={() => setForm(null)}>
          <div className="modal pn-enter" onClick={(event) => event.stopPropagation()}>
            <h3>{form.id ? '编辑站点' : '添加站点'}</h3>

            <div className="field">
              <label htmlFor="f-title">标题</label>
              <input id="f-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} autoFocus />
            </div>

            <div className="field">
              <label htmlFor="f-url">地址</label>
              <input id="f-url" value={form.url} placeholder="https://…" onChange={(event) => setForm({ ...form, url: event.target.value })} />
            </div>

            <div className="field">
              <label htmlFor="f-lan">内网地址（可选）</label>
              <input id="f-lan" value={form.lanUrl} placeholder="http://192.168.1.10:8080" onChange={(event) => setForm({ ...form, lanUrl: event.target.value })} />
              <span className="hint">仅后台可见，不会下发到匿名接口。</span>
            </div>

            <div className="field">
              <label htmlFor="f-desc">描述</label>
              <input id="f-desc" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="f-group">分组</label>
                <select id="f-group" value={form.groupId} onChange={(event) => setForm({ ...form, groupId: event.target.value })}>
                  {groups.map((group) => (
                    <option value={group.id} key={group.id}>{group.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="f-icon-type">图标</label>
                <select
                  id="f-icon-type"
                  value={form.iconType}
                  onChange={(event) => setForm({ ...form, iconType: event.target.value as ItemForm['iconType'] })}
                >
                  <option value="auto">自动抓取</option>
                  <option value="url">图片地址</option>
                  <option value="iconify">Iconify</option>
                  <option value="asset">上传图片</option>
                  <option value="text">文字首字母</option>
                </select>
              </div>
            </div>

            {(form.iconType === 'url' || form.iconType === 'iconify') && (
              <div className="field">
                <label htmlFor="f-icon-ref">{form.iconType === 'iconify' ? 'Iconify 名称' : '图片地址'}</label>
                <input
                  id="f-icon-ref"
                  value={form.iconRef}
                  placeholder={form.iconType === 'iconify' ? 'mdi:github' : 'https://.../logo.png'}
                  onChange={(event) => setForm({ ...form, iconRef: event.target.value })}
                />
              </div>
            )}

            {form.iconType === 'iconify' && <IconSearch onPick={(id) => setForm({ ...form, iconRef: id })} />}

            {form.iconType === 'asset' && (
              <div className="field">
                <label htmlFor="f-icon-file">图标文件</label>
                <div className="icon-upload">
                  <span className="icon-preview">
                    {form.iconPreview ? <img src={form.iconPreview} alt="" /> : '—'}
                  </span>
                  <input
                    id="f-icon-file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadIcon(file);
                    }}
                  />
                </div>
                <span className="hint">PNG / JPEG / WebP，不超过 512KB。</span>
              </div>
            )}

            <div className="field">
              <label htmlFor="f-tags">标签（胶囊式，回车确认）</label>
              <TagInput
                id="f-tags"
                value={form.tags}
                onChange={(tags) => setForm({ ...form, tags })}
                availableTags={allTags}
                placeholder="输入标签按回车确认…"
              />
            </div>

            <div className="field switch-group">
              <Switch
                id="f-open-in-new-tab"
                checked={form.openInNewTab}
                onChange={(checked) => setForm({ ...form, openInNewTab: checked })}
                label="在新标签页中打开"
                description="点击卡片时在新窗口/标签页中打开链接"
              />
              <Switch
                id="f-pinned"
                checked={form.pinned}
                onChange={(checked) => setForm({ ...form, pinned: checked })}
                label="分组内优先置顶"
                description="高亮显示并在所属分组前排展示"
              />
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={() => setForm(null)}>取消</button>
              <button className="btn btn-primary" onClick={saveItem}>保存</button>
            </div>
          </div>
        </div>
      )}

      {groupDialog && (
        <div className="modal-backdrop" onClick={() => setGroupDialog(null)}>
          <div className="modal pn-enter" onClick={(event) => event.stopPropagation()}>
            <h3>{groupDialog.id ? '编辑分组' : '新建分组'}</h3>
            <div className="field">
              <label htmlFor="g-name">分组名</label>
              <input
                id="g-name"
                value={groupDialog.name}
                autoFocus
                maxLength={40}
                onChange={(event) => setGroupDialog({ ...groupDialog, name: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void createGroup();
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="g-icon">图标（可选，填一个 emoji）</label>
              <input
                id="g-icon"
                value={groupDialog.icon}
                maxLength={8}
                placeholder="任意单个 emoji 表情"
                onChange={(event) => setGroupDialog({ ...groupDialog, icon: event.target.value })}
              />
              <span className="hint">会显示在前台分组标题左侧。</span>
            </div>
            <div className="field">
              <label htmlFor="g-parent">上级分组</label>
              <select
                id="g-parent"
                value={groupDialog.parentId ?? ''}
                onChange={(event) => setGroupDialog({ ...groupDialog, parentId: event.target.value || null })}
              >
                <option value="">无（根层级）</option>
                {(() => {
                  // 可选父级 = 全部分组；编辑时排除自身及其子孙（避免成环）
                  const excluded = groupDialog.id ? new Set(groupIdsUnder(groupDialog.id)) : new Set<string>();
                  const walk = (nodes: GroupNode[], depth: number): Array<{ id: string; label: string }> =>
                    nodes.flatMap((node) => [
                      { id: node.group.id, label: `${'　'.repeat(depth)}${node.group.name}` },
                      ...walk(node.children, depth + 1),
                    ]);
                  return walk(buildGroupTree(groups), 1)
                    .filter((option) => !excluded.has(option.id))
                    .map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ));
                })()}
              </select>
              <span className="hint">选择后该分组将成为其子分组，前台按层级嵌套展示。</span>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setGroupDialog(null)}>取消</button>
              <button className="btn btn-primary" onClick={createGroup}>保存</button>
            </div>
          </div>
        </div>
      )}

      {pendingBookmarkFolders && (
        <BookmarkImportModal
          initialFolders={pendingBookmarkFolders}
          onClose={() => setPendingBookmarkFolders(null)}
          onImport={handleImportSelectedBookmarks}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
