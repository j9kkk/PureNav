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
  'item.create': '添加书签',
  'item.update': '更新书签',
  'item.delete': '删除书签',
  'item.reorder': '书签排序',
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
  return date.toLocaleString('zh-CN', { hour12: false });
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
  const [busy, setBusy] = useState(false);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2400);
  };

  const loadSessions = async () => {
    try {
      const result = await api.sessions();
      setSessions(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载设备列表失败');
    }
  };

  const loadLogs = async (nextCursor?: string) => {
    try {
      const page = await api.auditLogs(nextCursor);
      setLogs((existing) => (nextCursor ? [...existing, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载审计日志失败');
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
    setBusy(true);
    try {
      await api.changePassword(current, next);
      flash('密码已更新，其它设备已退出');
      setCurrent('');
      setNext('');
      setConfirm('');
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改密码失败');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await api.revokeSession(id);
      flash('已强制退出该设备');
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  return (
    <div style={{ maxWidth: 920, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <div className="nx-alert-error" role="alert">
          {error}
        </div>
      )}

      {/* 1. 修改管理员密码 */}
      <div className="nx-settings-card">
        <div className="nx-settings-head">
          <span className="nx-settings-title">修改管理员密码</span>
          <span className="nx-settings-desc">
            更新管理员登录安全凭证。更新成功后，其它活跃设备将自动登出下线。
          </span>
        </div>
        <div className="nx-settings-body">
          <form onSubmit={changePassword} style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="nx-field">
              <label className="nx-label" htmlFor="a-current">
                当前密码
              </label>
              <input
                id="a-current"
                type="password"
                className="nx-input"
                autoComplete="current-password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                required
              />
            </div>

            <div className="nx-field">
              <div className="nx-label-row">
                <label className="nx-label" htmlFor="a-next">
                  新密码
                </label>
                <span style={{ fontSize: 11, color: 'var(--nx-text-3)' }}>至少 8 位</span>
              </div>
              <input
                id="a-next"
                type="password"
                className="nx-input"
                autoComplete="new-password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                required
                minLength={8}
              />
            </div>

            <div className="nx-field">
              <label className="nx-label" htmlFor="a-confirm">
                确认新密码
              </label>
              <input
                id="a-confirm"
                type="password"
                className="nx-input"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />
            </div>

            <div style={{ paddingTop: 4 }}>
              <button type="submit" className="nx-btn-primary" disabled={busy}>
                {busy ? '正在更新…' : '更新密码'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* 2. 活跃登录设备 */}
      <div className="nx-settings-card">
        <div className="nx-settings-head">
          <span className="nx-settings-title">活跃登录设备（Sessions）</span>
          <span className="nx-settings-desc">
            当前账号在所有客户端与浏览器上的活跃会话凭证，可单独强制登出任一设备。
          </span>
        </div>
        <div className="nx-settings-body">
          <div className="nx-table-card">
            <table className="nx-table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>来源 IP</th>
                  <th>客户端 (User-Agent)</th>
                  <th style={{ width: 160 }}>最近活动时间</th>
                  <th style={{ width: 80, textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <code style={{ fontSize: 12, color: 'var(--nx-text)' }}>{session.ip ?? '—'}</code>
                    </td>
                    <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span title={session.userAgent ?? undefined}>{session.userAgent ?? '—'}</span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--nx-text-2)' }}>
                      {formatTime(session.lastSeenAt ?? session.createdAt)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="nx-btn-secondary nx-btn-sm"
                        onClick={() => revoke(session.id)}
                      >
                        退出
                      </button>
                    </td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--nx-text-3)', padding: 24 }}>
                      没有其它活跃会话
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. 操作审计日志 */}
      <div className="nx-settings-card">
        <div className="nx-settings-head">
          <span className="nx-settings-title">操作审计日志（Audit Logs）</span>
          <span className="nx-settings-desc">
            管理员在后台执行的关键增删改查审计追踪日志，严格按操作时间倒序排列。
          </span>
        </div>
        <div className="nx-settings-body">
          <div className="nx-table-card">
            <table className="nx-table">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>操作时间</th>
                  <th style={{ width: 120 }}>操作类型</th>
                  <th>目标对象</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ fontSize: 12, color: 'var(--nx-text-2)' }}>
                      {formatTime(entry.created_at)}
                    </td>
                    <td>
                      <span className="nx-badge">
                        {labelFor(entry.action)}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--nx-text-2)' }}>
                      {entry.entity_type ? `${entry.entity_type} (${entry.entity_id ?? '—'})` : '—'}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', color: 'var(--nx-text-3)', padding: 24 }}>
                      暂无操作记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {cursor && (
            <div>
              <button
                type="button"
                className="nx-btn-secondary nx-btn-sm"
                onClick={() => void loadLogs(cursor)}
              >
                加载更多日志
              </button>
            </div>
          )}
        </div>
      </div>

      {notice && (
        <div className="nx-toast-wrap">
          <div className="nx-toast">{notice}</div>
        </div>
      )}
    </div>
  );
}
