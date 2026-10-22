import { useEffect, useState } from 'react';
import { api, type AdminGroupDto, type AdminItemDto } from '../api';
import type { SessionUser } from '../types';

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
  iconType: 'auto' | 'url' | 'iconify' | 'text';
  iconRef: string;
  tags: string;
}

const EMPTY_FORM = (groupId: string): ItemForm => ({
  groupId,
  title: '',
  url: '',
  lanUrl: '',
  description: '',
  iconType: 'auto',
  iconRef: '',
  tags: '',
});

export function AdminPage({ user, onHome, onLoggedOut }: Props) {
  const [groups, setGroups] = useState<AdminGroupDto[]>([]);
  const [items, setItems] = useState<AdminItemDto[]>([]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [form, setForm] = useState<ItemForm | null>(null);
  const [groupDialog, setGroupDialog] = useState<{ id?: string; name: string } | null>(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
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
        await api.updateGroup(groupDialog.id, { name });
        flash('分组已更新');
      } else {
        const created = await api.createGroup({ name });
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
    setGroups(ordered.map((gid) => groups.find((group) => group.id === gid)!));
    try {
      await api.reorderGroups(ordered);
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
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      icon:
        form.iconType === 'url' || form.iconType === 'iconify'
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
    try {
      await api.reorderItems(groupId, ordered);
      await load(activeGroup ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : '排序失败');
    }
  };

  const toggleItem = async (item: AdminItemDto) => {
    try {
      await api.updateItem(item.id, { enabled: !item.enabled });
      await load(activeGroup ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const logout = async () => {
    await api.logout().catch(() => undefined);
    onLoggedOut();
  };

  const openEdit = (item: AdminItemDto) => {
    setForm({
      id: item.id,
      groupId: item.groupId,
      title: item.title,
      url: item.url,
      lanUrl: item.lanUrl ?? '',
      description: item.description ?? '',
      iconType: item.icon.type === 'asset' ? 'auto' : (item.icon.type as ItemForm['iconType']),
      iconRef: item.icon.ref ?? '',
      tags: item.tags.join(', '),
    });
  };

  const visibleGroups = activeGroup ? groups.filter((group) => group.id === activeGroup) : groups;

  return (
    <div className="admin-layout">
      <aside className="admin-side">
        <div className="brand" style={{ marginBottom: 12 }}>
          <span className="brand-mark">P</span>
          PureNav 后台
        </div>

        <div className="side-item" aria-current={activeGroup === null}>
          <button className="btn-ghost btn btn-sm" style={{ padding: 0 }} onClick={() => setActiveGroup(null)}>
            全部站点
          </button>
        </div>

        {groups.map((group) => (
          <div className="side-item" key={group.id} aria-current={activeGroup === group.id}>
            <button className="btn-ghost btn btn-sm" style={{ padding: 0, flex: 1, textAlign: 'left' }} onClick={() => setActiveGroup(group.id)}>
              {group.name}
            </button>
            <span className="badge">{group.itemCount}</span>
          </div>
        ))}

        <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setGroupDialog({ name: '' })}>
          + 新建分组
        </button>

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
        <div className="admin-header">
          <h2>{activeGroup ? groups.find((group) => group.id === activeGroup)?.name ?? '分组' : '全部站点'}</h2>
          <span className="badge">{items.length} 个</span>
          <div className="spacer" />
          <button
            className="btn btn-primary"
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

        {error && <p className="error-text">{error}</p>}

        {!activeGroup && groups.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <h3 className="group-title" style={{ marginBottom: 8 }}>分组顺序</h3>
            {groups.map((group) => (
              <div key={group.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
                <span style={{ flex: 1 }}>{group.name}</span>
                <button className="btn btn-sm" onClick={() => moveGroup(group.id, -1)} aria-label="上移">↑</button>
                <button className="btn btn-sm" onClick={() => moveGroup(group.id, 1)} aria-label="下移">↓</button>
                <button className="btn btn-sm" onClick={() => setGroupDialog({ id: group.id, name: group.name })}>改名</button>
                <button className="btn btn-sm btn-danger" onClick={() => removeGroup(group)}>删除</button>
              </div>
            ))}
          </div>
        )}

        <table className="table">
          <thead>
            <tr>
              <th>标题</th>
              <th>地址</th>
              <th>分组</th>
              <th>标签</th>
              <th style={{ width: 200 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={item.enabled ? undefined : 'row-muted'}>
                <td>{item.title}</td>
                <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.url}
                  {item.lanUrl && (
                    <>
                      {' '}
                      <span className="badge badge-lan">内网</span>
                    </>
                  )}
                </td>
                <td>{groups.find((group) => group.id === item.groupId)?.name ?? '—'}</td>
                <td>{item.tags.join(', ') || '—'}</td>
                <td>
                  <button className="btn btn-sm" onClick={() => moveItem(item.id, -1)} aria-label="上移">↑</button>{' '}
                  <button className="btn btn-sm" onClick={() => moveItem(item.id, 1)} aria-label="下移">↓</button>{' '}
                  <button className="btn btn-sm" onClick={() => openEdit(item)}>编辑</button>{' '}
                  <button className="btn btn-sm" onClick={() => toggleItem(item)}>{item.enabled ? '停用' : '启用'}</button>{' '}
                  <button className="btn btn-sm btn-danger" onClick={() => removeItem(item)}>删除</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                  这里还没有站点
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {visibleGroups.length === 0 && groups.length === 0 && (
          <p className="hint" style={{ marginTop: 16 }}>先创建一个分组，然后就能添加站点了。</p>
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

            <div className="field">
              <label htmlFor="f-tags">标签（逗号分隔）</label>
              <input id="f-tags" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
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
            <h3>{groupDialog.id ? '重命名分组' : '新建分组'}</h3>
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
            <div className="modal-actions">
              <button className="btn" onClick={() => setGroupDialog(null)}>取消</button>
              <button className="btn btn-primary" onClick={createGroup}>保存</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
