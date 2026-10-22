import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { PublicConfig, PublicGroup, PublicItem } from '../types';
import { probeLanReachable, readLanChoice, resolveTarget, writeLanChoice } from '../lib/lan';

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

interface LanInfo {
  lanUrl: string;
  reachable: boolean;
  choice: 'lan' | 'public' | null;
}

function ItemCard({
  item,
  index,
  lan,
  onToggleLan,
}: {
  item: PublicItem;
  index: number;
  lan?: LanInfo;
  onToggleLan: (id: string, choice: 'lan' | 'public') => void;
}) {
  const icon = iconUrl(item);
  // The letter stays behind the image so a slow or blocked icon never leaves an empty box.
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);

  const usingLan = lan ? resolveTarget(item.id, item.url, lan.lanUrl, lan.reachable) === lan.lanUrl : false;
  const href = lan ? resolveTarget(item.id, item.url, lan.lanUrl, lan.reachable) : item.url;

  return (
    <a
      className="card pn-enter"
      style={{ '--stagger': Math.min(index, 8) } as React.CSSProperties}
      href={href}
      target={item.openInNewTab ? '_blank' : undefined}
      rel={item.openInNewTab ? 'noreferrer noopener' : undefined}
      title={lan && usingLan ? `${lan.lanUrl}（内网）` : (item.description ?? item.url)}
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
      {lan && (
        <button
          className={usingLan ? 'lan-toggle lan-on' : 'lan-toggle'}
          onClick={(event) => {
            // The button lives inside the link; without this the click navigates.
            event.preventDefault();
            event.stopPropagation();
            onToggleLan(item.id, usingLan ? 'public' : 'lan');
          }}
          title={usingLan ? '当前走内网，点击切换为外网' : '当前走外网，点击切换为内网'}
          aria-label={usingLan ? '切换为外网地址' : '切换为内网地址'}
        >
          {usingLan ? '内' : '外'}
        </button>
      )}
    </a>
  );
}

function GroupSection({
  group,
  query,
  visible,
  lanMap,
  onToggleLan,
}: {
  group: PublicGroup;
  query: string;
  visible: PublicItem[];
  lanMap: Map<string, LanInfo>;
  onToggleLan: (id: string, choice: 'lan' | 'public') => void;
}) {
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
            <ItemCard
              key={item.id}
              item={item}
              index={index}
              lan={lanMap.get(item.id)}
              onToggleLan={onToggleLan}
            />
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
  const [lanMap, setLanMap] = useState<Map<string, LanInfo>>(new Map());
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

  // LAN URLs only exist for a signed-in admin, so this request is a no-op for visitors.
  useEffect(() => {
    if (!authenticated) {
      setLanMap(new Map());
      return;
    }

    let cancelled = false;
    void api
      .adminConfig()
      .then(async (adminConfig) => {
        const entries = Object.entries(adminConfig.items).filter(([, value]) => value.lanUrl);
        const settled = await Promise.all(
          entries.map(async ([id, value]) => {
            const lanUrl = value.lanUrl!;
            const reachable = await probeLanReachable(lanUrl);
            return [id, { lanUrl, reachable, choice: readLanChoice(id) }] as const;
          }),
        );
        if (cancelled) return;
        setLanMap(new Map(settled));
      })
      .catch(() => {
        // A failed admin config just means no LAN switching; never block the page.
      });

    return () => {
      cancelled = true;
    };
  }, [authenticated, config?.version]);

  const onToggleLan = (id: string, choice: 'lan' | 'public') => {
    writeLanChoice(id, choice);
    setLanMap((current) => {
      const next = new Map(current);
      const entry = next.get(id);
      if (entry) next.set(id, { ...entry, choice });
      return next;
    });
  };

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
          <GroupSection
            key={group.id}
            group={group}
            query={query}
            visible={visible}
            lanMap={lanMap}
            onToggleLan={onToggleLan}
          />
        ))}
    </div>
  );
}
