import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type AdminGroupDto, type AdminItemDto } from '../api';
import type { SessionUser } from '../types';
import { DragHandle, useRowDrag } from '../components/SortableList';
import { GroupTreeNav } from '../components/GroupTree';
import {
  applyGroupMove,
  buildGroupTree,
  treeToSnapshot,
  type DropMode,
  type GroupNode,
} from '../lib/groupTree';
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
import { useDelayedUnmount } from '../lib/useDelayedUnmount';
import { getItemPalette } from '../lib/color';
import { useIconImage } from '../lib/iconImage';
import { fallbackIconSrc, primaryIconSrc } from '../lib/iconUrl';
import {
  IconCheckCircle,
  IconClose,
  IconDownload,
  IconGrid,
  IconHome,
  IconLogout,
  IconMoon,
  IconPencil,
  IconPlus,
  IconSearch,
  IconSlashCircle,
  IconSliders,
  IconSun,
  IconTrash,
  IconUser,
} from '../components/icons';
import { BrandMark } from '../components/BrandMark';
import { resolveTheme, type ThemeMode } from '../lib/theme';

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
  const palette = useMemo(() => getItemPalette(item.url, item.title), [item.url, item.title]);
  const icon = useMemo(() => primaryIconSrc(item.icon, item.url, palette.color), [item.icon, item.url, palette.color]);
  const [src, setSrc] = useState(icon);
  const { ref: imgRef, loaded, broken, onLoad, setBroken } = useIconImage(src);

  useEffect(() => {
    setSrc(icon);
    setBroken(false);
  }, [icon, setBroken]);

  const handleIconError = () => {
    const fallback = fallbackIconSrc(item.icon, item.url);
    if (fallback && src !== fallback) {
      setSrc(fallback);
      return;
    }
    setBroken(true);
  };

  const initial = item.title.trim().slice(0, 1).toUpperCase() || '·';

  return (
    <span className="nx-table-icon" style={{ color: palette.color }}>
      {src && !broken ? (
        <img ref={imgRef} src={src} alt="" loading="lazy" onLoad={onLoad} onError={handleIconError} />
      ) : (
        <span>{initial}</span>
      )}
    </span>
  );
}

