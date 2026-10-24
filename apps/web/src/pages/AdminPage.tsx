import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type AdminGroupDto, type AdminItemDto } from '../api';
import type { SessionUser } from '../types';
import { SortableList, DragHandle, useRowDrag } from '../components/SortableList';
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
  const palette = useMemo(() => getItemPalette(item.url, item.title), [item.url, item.title]);

  let src: string | null = null;
  if (item.icon.type === 'asset' && item.icon.ref) src = item.icon.ref;
  else if (item.icon.type === 'url' && item.icon.ref) src = item.icon.ref;
  else if (item.icon.type === 'iconify' && item.icon.ref) {
    src = `https://api.iconify.design/${item.icon.ref.replace(':', '/')}.svg?color=${encodeURIComponent(palette.color)}`;
  } else if (item.icon.type === 'auto') {
    try {
      const host = new URL(item.url).hostname;
      src = `https://icons.duckduckgo.com/ip3/${host}.ico`;
    } catch {
      src = null;
    }
  }

  const initial = item.title.trim().slice(0, 1).toUpperCase() || '·';

  return (
    <span
      className="admin-item-icon"
      data-has-image={src && loaded && !broken ? 'true' : 'false'}
      style={{
        color: palette.color,
        borderColor: `color-mix(in oklab, ${palette.color} 25%, var(--border))`,
        boxShadow: `0 1px 4px ${palette.subtleGlow}`,
      }}
    >
      {(!src || broken || !loaded) && <span>{initial}</span>}
      {src && !broken && (
        <img
          src={src}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
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
  const [groupDialog, setGroupDialog] = useState<{ id?: string; name: string; icon: string } | null>(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [pendingBookmarkFolders, setPendingBookmarkFolders] = useState<ParsedBookmarkFolder[] | null>(null);
  const bookmarkInputRef = useRef<HTMLInputElement>(null);

  const allTags = useMemo(() => Array.from(new Set(items.flatMap((item) => item.tags))).sort(), [items]);

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
      await load(activeGroup ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    }
  };

  const load = async (groupId?: string) => {
    setError('');
    try {
      const [groupResult, itemResult] = await Promise.all([api.groups(), api.items(groupId)]);
      setGroups(groupResult.items);
      setItems(itemResult.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  };

  useEffect(() => {
    void load(activeGroup ?? undefined);
  }, [activeGroup]);

  const createGroup = async () => {
    if (!groupDialog) return;
    const name = groupDialog.name.trim();
    if (!name) return;
    try {
      if (groupDialog.id) {
        await api.updateGroup(groupDialog.id, { name, icon: groupDialog.icon.trim() || null });
        flash('分组已更新');
      } else {
        const created = await api.createGroup({ name, icon: groupDialog.icon.trim() || null });
        flash('分组已创建');
        setActiveGroup(created.id);
      }
      setGroupDialog(null);
      await load(activeGroup ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const removeGroup = async (group: AdminGroupDto) => {
    const cascade = group.itemCount > 0
      ? window.confirm(`「${group.name}」下还有 ${group.itemCount} 个站点，删除会一并移除。继续？`)
      : window.confirm(`删除分组「${group.name}」？`);
    if (!cascade) return;
    try {
      await api.deleteGroup(group.id, group.itemCount > 0);
      flash('分组已删除');
      if (activeGroup === group.id) setActiveGroup(null);
      await load(activeGroup === group.id ? undefined : activeGroup ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const moveGroup = async (id: string, direction: -1 | 1) => {
    const index = groups.findIndex((group) => group.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= groups.length) return;
    const ordered = groups.map((group) => group.id);
    const moved = ordered.splice(index, 1)[0]!;
    ordered.splice(target, 0, moved);
    await applyGroupOrder(ordered);
  };

  /** Optimistic: repaint immediately, roll back to server state if the write fails. */
  const applyGroupOrder = async (ordered: string[]) => {
    const byId = new Map(groups.map((group) => [group.id, group]));
    setGroups(ordered.map((id) => byId.get(id)!).filter(Boolean));
    try {
      await api.reorderGroups(ordered);
    } catch (err) {
      setError(err instanceof Error ? err.message : '排序失败');
      await load(activeGroup ?? undefined);
    }
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
      await load(activeGroup ?? undefined);
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
      await load(activeGroup ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const removeItem = async (item: AdminItemDto) => {
    if (!window.confirm(`删除「${item.title}」？`)) return;
    try {
      await api.deleteItem(item.id);
      flash('站点已删除');
      await load(activeGroup ?? undefined);
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
      await load(activeGroup ?? undefined);
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
      await load(activeGroup ?? undefined);
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
        <div className="brand" style={{ marginBottom: 12 }}>
          <span className="brand-mark">P</span>
          PureNav 后台
        </div>

        <div className="side-item" aria-current={panel === 'items' && activeGroup === null}>
          <button
            className="btn-ghost btn btn-sm"
            style={{ padding: 0 }}
            onClick={() => {
              setPanel('items');
              setActiveGroup(null);
            }}
          >
            全部站点
          </button>
        </div>

        {groups.map((group) => (
          <div className="side-item" key={group.id} aria-current={panel === 'items' && activeGroup === group.id}>
            <button
              className="btn-ghost btn btn-sm"
              style={{ padding: 0, flex: 1, textAlign: 'left' }}
              onClick={() => {
                setPanel('items');
                setActiveGroup(group.id);
              }}
            >
              {group.name}
            </button>
            <span className="badge">{group.itemCount}</span>
          </div>
        ))}

        <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setGroupDialog({ name: '', icon: '' })}>
          + 新建分组
        </button>

        <div className="side-item" aria-current={panel === 'settings'} style={{ marginTop: 10 }}>
          <button className="btn-ghost btn btn-sm" style={{ padding: 0 }} onClick={() => setPanel('settings')}>
            站点设置
          </button>
        </div>

        <div className="side-item" aria-current={panel === 'account'}>
          <button className="btn-ghost btn btn-sm" style={{ padding: 0 }} onClick={() => setPanel('account')}>
            账户与日志
          </button>
        </div>

        <div className="spacer" />
        <div className="hint" style={{ marginBottom: 8 }}>
          {user.username}
        </div>
        <button className="btn btn-sm" onClick={onHome}>
          返回前台
        </button>
        <button className="btn btn-sm btn-ghost" onClick={logout}>
          退出登录
        </button>
      </aside>

      <main className="admin-main">
        {panel === 'settings' ? (
          <>
            <div className="admin-header">
              <h2>站点设置</h2>
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
              <h2>账户与日志</h2>
            </div>
            <AccountPage />
          </>
        ) : (
          <>
        <div className="admin-header">
          <h2>{activeGroup ? groups.find((group) => group.id === activeGroup)?.name ?? '分组' : '全部站点'}</h2>
          <span className="badge">{items.length} 个</span>
          <div className="spacer" />
          <div className="admin-header-actions">
            <button
              className="btn btn-sm"
              onClick={() => bookmarkInputRef.current?.click()}
              title="支持从 Chrome、Edge、Safari、Firefox 导出的 HTML 格式书签导入"
            >
              📥 导入书签
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

        {!activeGroup && groups.length > 0 && (
          <div className="sort-block">
            <h3 className="group-title" style={{ marginBottom: 8 }}>分组顺序</h3>
            <p className="hint" style={{ marginTop: -4 }}>拖动左侧把手调整顺序，也可用上移 / 下移按钮。</p>
            <SortableList
              items={groups}
              getId={(group) => group.id}
              onReorder={(ordered) => void applyGroupOrder(ordered)}
              className="sort-list"
              renderRow={(group, state) => (
                <>
                  <DragHandle handleProps={state.handleProps} />
                  <span className="sort-row-label">{group.name}</span>
                  <span className="badge">{group.itemCount}</span>
                  <span className="sort-row-actions">
                    <button className="btn btn-sm" onClick={() => moveGroup(group.id, -1)} aria-label="上移">↑</button>
                    <button className="btn btn-sm" onClick={() => moveGroup(group.id, 1)} aria-label="下移">↓</button>
                    <button className="btn btn-sm" onClick={() => setGroupDialog({ id: group.id, name: group.name, icon: group.icon ?? '' })}>编辑</button>
                    <button className="btn btn-sm btn-danger" onClick={() => removeGroup(group)}>删除</button>
                  </span>
                </>
              )}
            />
          </div>
        )}

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

        <table className="table admin-table">
          <thead>
            <tr>
              <th style={{ width: 34 }} aria-label="排序" />
              <th style={{ width: 34 }}>
                <input
                  type="checkbox"
                  aria-label="全选"
                  checked={items.length > 0 && selectedIds.size === items.length}
                  onChange={(event) => {
                    setSelectedIds(event.target.checked ? new Set(items.map((item) => item.id)) : new Set());
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
                {...(activeGroup
                  ? itemDrag.rowProps(item.id, item.enabled ? undefined : 'row-muted')
                  : { className: item.enabled ? undefined : 'row-muted' })}
              >
                <td>
                  <DragHandle
                    disabled={!activeGroup}
                    handleProps={{
                      draggable: !!activeGroup,
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
                    <span className="table-item-title">{item.title}</span>
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
                      item.tags.map((t) => (
                        <span key={t} className="badge">
                          {t}
                        </span>
                      ))
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
                  这里还没有站点
                </td>
              </tr>
            )}
          </tbody>
        </table>

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
              <input id="f-url" value={form.url} placeholder="https://example.com" onChange={(event) => setForm({ ...form, url: event.target.value })} />
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
                placeholder="🧰"
                onChange={(event) => setGroupDialog({ ...groupDialog, icon: event.target.value })}
              />
              <span className="hint">会显示在前台分组标题左侧。</span>
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
