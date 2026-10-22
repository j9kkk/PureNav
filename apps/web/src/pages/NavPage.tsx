import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { PublicConfig, PublicGroup, PublicItem } from '../types';

const SNAPSHOT_KEY = 'pn.config.snapshot';

interface Props {
  theme: 'light' | 'dark';
  authenticated: boolean;
  onToggleTheme: () => void;
  onAdmin: () => void;
  onLogin: () => void;
}

function readSnapshot(): PublicConfig | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as PublicConfig) : null;
  } catch {
    return null;
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function itemMatches(item: PublicItem, query: string): boolean {
  if (!query) return true;
  const needle = normalize(query);
  return (
    normalize(item.title).includes(needle) ||
    normalize(item.url).includes(needle) ||
    normalize(item.description ?? '').includes(needle) ||
    item.tags.some((tag) => normalize(tag).includes(needle))
  );
}

function iconUrl(item: PublicItem): string | null {
  if (item.icon.type === 'asset' && item.icon.ref) return item.icon.ref;
  if (item.icon.type === 'url' && item.icon.ref) return item.icon.ref;
  if (item.icon.type === 'iconify' && item.icon.ref) {
    return `https://api.iconify.design/${item.icon.ref.replace(':', '/')}.svg`;
  }
  if (item.icon.type === 'auto') {
    try {
      const host = new URL(item.url).hostname;
      return `https://icons.duckduckgo.com/ip3/${host}.ico`;
    } catch {
      return null;
    }
  }
  return null;
}

function initial(title: string): string {
  return title.trim().slice(0, 1).toUpperCase() || '·';
}

function ItemCard({ item, index }: { item: PublicItem; index: number }) {
  const icon = iconUrl(item);
  // The letter stays behind the image so a slow or blocked icon never leaves an empty box.
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);

  return (
    <a
      className="card pn-enter"
      style={{ '--stagger': Math.min(index, 8) } as React.CSSProperties}
      href={item.url}
      target={item.openInNewTab ? '_blank' : undefined}
      rel={item.openInNewTab ? 'noreferrer noopener' : undefined}
      title={item.description ?? item.url}
    >
      {item.pinned && <span className="pin">●</span>}
      <span className="card-icon">
        {initial(item.title)}
        {icon && !broken && (
          <img
            src={icon}
            alt=""
            loading="lazy"
            data-loaded={loaded}
            onLoad={() => setLoaded(true)}
            onError={() => setBroken(true)}
          />
        )}
      </span>
      <span className="card-body">
        <span className="card-title">{item.title}</span>
        {item.description && <span className="card-desc">{item.description}</span>}
      </span>
    </a>
  );
}

function GroupSection({ group, query, visible }: { group: PublicGroup; query: string; visible: PublicItem[] }) {
  const [collapsed, setCollapsed] = useState(group.collapsed);

  if (query && visible.length === 0) return null;

  return (
    <section className="group">
      <div className="group-head">
        <button
          className="btn-ghost btn btn-sm"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <h2 className="group-title">{group.name}</h2>
        <span className="group-count">{visible.length}</span>
      </div>
      {!collapsed && (
        <div className="grid pn-fade">
          {visible.map((item, index) => (
            <ItemCard key={item.id} item={item} index={index} />
          ))}
        </div>
      )}
    </section>
  );
}

export function NavPage({ theme, authenticated, onToggleTheme, onAdmin, onLogin }: Props) {
  const [config, setConfig] = useState<PublicConfig | null>(() => readSnapshot());
  const [loading, setLoading] = useState(() => readSnapshot() === null);
  const [offline, setOffline] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .publicConfig()
      .then((next) => {
        if (cancelled) return;
        setConfig(next);
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(next));
        setOffline(false);
      })
      .catch(() => {
        if (!cancelled) setOffline(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const identity = config?.site.identity;
    document.title = identity?.title ?? 'PureNav';
  }, [config?.site.identity]);

  const groups = useMemo(() => {
    if (!config) return [];
    return config.groups.map((group) => ({
      group,
      visible: group.items.filter((item) => itemMatches(item, query)),
    }));
  }, [config, query]);

  const totalVisible = groups.reduce((sum, entry) => sum + entry.visible.length, 0);
  const isEmpty = config !== null && config.groups.length === 0;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">P</span>
          {config?.site.identity.title ?? 'PureNav'}
        </div>
        <div className="spacer" />
        <div className="search">
          <span className="search-icon">⌕</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索站点  /"
            aria-label="搜索站点"
          />
        </div>
        <button className="icon-btn" onClick={onToggleTheme} aria-label="切换主题" title="切换主题">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <button className="icon-btn" onClick={authenticated ? onAdmin : onLogin} aria-label="管理后台" title="管理后台">
          ⚙
        </button>
      </header>

      {offline && <p className="hint" style={{ marginTop: -12, marginBottom: 18 }}>当前展示的是离线缓存</p>}

      {loading && (
        <div className="skeleton-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="skeleton-card" key={index} />
          ))}
        </div>
      )}

      {!loading && isEmpty && (
        <div className="empty pn-fade">
          <h2>还没有任何导航</h2>
          <p>进入后台添加分组与站点，这里会立刻出现。</p>
          <button className="btn btn-primary" onClick={authenticated ? onAdmin : onLogin}>
            前往后台
          </button>
        </div>
      )}

      {!loading && !isEmpty && totalVisible === 0 && (
        <div className="empty pn-fade">
          <h2>没有匹配「{query}」的结果</h2>
          <p>换个关键词，或清空搜索。</p>
          <button className="btn" onClick={() => setQuery('')}>
            清空搜索
          </button>
        </div>
      )}

      {!loading &&
        groups.map(({ group, visible }) => (
          <GroupSection key={group.id} group={group} query={query} visible={visible} />
        ))}
    </div>
  );
}