function ItemActions({
  item,
  onEdit,
  onToggle,
  onRemove,
}: {
  item: AdminItemDto;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
      <button
        type="button"
        className="nx-icon-btn"
        onClick={onEdit}
        title="编辑书签"
        aria-label={`编辑书签 ${item.title}`}
      >
        <IconPencil size={14} />
      </button>
      <button
        type="button"
        className={item.enabled ? 'nx-icon-btn' : 'nx-icon-btn nx-icon-btn-ok'}
        onClick={onToggle}
        title={item.enabled ? '停用此书签' : '启用此书签'}
        aria-label={item.enabled ? `停用书签 ${item.title}` : `启用书签 ${item.title}`}
      >
        {item.enabled ? <IconSlashCircle size={14} /> : <IconCheckCircle size={14} />}
      </button>
      <button
        type="button"
        className="nx-icon-btn nx-icon-btn-danger"
        onClick={onRemove}
        title="删除书签"
        aria-label={`删除书签 ${item.title}`}
      >
        <IconTrash size={14} />
      </button>
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

function IconifyPicker({ onPick }: { onPick: (id: string) => void }) {
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
    <div className="nx-field">
      <label className="nx-label" htmlFor="f-icon-search">
        搜索 Iconify 图标
      </label>
      <input
        id="f-icon-search"
        className="nx-input"
        value={query}
        placeholder="例如 github、docker"
        onChange={(event) => setQuery(event.target.value)}
      />
      {busy && <span style={{ fontSize: 11, color: 'var(--nx-text-3)' }}>搜索中…</span>}
      {!busy && query.trim().length >= 2 && results.length === 0 && (
        <span style={{ fontSize: 11, color: 'var(--nx-text-3)' }}>没有匹配结果</span>
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
  const [panel, setPanelState] = useState<'items' | 'settings' | 'account'>(() => {
    const p = new URLSearchParams(window.location.search).get('panel');
    if (p === 'settings' || p === 'account') return p;
    return 'items';
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<ItemForm | null>(null);
  const [groupDialog, setGroupDialog] = useState<{ id?: string; name: string; icon: string; parentId: string | null } | null>(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [pendingBookmarkFolders, setPendingBookmarkFolders] = useState<ParsedBookmarkFolder[] | null>(null);
  const formMount = useDelayedUnmount(form, 240);
  const groupDialogMount = useDelayedUnmount(groupDialog, 240);
  const bookmarkMount = useDelayedUnmount(pendingBookmarkFolders, 240);
  const bookmarkInputRef = useRef<HTMLInputElement>(null);
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [serverTotal, setServerTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [themeMode] = useState<ThemeMode>(() => resolveTheme(undefined));

  const setPanel = (next: 'items' | 'settings' | 'account') => {
    setPanelState(next);
    const searchParam = next === 'items' ? '' : `?panel=${next}`;
    window.history.pushState({}, '', `/admin${searchParam}`);
  };

  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search).get('panel');
      if (p === 'settings' || p === 'account') setPanelState(p);
      else setPanelState('items');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const allTags = useMemo(() => Array.from(new Set(items.flatMap((item) => item.tags))).sort(), [items]);

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPageIndex(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
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

  const loadItemsOnly = async () => {
    setError('');
    try {
      const itemResult = await api.items(activeGroup ?? undefined, {
        page: pageIndex,
        pageSize,
        q: search || undefined,
      });
      setItems(itemResult.items);
      setServerTotal(itemResult.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  };

  const initialLoadRef = useRef(false);
  useEffect(() => {
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      void load();
      return;
    }
    void loadItemsOnly();
  }, [activeGroup, pageIndex, pageSize, search]);

  const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));
  const safePage = Math.min(pageIndex, totalPages);

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      onLoggedOut();
    }
  };

  const openCreateItem = () => {
    const groupId = activeGroup ?? groups[0]?.id;
    if (!groupId) {
      setError('请先创建一个分组');
      return;
    }
    setForm(EMPTY_FORM(groupId));
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

  const saveItem = async () => {
    if (!form) return;
    setError('');

    const payload: Record<string, unknown> = {
      groupId: form.groupId,
      title: form.title.trim(),
      url: form.url.trim(),
      lanUrl: form.lanUrl.trim() || null,
      description: form.description.trim() || null,
      openInNewTab: form.openInNewTab,
      pinned: form.pinned,
      tags: form.tags
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      icon:
        form.iconType === 'asset'
          ? { type: 'asset', assetId: form.iconAssetId }
          : form.iconType === 'url' || form.iconType === 'iconify'
            ? { type: form.iconType, ref: form.iconRef.trim() }
            : { type: form.iconType },
    };

    if (!form.title.trim() || !form.url.trim()) {
      setError('标题和地址不能为空');
      return;
    }

    try {
      if (form.id) {
        await api.updateItem(form.id, payload);
        flash('已保存修改');
      } else {
        await api.createItem(payload);
        flash('已添加新书签');
      }
      setForm(null);
      await loadItemsOnly();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const uploadIcon = async (file: File) => {
    try {
      const asset = await api.uploadIcon(file);
      setForm((prev) =>
        prev
          ? {
              ...prev,
              iconType: 'asset',
              iconAssetId: asset.assetId,
              iconPreview: asset.url,
            }
          : null,
      );
      flash('图标上传成功');
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    }
  };

  const removeItem = async (item: AdminItemDto) => {
    if (!window.confirm(`确定删除「${item.title}」？`)) return;
    try {
      await api.deleteItem(item.id);
      flash(`已删除「${item.title}」`);
      await loadItemsOnly();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const toggleItem = async (item: AdminItemDto) => {
    try {
      await api.updateItem(item.id, { enabled: !item.enabled });
      flash(item.enabled ? `已停用「${item.title}」` : `已启用「${item.title}」`);
      await loadItemsOnly();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新状态失败');
    }
  };

  const runBatch = async (op: 'enable' | 'disable' | 'delete' | 'move', moveTo?: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (op === 'delete' && !window.confirm(`确定删除选中的 ${ids.length} 个书签？`)) {
      return;
    }

    try {
      const result = await api.batchItems(op, ids, moveTo);
      flash(`已处理 ${result.affected} 项`);
      setSelectedIds(new Set());
      await loadItemsOnly();
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量操作失败');
    }
  };

  const createGroup = async () => {
    if (!groupDialog) return;
    const name = groupDialog.name.trim();
    if (!name) {
      setError('分组名不能为空');
      return;
    }

    try {
      if (groupDialog.id) {
        await api.updateGroup(groupDialog.id, {
          name,
          icon: groupDialog.icon.trim() || null,
          parentId: groupDialog.parentId,
        });
        flash('已更新分组');
      } else {
        await api.createGroup({
          name,
          icon: groupDialog.icon.trim() || null,
          parentId: groupDialog.parentId,
        });
        flash('已创建新分组');
      }
      setGroupDialog(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const removeGroup = async (group: AdminGroupDto) => {
    const cascade =
      group.totalCount > 0
        ? window.confirm(`「${group.name}」及其子分组共 ${group.totalCount} 个站点，删除会一并移除。继续？`)
        : window.confirm(`确定删除分组「${group.name}」？`);
    if (!cascade) return;
    try {
      await api.deleteGroup(group.id, group.totalCount > 0);
      flash(`已删除「${group.name}」`);
      if (activeGroup === group.id) setActiveGroup(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
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

  const handleGroupTreeMove = async (draggedId: string, targetId: string, mode: DropMode) => {
    const next = applyGroupMove(groups, draggedId, targetId, mode);
    if (!next) return;
    const snapshot = treeToSnapshot(buildGroupTree(next));
    setGroups(next);
    try {
      await api.reorderGroups(snapshot);
      flash('分组结构已更新');
    } catch (err) {
      setError(err instanceof Error ? err.message : '分组移动失败');
      await load();
    }
  };

  const canDragItems = Boolean(activeGroup && !search && serverTotal <= pageSize);

  const reorderCurrentGroupItems = async (orderedIds: string[]) => {
    const groupId = activeGroup;
    if (!groupId) return;

    const inGroup = items.filter((item) => item.groupId === groupId);
    const byId = new Map(inGroup.map((item) => [item.id, item]));
    const optimisticInGroup: AdminItemDto[] = orderedIds
      .map((id, index) => {
        const item = byId.get(id);
        return item ? { ...item, sortOrder: index } : null;
      })
      .filter((item): item is AdminItemDto => item !== null);

    const others = items.filter((item) => item.groupId !== groupId);
    setItems([...optimisticInGroup, ...others]);

    try {
      await api.reorderItems(groupId, orderedIds);
      flash('书签排序已更新');
    } catch (err) {
      setError(err instanceof Error ? err.message : '排序保存失败');
      await loadItemsOnly();
    }
  };

  const itemDragIds = activeGroup ? items.filter((item) => item.groupId === activeGroup).map((item) => item.id) : [];

  const itemDrag = useRowDrag(itemDragIds, (ordered) => void reorderCurrentGroupItems(ordered), {
    reorderEnabled: canDragItems,
  });

  const moveItemToGroup = async (itemId: string, groupId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item || item.groupId === groupId) return;
    const group = groups.find((entry) => entry.id === groupId);

    try {
      await api.updateItem(itemId, { groupId });
      flash(`「${item.title}」已移动到「${group?.name ?? '目标分组'}」`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '移动失败');
    }
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

  return (
    <div className="nx-app" data-theme={themeMode}>
      {/* 1. 左侧栏 (248px) */}
      <aside className="nx-sidebar">
        <div className="nx-brand-box">
          <div className="nx-brand-row">
            <span className="nx-brand-logo">
              <BrandMark size={22} />
            </span>
            <span className="nx-brand-title">PureNav</span>
            <span className="nx-badge">后台管理</span>
          </div>
          <button
            type="button"
            className="nx-btn-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={onHome}
          >
            <IconHome size={14} />
            <span>返回前台工作台</span>
          </button>
        </div>

        <div className="nx-side-scroll">
          {/* 系统管理导航 */}
          <div className="nx-section">
            <div className="nx-section-head">
              <span className="nx-section-title">系统管理</span>
            </div>
            <div className="nx-nav-list">
              <button
                type="button"
                className="nx-nav-item"
                data-active={panel === 'items' && activeGroup === null ? 'true' : undefined}
                onClick={() => {
                  setPanel('items');
                  setActiveGroup(null);
                }}
              >
                <span className="nx-nav-left">
                  <IconGrid size={15} />
                  <span className="nx-nav-name">书签批量管理</span>
                </span>
                <span className="nx-nav-count">{serverTotal}</span>
              </button>

              <button
                type="button"
                className="nx-nav-item"
                data-active={panel === 'settings' ? 'true' : undefined}
                onClick={() => setPanel('settings')}
              >
                <span className="nx-nav-left">
                  <IconSliders size={15} />
                  <span className="nx-nav-name">站点与数据设置</span>
                </span>
              </button>

              <button
                type="button"
                className="nx-nav-item"
                data-active={panel === 'account' ? 'true' : undefined}
                onClick={() => setPanel('account')}
              >
                <span className="nx-nav-left">
                  <IconUser size={15} />
                  <span className="nx-nav-name">账户与审计日志</span>
                </span>
              </button>
            </div>
          </div>

          {/* 目录树管理 */}
          <div className="nx-section">
            <div className="nx-section-head">
              <span className="nx-section-title">目录分组</span>
              <button
                type="button"
                className="nx-section-action"
                onClick={() => setGroupDialog({ name: '', icon: '', parentId: null })}
                title="新建根分组"
                aria-label="新建根分组"
              >
                <IconPlus size={13} />
              </button>
            </div>

            <div className="nx-admin-tree">
              <GroupTreeNav
                groups={groups}
                activeGroup={panel === 'items' ? activeGroup : null}
                onSelect={(groupId) => {
                  setPanel('items');
                  setActiveGroup(groupId);
                }}
                onMove={(draggedId, targetId, mode) => void handleGroupTreeMove(draggedId, targetId, mode)}
                onItemDrop={(itemId, groupId) => void moveItemToGroup(itemId, groupId)}
                onEdit={(group) =>
                  setGroupDialog({ id: group.id, name: group.name, icon: group.icon ?? '', parentId: group.parentId })
                }
                onDelete={(group) => void removeGroup(group)}
                onCreateChild={(parentGroup) =>
                  setGroupDialog({ name: '', icon: '', parentId: parentGroup.id })
                }
              />
            </div>
          </div>
        </div>

        {/* 侧栏底部状态 */}
        <div className="nx-side-footer">
          <div className="nx-user">
            <span className="nx-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
            <div className="nx-user-col">
              <span className="nx-user-name">{user.username}</span>
              <span className="nx-user-ver">v{__APP_VERSION__}</span>
            </div>
          </div>
          <div className="nx-footer-actions">
            <button type="button" className="nx-icon-btn" onClick={onHome} title="返回前台">
              <IconHome size={13} />
            </button>
            <button type="button" className="nx-icon-btn" onClick={logout} title="退出登录">
              <IconLogout size={13} />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. 主工作区 */}
      <main className="nx-main">
        {/* 顶栏 (52px) */}
        <header className="nx-topbar">
          {panel === 'items' ? (
            <>
              <div className="nx-topbar-left">
                <nav className="nx-crumbs" aria-label="分组层级">
                  {activeBreadcrumbs.length > 0 ? (
                    <>
                      <button type="button" className="nx-crumb" onClick={() => setActiveGroup(null)}>
                        全部站点
                      </button>
                      {activeBreadcrumbs.map((crumb, idx) => {
                        const isLast = idx === activeBreadcrumbs.length - 1;
                        return (
                          <span key={crumb.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span className="nx-crumb-sep">/</span>
                            {isLast ? (
                              <span className="nx-crumb" data-current="true">
                                {crumb.name}
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="nx-crumb"
                                onClick={() => setActiveGroup(crumb.id)}
                              >
                                {crumb.name}
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </>
                  ) : (
                    <span className="nx-crumb" data-current="true">
                      全部站点
                    </span>
                  )}
                  <span className="nx-badge">{serverTotal} 个站点</span>
                </nav>

                <div className="nx-search" style={{ width: 220, height: 32 }}>
                  <IconSearch size={14} />
                  <input
                    type="search"
                    placeholder="搜索标题或网址…"
                    aria-label="搜索站点"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                  {searchInput && (
                    <button className="nx-search-clear" onClick={() => setSearchInput('')} title="清空搜索">
                      <IconClose size={12} />
                    </button>
                  )}
                </div>
              </div>

              <div className="nx-topbar-right">
                <button
                  type="button"
                  className="nx-btn-secondary"
                  onClick={() => bookmarkInputRef.current?.click()}
                  title="支持 Chrome、Edge、Safari、Firefox 导出的 HTML 书签"
                >
                  <IconDownload size={14} />
                  <span>导入书签 HTML</span>
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

                <button type="button" className="nx-btn-primary" onClick={openCreateItem}>
                  <IconPlus size={14} />
                  <span>添加书签</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="nx-topbar-left">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: 'var(--nx-text)' }}>
                    {panel === 'settings' ? '站点与数据设置' : '账户与审计日志'}
                  </h1>
                  <span style={{ fontSize: 12, color: 'var(--nx-text-2)' }}>
                    {panel === 'settings'
                      ? '自定义站点全局标识、外观视图模式与完整数据备份'
                      : '管理员安全密码凭证、活跃设备会话管理与关键操作审计'}
                  </span>
                </div>
              </div>

              <div className="nx-topbar-right">
                <button type="button" className="nx-btn-secondary" onClick={() => setPanel('items')}>
                  <IconGrid size={14} />
                  <span>返回书签管理</span>
                </button>
              </div>
            </>
          )}
        </header>

        {/* 主内容区 */}
        <section className="nx-content">
          {error && (
            <div className="nx-alert-error" style={{ marginBottom: 12 }} role="alert">
              {error}
            </div>
          )}

          {panel === 'settings' ? (
            <SettingsPage
              onChanged={() => {
                try {
                  localStorage.removeItem('pn.config.snapshot');
                } catch {
                  // ignore
                }
                void load();
              }}
            />
          ) : panel === 'account' ? (
            <AccountPage />
          ) : (
            <>
              {/* 批量操作工具条 */}
              {selectedIds.size > 0 && (
                <div className="nx-bulk-bar">
                  <span className="nx-bulk-count">已选 {selectedIds.size} 项</span>
                  <div className="nx-bulk-divider" />
                  <button
                    type="button"
                    className="nx-btn-secondary nx-btn-sm"
                    onClick={() => void runBatch('enable')}
                  >
                    启用
                  </button>
                  <button
                    type="button"
                    className="nx-btn-secondary nx-btn-sm"
                    onClick={() => void runBatch('disable')}
                  >
                    停用
                  </button>
                  <select
                    className="nx-select nx-select-sm"
                    value=""
                    onChange={(event) => {
                      const target = event.target.value;
                      if (target) void runBatch('move', target);
                    }}
                    aria-label="移动到分组"
                  >
                    <option value="">移动到分组…</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="nx-btn-danger nx-btn-sm"
                    onClick={() => void runBatch('delete')}
                  >
                    批量删除
                  </button>
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="nx-btn-ghost nx-btn-sm"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    取消选择
                  </button>
                </div>
              )}

              {/* 数据表格容器 */}
              <div className="nx-table-card">
                <table className="nx-table">
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
                      <th style={{ width: 48 }}>图标</th>
                      <th>书签信息</th>
                      <th style={{ width: 140 }}>所属分组</th>
                      <th style={{ width: 160 }}>标签</th>
                      <th style={{ width: 90 }}>状态</th>
                      <th style={{ width: 110, textAlign: 'right' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        {...itemDrag.rowProps(item.id, item.enabled ? undefined : 'row-muted')}
                      >
                        <td>
                          <DragHandle
                            handleProps={{
                              draggable: true,
                              onDragStart: itemDrag.start(item.id),
                              onDragEnd: itemDrag.end,
                              onClick: (event) => event.preventDefault(),
                            }}
                            title={canDragItems ? '拖拽调整顺序，或拖到左侧分组移动' : '拖到左侧分组移动'}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`选择 ${item.title}`}
                            checked={selectedIds.has(item.id)}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setSelectedIds((current) => {
                                const next = new Set(current);
                                if (checked) next.add(item.id);
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
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <a
                                className="nx-table-title"
                                href={item.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                title={item.title}
                              >
                                {item.title}
                              </a>
                              {item.pinned && <span className="nx-badge nx-badge-pinned">置顶</span>}
                            </div>
                            <div className="nx-table-url">
                              <span title={item.url}>{item.url}</span>
                              {item.lanUrl && <span className="nx-badge nx-badge-lan">内网</span>}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="nx-badge">
                            {groups.find((group) => group.id === item.groupId)?.name ?? '—'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            {item.tags.length > 0 ? (
                              <>
                                {item.tags.slice(0, 2).map((t) => (
                                  <span key={t} className="nx-badge">
                                    {t}
                                  </span>
                                ))}
                                {item.tags.length > 2 && (
                                  <span className="nx-badge" title={item.tags.slice(2).join(', ')}>
                                    +{item.tags.length - 2}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--nx-text-3)' }}>—</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={item.enabled ? 'nx-status-pill is-ok' : 'nx-status-pill is-off'}>
                            {item.enabled ? '已启用' : '已停用'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <ItemActions
                            item={item}
                            onEdit={() => openEdit(item)}
                            onToggle={() => void toggleItem(item)}
                            onRemove={() => void removeItem(item)}
                          />
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', color: 'var(--nx-text-3)', padding: 48 }}>
                          {search ? '没有匹配的书签' : '当前分组下暂无书签，点击右上角「+ 添加书签」创建'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* 底部分页栏 */}
                {(totalPages > 1 || serverTotal > 0) && (
                  <div className="nx-pagination">
                    <div className="nx-pagination-left">
                      <span>
                        共 {serverTotal} 个站点{search ? ` · 匹配「${search}」` : ''}
                      </span>
                      <select
                        className="nx-select nx-select-sm"
                        value={pageSize}
                        onChange={(event) => setPageSize(Number(event.target.value))}
                        aria-label="每页数量"
                      >
                        <option value={20}>20 条/页</option>
                        <option value={50}>50 条/页</option>
                        <option value={100}>100 条/页</option>
                      </select>
                    </div>

                    {totalPages > 1 && (
                      <div className="nx-pagination-right">
                        <button
                          type="button"
                          className="nx-btn-secondary nx-btn-sm"
                          disabled={safePage <= 1}
                          onClick={() => setPageIndex(safePage - 1)}
                        >
                          上一页
                        </button>
                        {pageWindow(safePage, totalPages).map((page, idx) =>
                          page === 'ellipsis' ? (
                            <span key={`e-${idx}`} style={{ padding: '0 4px', color: 'var(--nx-text-3)' }}>
                              …
                            </span>
                          ) : (
                            <button
                              key={page}
                              type="button"
                              className={`nx-page-num${page === safePage ? ' is-current' : ''}`}
                              onClick={() => setPageIndex(page)}
                            >
                              {page}
                            </button>
                          ),
                        )}
                        <button
                          type="button"
                          className="nx-btn-secondary nx-btn-sm"
                          disabled={safePage >= totalPages}
                          onClick={() => setPageIndex(safePage + 1)}
                        >
                          下一页
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* 3. 底部状态栏 (32px) */}
        <footer className="nx-statusbar">
          <div className="nx-status-left">
            <span className="nx-status-dot" />
            <span>
              {panel === 'items'
                ? `管理后台 · 共 ${groups.length} 个分组 · ${serverTotal} 条书签 · 当前账号 ${user.username} · v${__APP_VERSION__}`
                : panel === 'settings'
                  ? `站点与数据设置 · 当前账号 ${user.username} · v${__APP_VERSION__}`
                  : `账户与审计日志 · 当前账号 ${user.username} · v${__APP_VERSION__}`}
            </span>
          </div>
          <div className="nx-status-right">
            <span>
              {panel === 'items'
                ? '支持拖拽行排序 · 拖入左侧目录移动分组'
                : panel === 'settings'
                  ? '配置实时自动保存 · 数据导出建议定期归档'
                  : '活跃会话安全监控 · 密码修改将注销其它设备'}
            </span>
          </div>
        </footer>
      </main>

      {/* 编辑/添加站点弹窗 */}
      {formMount.held && (() => {
        const currentForm = formMount.held;
        return (
          <div
            className="nx-backdrop"
            data-exit={formMount.closing || undefined}
            onClick={() => setForm(null)}
          >
            <div
              className="nx-dialog"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={currentForm.id ? '编辑书签' : '添加书签'}
              style={{ maxWidth: 540 }}
            >
              <div className="nx-dialog-head">
                <span className="nx-dialog-title">{currentForm.id ? '编辑书签' : '添加书签'}</span>
                <button
                  type="button"
                  className="nx-dialog-close"
                  onClick={() => setForm(null)}
                  title="关闭"
                  aria-label="关闭"
                >
                  <IconClose size={15} />
                </button>
              </div>

              <div className="nx-dialog-body">
                <div className="nx-field">
                  <label className="nx-label" htmlFor="f-title">
                    标题
                  </label>
                  <input
                    id="f-title"
                    className="nx-input"
                    value={currentForm.title}
                    onChange={(event) => setForm({ ...currentForm, title: event.target.value })}
                    autoFocus
                  />
                </div>

                <div className="nx-field">
                  <label className="nx-label" htmlFor="f-url">
                    地址
                  </label>
                  <input
                    id="f-url"
                    className="nx-input"
                    value={currentForm.url}
                    placeholder="https://…"
                    onChange={(event) => setForm({ ...currentForm, url: event.target.value })}
                  />
                </div>

                <div className="nx-field">
                  <div className="nx-label-row">
                    <label className="nx-label" htmlFor="f-lan">
                      内网地址（可选）
                    </label>
                    <span style={{ fontSize: 11, color: 'var(--nx-text-3)' }}>仅后台与内网探测可见</span>
                  </div>
                  <input
                    id="f-lan"
                    className="nx-input"
                    value={currentForm.lanUrl}
                    placeholder="http://192.168.1.10:8080"
                    onChange={(event) => setForm({ ...currentForm, lanUrl: event.target.value })}
                  />
                </div>

                <div className="nx-field">
                  <label className="nx-label" htmlFor="f-desc">
                    描述
                  </label>
                  <input
                    id="f-desc"
                    className="nx-input"
                    value={currentForm.description}
                    onChange={(event) => setForm({ ...currentForm, description: event.target.value })}
                  />
                </div>

                <div className="nx-dual">
                  <div className="nx-field">
                    <label className="nx-label" htmlFor="f-group">
                      所属分组
                    </label>
                    <select
                      id="f-group"
                      className="nx-select"
                      value={currentForm.groupId}
                      onChange={(event) => setForm({ ...currentForm, groupId: event.target.value })}
                    >
                      {groups.map((group) => (
                        <option value={group.id} key={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="nx-field">
                    <label className="nx-label" htmlFor="f-icon-type">
                      图标类型
                    </label>
                    <select
                      id="f-icon-type"
                      className="nx-select"
                      value={currentForm.iconType}
                      onChange={(event) =>
                        setForm({ ...currentForm, iconType: event.target.value as ItemForm['iconType'] })
                      }
                    >
                      <option value="auto">自动抓取</option>
                      <option value="url">图片地址</option>
                      <option value="iconify">Iconify</option>
                      <option value="asset">上传图片</option>
                      <option value="text">文字首字母</option>
                    </select>
                  </div>
                </div>

                {(currentForm.iconType === 'url' || currentForm.iconType === 'iconify') && (
                  <div className="nx-field">
                    <label className="nx-label" htmlFor="f-icon-ref">
                      {currentForm.iconType === 'iconify' ? 'Iconify 名称' : '图片地址'}
                    </label>
                    <input
                      id="f-icon-ref"
                      className="nx-input"
                      value={currentForm.iconRef}
                      placeholder={currentForm.iconType === 'iconify' ? 'mdi:github' : 'https://.../logo.png'}
                      onChange={(event) => setForm({ ...currentForm, iconRef: event.target.value })}
                    />
                  </div>
                )}

                {currentForm.iconType === 'iconify' && (
                  <IconifyPicker onPick={(id) => setForm({ ...currentForm, iconRef: id })} />
                )}

                {currentForm.iconType === 'asset' && (
                  <div className="nx-field">
                    <label className="nx-label" htmlFor="f-icon-file">
                      图标文件
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="nx-table-icon">
                        {currentForm.iconPreview ? <img src={currentForm.iconPreview} alt="" /> : '—'}
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
                    <span style={{ fontSize: 11, color: 'var(--nx-text-3)' }}>
                      PNG / JPEG / WebP，不超过 512KB
                    </span>
                  </div>
                )}

                <div className="nx-field">
                  <label className="nx-label" htmlFor="f-tags">
                    标签（胶囊式，回车确认）
                  </label>
                  <TagInput
                    id="f-tags"
                    value={currentForm.tags}
                    onChange={(tags) => setForm({ ...currentForm, tags })}
                    availableTags={allTags}
                    placeholder="输入标签按回车确认…"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                  <Switch
                    id="f-open-in-new-tab"
                    checked={currentForm.openInNewTab}
                    onChange={(checked) => setForm({ ...currentForm, openInNewTab: checked })}
                    label="在新标签页中打开"
                    description="点击卡片时在新窗口/标签页中打开链接"
                  />
                  <Switch
                    id="f-pinned"
                    checked={currentForm.pinned}
                    onChange={(checked) => setForm({ ...currentForm, pinned: checked })}
                    label="分组内优先置顶"
                    description="高亮显示并在所属分组前排展示"
                  />
                </div>
              </div>

              <div className="nx-dialog-foot">
                <button type="button" className="nx-btn-secondary" onClick={() => setForm(null)}>
                  取消
                </button>
                <button type="button" className="nx-btn-primary" onClick={saveItem}>
                  <IconCheckCircle size={14} />
                  <span>保存</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 新建/编辑分组弹窗 */}
      {groupDialogMount.held && (() => {
        const currentGroup = groupDialogMount.held;
        return (
          <div
            className="nx-backdrop"
            data-exit={groupDialogMount.closing || undefined}
            onClick={() => setGroupDialog(null)}
          >
            <div
              className="nx-dialog"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={currentGroup.id ? '编辑分组' : '新建分组'}
              style={{ maxWidth: 440 }}
            >
              <div className="nx-dialog-head">
                <span className="nx-dialog-title">{currentGroup.id ? '编辑分组' : '新建分组'}</span>
                <button
                  type="button"
                  className="nx-dialog-close"
                  onClick={() => setGroupDialog(null)}
                  title="关闭"
                  aria-label="关闭"
                >
                  <IconClose size={15} />
                </button>
              </div>

              <div className="nx-dialog-body">
                <div className="nx-field">
                  <label className="nx-label" htmlFor="g-name">
                    分组名
                  </label>
                  <input
                    id="g-name"
                    className="nx-input"
                    value={currentGroup.name}
                    autoFocus
                    maxLength={40}
                    onChange={(event) => setGroupDialog({ ...currentGroup, name: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                      if (event.key === 'Enter') void createGroup();
                    }}
                    placeholder="例如：开发与基础设施"
                  />
                </div>

                <div className="nx-field">
                  <label className="nx-label" htmlFor="g-parent">
                    上级分组
                  </label>
                  <select
                    id="g-parent"
                    className="nx-select"
                    value={currentGroup.parentId ?? ''}
                    onChange={(event) =>
                      setGroupDialog({ ...currentGroup, parentId: event.target.value || null })
                    }
                  >
                    <option value="">无（根层级）</option>
                    {(() => {
                      const excluded = currentGroup.id
                        ? new Set(groupIdsUnder(currentGroup.id))
                        : new Set<string>();
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
                  <span style={{ fontSize: 11, color: 'var(--nx-text-3)' }}>
                    选择后该分组将作为其子目录，在前台层级树中缩发展现。
                  </span>
                </div>
              </div>

              <div className="nx-dialog-foot">
                <button type="button" className="nx-btn-secondary" onClick={() => setGroupDialog(null)}>
                  取消
                </button>
                <button type="button" className="nx-btn-primary" onClick={createGroup}>
                  <IconCheckCircle size={14} />
                  <span>保存</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 浏览器书签导入弹窗 */}
      {bookmarkMount.held && (
        <BookmarkImportModal
          initialFolders={bookmarkMount.held}
          exiting={bookmarkMount.closing}
          onClose={() => setPendingBookmarkFolders(null)}
          onImport={handleImportSelectedBookmarks}
        />
      )}

      {/* Toast 提示 */}
      {toast && (
        <div className="nx-toast-wrap">
          <div className="nx-toast">{toast}</div>
        </div>
      )}
    </div>
  );
}
