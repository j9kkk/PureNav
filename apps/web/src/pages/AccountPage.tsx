import { useEffect, useState } from 'react';
import { api, type AuditLogEntry, type SessionInfo } from '../api';

const ACTION_LABELS: Record<string, string> = {
  'auth.login': '登录',
  'auth.logout': '登出',
  'auth.setup': '初始化管理员',
  'auth.password_changed': '修改密码',
  'group.create': '创建分组',
  'group.update': '更新分组',
  'group.delete': '删除分组',
  'group.reorder': '分组排序',
  'item.create': '添加站点',
  'item.update': '更新站点',
  'item.delete': '删除站点',
  'item.reorder': '站点排序',
  'item.batch_enable': '批量启用',
  'item.batch_disable': '批量停用',
  'item.batch_delete': '批量删除',
  'item.batch_move': '批量移动',
  'settings.update': '更新设置',
  'asset.upload': '上传图标',
  import: '导入数据',
};

function labelFor(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function AccountPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2400);
  };

  const loadSessions = async () => {
    try {
      setSessions((await api.sessions()).items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  };

  const loadLogs = async (nextCursor?: string) => {
    try {
      const page = await api.auditLogs(nextCursor);
      setLogs((existing) => (nextCursor ? [...existing, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  };

  useEffect(() => {
    void loadSessions();
    void loadLogs();
  }, []);

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (next !== confirm) {
      setError('两次输入的新密码不一致');
      return;
    }
    if (next.length < 8) {
      setError('新密码至少 8 位');
      return;
    }
    try {
      await api.changePassword(current, next);
      flash('密码已更新，其它设备已退出');
      setCurrent('');
      setNext('');
      setConfirm('');
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败');
    }
  };

  const revoke = async (id: string) => {
    try {
      await api.revokeSession(id);
      flash('已退出该设备');
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  return (
    <div style={{ maxWidth: 680 }}>
      {error && <p className="error-text">{error}</p>}

      <h3 className="group-title">修改密码</h3>
      <form onSubmit={changePassword} style={{ maxWidth: 380 }}>
        <div className="field">
          <label htmlFor="a-current">当前密码</label>
          <input
            id="a-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="a-next">新密码</label>
          <input
            id="a-next"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            required
          />
          <span className="hint">至少 8 位</span>
        </div>
        <div className="field">
          <label htmlFor="a-confirm">确认新密码</label>
          <input
            id="a-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary">
          更新密码
        </button>
      </form>

      <h3 className="group-title" style={{ marginTop: 30 }}>登录设备</h3>
      <p className="hint" style={{ marginTop: -6 }}>修改密码后，除当前设备外的会话会全部失效。</p>
      <table className="table">
        <thead>
          <tr>
            <th>来源 IP</th>
            <th>客户端</th>
            <th>最近活动</th>
            <th style={{ width: 90 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.id}>
              <td>{session.ip ?? '—'}</td>
              <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {session.userAgent ?? '—'}
              </td>
              <td>{formatTime(session.lastSeenAt ?? session.createdAt)}</td>
              <td>
                <button className="btn btn-sm btn-danger" onClick={() => revoke(session.id)}>
                  退出
                </button>
              </td>
            </tr>
          ))}
          {sessions.length === 0 && (
            <tr>
              <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                没有其它会话
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 className="group-title" style={{ marginTop: 30 }}>操作日志</h3>
      <table className="table">
        <thead>
          <tr>
            <th>时间</th>
            <th>操作</th>
            <th>对象</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((entry) => (
            <tr key={entry.id}>
              <td>{formatTime(entry.created_at)}</td>
              <td>{labelFor(entry.action)}</td>
              <td className="hint">{entry.entity_type ?? '—'}</td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr>
              <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                暂无记录
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {cursor && (
        <button className="btn btn-sm" onClick={() => void loadLogs(cursor)}>
          加载更多
        </button>
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}
