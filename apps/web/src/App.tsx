import { useEffect, useState } from 'react';
import { api, type AuthState } from './api';
import { NavPage } from './pages/NavPage';
import { LoginPage } from './pages/LoginPage';
import { applyTheme } from './lib/theme';
import { refreshLiquidGlass } from './lib/liquidGlass';

type Route = { name: 'home' } | { name: 'login' };

function parseRoute(pathname: string): Route {
  if (pathname.startsWith('/login')) return { name: 'login' };
  return { name: 'home' };
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [auth, setAuth] = useState<AuthState | null>(null);

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    void api.authState().then(setAuth).catch(() => setAuth({ needsSetup: false, authenticated: false, user: null }));
  }, []);

  // Apply the stored theme immediately, before any config request returns, so the
  // page does not flash the wrong palette.
  useEffect(() => {
    applyTheme(undefined);
  }, []);

  // 玻璃滤镜跟元素尺寸绑定：路由 / 主题 / 内容变化后都要重新量一次
  useEffect(() => {
    const id = requestAnimationFrame(() => refreshLiquidGlass());
    return () => cancelAnimationFrame(id);
  });

  const navigate = (next: Route) => {
    const path = next.name === 'home' ? '/' : `/${next.name}`;
    window.history.pushState({}, '', path);
    setRoute(next);
  };

  // 旧后台/设置/账户地址已合并进单页，命中时直接落回工作台，不留死路由
  useEffect(() => {
    if (/^\/(admin|settings|account)/.test(window.location.pathname)) {
      window.history.replaceState({}, '', '/');
      setRoute({ name: 'home' });
    }
  }, []);

  if (route.name === 'login') {
    return (
      <LoginPage
        needsSetup={auth?.needsSetup ?? false}
        onDone={(user) => {
          setAuth({ needsSetup: false, authenticated: true, user });
          navigate({ name: 'home' });
        }}
        onCancel={() => navigate({ name: 'home' })}
      />
    );
  }

  if (!auth) {
    return (
      <div
        className="nx-app"
        style={{
          display: 'grid',
          placeItems: 'center',
          height: '100vh',
          background: 'var(--nx-canvas)',
          color: 'var(--nx-text-3)',
          fontSize: 13,
        }}
      >
        加载中…
      </div>
    );
  }

  return (
    <NavPage
      authenticated={auth.authenticated}
      onLogin={() => navigate({ name: 'login' })}
      onLoggedOut={() => setAuth({ needsSetup: false, authenticated: false, user: null })}
    />
  );
}
