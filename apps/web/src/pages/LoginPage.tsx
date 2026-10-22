import { useState } from 'react';
import { api } from '../api';
import type { SessionUser } from '../types';

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
    <div className="auth-wrap">
      <form className="auth-card pn-enter" onSubmit={submit}>
        <h1>{needsSetup ? '初始化 PureNav' : '登录后台'}</h1>
        <p className="sub">{needsSetup ? '首次启动，请创建管理员账号。' : '仅管理员可以编辑导航内容。'}</p>

        {error && <p className="error-text">{error}</p>}

        <div className="field">
          <label htmlFor="username">用户名</label>
          <input
            id="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoFocus
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">密码</label>
          <input
            id="password"
            type="password"
            autoComplete={needsSetup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={needsSetup ? 8 : 1}
          />
          {needsSetup && <span className="hint">至少 8 位</span>}
        </div>

        {needsSetup && (
          <div className="field">
            <label htmlFor="confirm">确认密码</label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            返回首页
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? '处理中…' : needsSetup ? '创建管理员' : '登录'}
          </button>
        </div>
      </form>
    </div>
  );
}
