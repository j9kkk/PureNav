import { useEffect, useState } from 'react';
import { api, type AuthState } from './api';
import { NavPage } from './pages/NavPage';
import { LoginPage } from './pages/LoginPage';
import { AdminPage } from './pages/AdminPage';

type Route = { name: 'home' } | { name: 'login' } | { name: 'admin' };

function parseRoute(pathname: string): Route {
  if (pathname.startsWith('/login')) return { name: 'login' };
  if (pathname.startsWith('/admin')) return { name: 'admin' };
  return { name: 'home' };
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    void api.authState().then(setAuth).catch(() => setAuth({ needsSetup: false, authenticated: false, user: null }));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const navigate = (next: Route) => {
    const path = next.name === 'home' ? '/' : `/${next.name}`;
    window.history.pushState({}, '', path);
    setRoute(next);
  };

  const toggleTheme = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'));

  if (route.name === 'login') {
    return (
      <LoginPage
        needsSetup={auth?.needsSetup ?? false}
        onDone={(user) => {
          setAuth({ needsSetup: false, authenticated: true, user });
          navigate({ name: 'admin' });
        }}
        onCancel={() => navigate({ name: 'home' })}
      />
    );
  }

  if (route.name === 'admin') {
    if (!auth) return <div className="auth-wrap">加载中…</div>;
    if (!auth.authenticated) {
      return (
        <LoginPage
          needsSetup={auth.needsSetup}
          onDone={(user) => {
            setAuth({ needsSetup: false, authenticated: true, user });
          }}
          onCancel={() => navigate({ name: 'home' })}
        />
      );
    }
    return (
      <AdminPage
        user={auth.user!}
        onHome={() => navigate({ name: 'home' })}
        onLoggedOut={() => {
          setAuth({ needsSetup: false, authenticated: false, user: null });
          navigate({ name: 'home' });
        }}
      />
    );
  }

  return (
    <NavPage
      theme={theme}
      onToggleTheme={toggleTheme}
      authenticated={auth?.authenticated ?? false}
      onAdmin={() => navigate({ name: 'admin' })}
      onLogin={() => navigate({ name: 'login' })}
    />
  );
}
