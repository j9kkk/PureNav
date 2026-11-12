import { useEffect, useState } from 'react';
import { api } from '../api';
import type { SessionUser } from '../types';
import { BrandMark } from '../components/BrandMark';
import { applyTheme, resolveTheme, type ThemeMode } from '../lib/theme';

interface Props {
  needsSetup: boolean;
  onDone: (user: SessionUser) => void;
  onCancel: () => void;
}

export function LoginPage({ needsSetup, onDone, onCancel }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 明暗由站点统一决定：登录页只是把站点主题画上去，不提供访客本地切换。
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => resolveTheme(undefined));

  useEffect(() => {
    void api
      .publicConfig()
      .then((config) => {
        applyTheme(config.site);
        setThemeMode(resolveTheme(config.site.theme.mode));
      })
      .catch(() => {
        /* 站点配置拿不到时沿用系统偏好，不影响登录 */
      });
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (needsSetup && password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }

    setBusy(true);
    try {
      const result = needsSetup ? await api.setup(username, password) : await api.login(username, password);
      onDone(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nx-app" data-theme={themeMode}>
      <div className="nx-auth-wrap">
        <form className="nx-auth-card" onSubmit={submit}>
          <div className="nx-auth-brand">
            <span className="nx-auth-brand-mark">
              <BrandMark size={26} />
            </span>
            <span className="nx-auth-brand-name">PureNav</span>
          </div>

          <h1 className="nx-auth-title">{needsSetup ? '初始化 PureNav' : '登录管理后台'}</h1>
          <p className="nx-auth-sub">
            {needsSetup ? '首次启动，请创建管理员账号。' : '仅管理员可以编辑与管理收藏夹。'}
          </p>

          {error && (
            <div className="nx-alert-error" role="alert">
              {error}
            </div>
          )}

          <div className="nx-field">
            <label className="nx-label" htmlFor="username">
              用户名
            </label>
            <input
              id="username"
              className="nx-input"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="nx-field">
            <div className="nx-label-row">
              <label className="nx-label" htmlFor="password">
                密码
              </label>
              {needsSetup && <span style={{ fontSize: 11, color: 'var(--nx-text-3)' }}>至少 8 位</span>}
            </div>
            <input
              id="password"
              type="password"
              className="nx-input"
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={needsSetup ? 8 : 1}
            />
          </div>

          {needsSetup && (
            <div className="nx-field">
              <label className="nx-label" htmlFor="confirm">
                确认密码
              </label>
              <input
                id="confirm"
                type="password"
                className="nx-input"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />
            </div>
          )}

          <div className="nx-auth-actions">
            <button type="button" className="nx-btn-secondary" onClick={onCancel}>
              返回前台
            </button>
            <button type="submit" className="nx-btn-primary" disabled={busy}>
              {busy ? '处理中…' : needsSetup ? '创建管理员' : '登录'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
