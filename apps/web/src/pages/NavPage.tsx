import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { PublicConfig, PublicGroup, PublicItem } from '../types';
import { probeLanReachable, readLanChoice, resolveTarget, writeLanChoice } from '../lib/lan';
import { formatDisplayHost } from '../lib/punycode';
import { getItemPalette, getGroupPalette, type GroupPalette } from '../lib/color';
import {
  applyTheme,
  layoutAttributes,
  readThemeOverride,
  resolveTheme,
  writeThemeOverride,
  type ThemeMode,
} from '../lib/theme';

const SNAPSHOT_KEY = 'pn.config.snapshot';

interface Props {
  authenticated: boolean;
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

function itemMatches(item: PublicItem, query: string, activeTag: string | null): boolean {
  if (activeTag && !item.tags.some((tag) => normalize(tag) === normalize(activeTag))) {
    return false;
  }
  if (!query) return true;
  const needle = normalize(query);
  return (
    normalize(item.title).includes(needle) ||
    normalize(item.url).includes(needle) ||
    normalize(item.description ?? '').includes(needle) ||
    item.tags.some((tag) => normalize(tag).includes(needle))
  );
}

function iconUrl(item: PublicItem, color?: string): string | null {
  if (item.icon.type === 'asset' && item.icon.ref) return item.icon.ref;
  if (item.icon.type === 'url' && item.icon.ref) return item.icon.ref;
  if (item.icon.type === 'iconify' && item.icon.ref) {
    const base = `https://api.iconify.design/${item.icon.ref.replace(':', '/')}.svg`;
    return color ? `${base}?color=${encodeURIComponent(color)}` : base;
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

function cleanGroupName(name: string, hasIcon: boolean): string {
  if (!hasIcon) return name;
  return name.replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji}\uFE0F\s]+/u, '').trim() || name;
}

const WEEK_DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

function formatClock(d: Date = new Date()): { time: string; date: string; full: string } {
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const week = WEEK_DAYS[d.getDay()] ?? '';
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');

  return {
    time: `${hours}:${minutes}`,
    date: `${month}月${day}日 ${week}`,
    full: `${month}月${day}日 ${week} ${hours}:${minutes}`,
  };
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
  showDescription,
  selected,
}: {
  item: PublicItem;
  index: number;
  lan?: LanInfo;
  onToggleLan: (id: string, choice: 'lan' | 'public') => void;
  showDescription: boolean;
  selected: boolean;
}) {
  const palette = useMemo(() => getItemPalette(item.url, item.title), [item.url, item.title]);
  const icon = useMemo(() => iconUrl(item, palette.color), [item, palette.color]);
  // The letter stays behind the image so a slow or blocked icon never leaves an empty box.
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);

  const usingLan = lan ? resolveTarget(item.id, item.url, lan.lanUrl, lan.reachable) === lan.lanUrl : false;
  const href = lan ? resolveTarget(item.id, item.url, lan.lanUrl, lan.reachable) : item.url;
  const hostname = formatDisplayHost(usingLan && lan ? lan.lanUrl : item.url);

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty('--mouse-x', `${x}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${y}px`);
  };

  return (
    <a
      className="card pn-enter"
      style={
        {
          '--stagger': Math.min(index, 8),
          '--card-hue': palette.hue,
          '--card-color': palette.color,
          '--card-glow': palette.glow,
          '--card-subtle': palette.subtleGlow,
        } as React.CSSProperties
      }
      href={href}
      target={item.openInNewTab ? '_blank' : undefined}
      rel={item.openInNewTab ? 'noreferrer noopener' : undefined}
      title={lan && usingLan ? `${lan.lanUrl}（内网）` : (item.description ?? item.url)}
      data-item-id={item.id}
      data-selected={selected || undefined}
      aria-current={selected || undefined}
      onMouseMove={handleMouseMove}
    >
      <span className="card-arrow" aria-hidden="true">↗</span>

      <div className="card-main">
        <span className="card-icon" data-has-image={icon && loaded && !broken ? 'true' : 'false'}>
          {(!icon || broken || !loaded) && (
            <span className="card-icon-initial">{initial(item.title)}</span>
          )}
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
          <span className="card-title">
            {item.title}
            {item.pinned && (
              <span className="pin-badge" title="置顶推荐">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.923-1.414.728-.195-.195.533-1.22.728-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z" />
                </svg>
                <span>置顶</span>
              </span>
            )}
          </span>
          {showDescription && item.description ? (
            <span className="card-desc">{item.description}</span>
          ) : (
            <span className="card-host" title={href}>{hostname}</span>
          )}
        </span>
      </div>

      {(item.tags.length > 0 || lan) && (
        <div className="card-footer">
          {item.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="card-tag">
              {tag}
            </span>
          ))}
          {lan && (
            <button
              className="lan-pill"
              data-using-lan={usingLan ? 'true' : 'false'}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleLan(item.id, usingLan ? 'public' : 'lan');
              }}
              title={usingLan ? '当前直连内网地址（点击切换公网）' : '当前访问公网地址（点击切换内网）'}
              aria-label={usingLan ? '切换为公网地址' : '切换为内网地址'}
            >
              <span className="lan-dot" />
              <span>{usingLan ? '内网' : '外网'}</span>
            </button>
          )}
        </div>
      )}
    </a>
  );
}

function GroupSection({
  group,
  groupIndex,
  query,
  visible,
  lanMap,
  onToggleLan,
  layout,
  collapsed,
  onToggleCollapse,
  selectedId,
}: {
  group: PublicGroup;
  groupIndex: number;
  query: string;
  visible: PublicItem[];
  lanMap: Map<string, LanInfo>;
  onToggleLan: (id: string, choice: 'lan' | 'public') => void;
  layout: ReturnType<typeof layoutAttributes>;
  collapsed: boolean;
  onToggleCollapse: (id: string) => void;
  selectedId: string | null;
}) {
  if (query && visible.length === 0) return null;
  const palette = useMemo(() => getGroupPalette(group.name, groupIndex), [group.name, groupIndex]);

  return (
    <section
      className="group"
      style={
        {
          '--group-hue': palette.hue,
          '--group-color': palette.color,
          '--group-glow': palette.glow,
          '--group-gradient': palette.gradient,
        } as React.CSSProperties
      }
    >
      <div
        className="group-head"
        onClick={() => onToggleCollapse(group.id)}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        data-collapsed={collapsed}
        title={collapsed ? '点击展开分组' : '点击折叠分组'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapse(group.id);
          }
        }}
      >
        <span
          className="group-toggle-btn"
          aria-hidden="true"
        >
          <svg className="group-arrow-svg" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M2.5 3.5L5 6L7.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="group-title">
          {group.icon && (
            <span className="group-icon-badge">
              <span className="group-icon">{group.icon}</span>
            </span>
          )}
          <span className="group-title-text">{cleanGroupName(group.name, !!group.icon)}</span>
        </h2>
        <span className="group-count">{visible.length}</span>
      </div>
      <div className="group-body" data-collapsed={collapsed}>
        <div className="group-body-inner">
          <div
            className="grid pn-fade"
            data-view={layout.view}
            data-density={layout.density}
            data-size={layout.size}
            data-show-desc={layout.showDescription}
          >
            {visible.map((item, index) => (
              <ItemCard
                key={item.id}
                item={item}
                index={index}
                lan={lanMap.get(item.id)}
                onToggleLan={onToggleLan}
                showDescription={layout.showDescription}
                selected={selectedId === item.id}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function NavPage({ authenticated, onAdmin, onLogin }: Props) {
  const [config, setConfig] = useState<PublicConfig | null>(() => readSnapshot());
  const [loading, setLoading] = useState(() => readSnapshot() === null);
  const [offline, setOffline] = useState(false);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [clock, setClock] = useState(() => formatClock());
  const [lanMap, setLanMap] = useState<Map<string, LanInfo>>(new Map());
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => resolveTheme(undefined));
  const [viewOverride, setViewOverride] = useState<'grid' | 'list' | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Update clock every minute
  useEffect(() => {
    const tick = () => {
      setClock(formatClock());
    };
    const timer = setInterval(tick, 10000);
    return () => clearInterval(timer);
  }, []);

  const layout = useMemo(() => {
    const base = layoutAttributes(config?.site.layout);
    return viewOverride ? { ...base, view: viewOverride } : base;
  }, [config?.site.layout, viewOverride]);

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

  // Repaint whenever the site's theme arrives, and once at mount from any stored override.
  useEffect(() => {
    applyTheme(config?.site);
    setThemeMode(resolveTheme(config?.site.theme.mode));
  }, [config?.site]);

  const toggleTheme = () => {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
    writeThemeOverride(next);
    setThemeMode(next);
    applyTheme(config?.site);
  };

  const toggleView = () => {
    setViewOverride(layout.view === 'grid' ? 'list' : 'grid');
  };

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

  const isFiltering = !!query.trim() || !!activeTag;

  const groups = useMemo(() => {
    if (!config) return [];
    const all = config.groups.map((group) => ({
      group,
      visible: group.items.filter((item) => itemMatches(item, query, activeTag)),
    }));
    // 当处于搜索或标签筛选状态时，过滤掉结果数为 0 的分组
    return isFiltering ? all.filter((entry) => entry.visible.length > 0) : all;
  }, [config, query, activeTag, isFiltering]);

  // A group starts collapsed if the site says so; the user's clicks override that.
  const isCollapsed = (groupId: string, defaultCollapsed: boolean): boolean =>
    collapsedIds.has(groupId) ? true : defaultCollapsed && !expandedIds.has(groupId);

  const toggleCollapse = (groupId: string) => {
    const group = groups.find((entry) => entry.group.id === groupId)?.group;
    if (!group) return;
    const currentlyCollapsed = isCollapsed(groupId, group.collapsed);
    if (currentlyCollapsed) {
      setCollapsedIds((current) => {
        const next = new Set(current);
        next.delete(groupId);
        return next;
      });
      setExpandedIds((current) => new Set(current).add(groupId));
    } else {
      setCollapsedIds((current) => new Set(current).add(groupId));
      setExpandedIds((current) => {
        const next = new Set(current);
        next.delete(groupId);
        return next;
      });
    }
  };

  // Keyboard navigation walks the flattened list of cards that are actually rendered,
  // so collapsed groups and filtered-out items are skipped automatically.
  const navigable = useMemo(
    () =>
      groups
        .filter((entry) => !(query && entry.visible.length === 0))
        .filter((entry) => !isCollapsed(entry.group.id, entry.group.collapsed))
        .flatMap((entry) => entry.visible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, collapsedIds, expandedIds, query],
  );

  const moveSelection = (delta: 1 | -1) => {
    if (navigable.length === 0) return;
    const currentIndex = selectedId ? navigable.findIndex((item) => item.id === selectedId) : -1;
    const start = currentIndex < 0 ? (delta === 1 ? 0 : navigable.length - 1) : currentIndex + delta;
    const clamped = Math.max(0, Math.min(start, navigable.length - 1));
    setSelectedId(navigable[clamped]!.id);
  };

  useEffect(() => {
    if (!selectedId) return;
    const element = document.querySelector(`[data-item-id="${CSS.escape(selectedId)}"]`);
    element?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('');
        searchRef.current?.blur();
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        // In the search box, arrows drive the result list; elsewhere they drive cards.
        event.preventDefault();
        moveSelection(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }

      if (event.key === 'Enter' && selectedId && !typing) {
        const item = navigable.find((entry) => entry.id === selectedId);
        if (!item) return;
        event.preventDefault();
        const lan = lanMap.get(item.id);
        const target = lan ? resolveTarget(item.id, item.url, lan.lanUrl, lan.reachable) : item.url;
        if (item.openInNewTab) {
          window.open(target, '_blank', 'noopener,noreferrer');
        } else {
          window.location.href = target;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, navigable, lanMap]);

  // Keep the selection valid when filtering changes what is on screen.
  useEffect(() => {
    if (selectedId && !navigable.some((item) => item.id === selectedId)) {
      setSelectedId(null);
    }
  }, [navigable, selectedId]);

  const totalVisible = groups.reduce((sum, entry) => sum + entry.visible.length, 0);
  const isEmpty = config !== null && config.groups.length === 0;

  const openExternalSearch = (engine: 'google' | 'baidu' | 'github' | 'bing') => {
    const q = encodeURIComponent(query);
    const urls = {
      google: `https://www.google.com/search?q=${q}`,
      baidu: `https://www.baidu.com/s?wd=${q}`,
      github: `https://github.com/search?q=${q}`,
      bing: `https://www.bing.com/search?q=${q}`,
    };
    window.open(urls[engine], '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div className="ambient-aurora" aria-hidden="true">
        <div className="aurora-orb aurora-orb-1" />
        <div className="aurora-orb aurora-orb-2" />
        <div className="aurora-orb aurora-orb-3" />
      </div>
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">P</span>
            <span>{config?.site.identity.title ?? 'PureNav'}</span>
            <span className="brand-clock" title={clock.full}>
              <span className="brand-clock-date">{clock.date}</span>
              <span className="brand-clock-time">{clock.time}</span>
            </span>
          </div>
          <div className="search" onClick={() => searchRef.current?.focus()}>
            <span className="search-icon">⌕</span>
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索站点或敲 /"
              aria-label="搜索站点"
            />
            {!query && <kbd className="search-kbd">/</kbd>}
          </div>
          <div className="topbar-actions">
          <button
            className="icon-btn"
            onClick={toggleView}
            aria-label={layout.view === 'grid' ? '切换为列表视图' : '切换为卡片视图'}
            title={layout.view === 'grid' ? '切换为列表视图' : '切换为卡片视图'}
          >
            {layout.view === 'grid' ? '☰' : '▦'}
          </button>
          <button className="icon-btn" onClick={toggleTheme} aria-label="切换主题" title="切换主题">
            {themeMode === 'dark' ? '☀' : '☾'}
          </button>
          <button className="icon-btn" onClick={authenticated ? onAdmin : onLogin} aria-label="管理后台" title="管理后台">
            ⚙
          </button>
        </div>
      </header>

      {/* Tag pills filter bar */}
      {config && config.tags.length > 0 && (
        <div className="tag-filter-bar">
          <button
            className={activeTag === null ? 'tag-pill tag-pill-active' : 'tag-pill'}
            onClick={() => setActiveTag(null)}
          >
            全部
          </button>
          {config.tags.map((tag) => (
            <button
              key={tag.id}
              className={activeTag === tag.name ? 'tag-pill tag-pill-active' : 'tag-pill'}
              onClick={() => setActiveTag((cur) => (cur === tag.name ? null : tag.name))}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}

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
          <h2>{query.trim() ? `没有匹配「${query}」的站内结果` : activeTag ? `标签「${activeTag}」下暂无站点` : '未找到匹配结果'}</h2>
          {query.trim() && (
            <>
              <p>继续通过外部搜索引擎查找：</p>
              <div className="external-search-actions">
                <button className="btn btn-sm" onClick={() => openExternalSearch('google')}>
                  Google 搜索
                </button>
                <button className="btn btn-sm" onClick={() => openExternalSearch('github')}>
                  GitHub 搜索
                </button>
                <button className="btn btn-sm" onClick={() => openExternalSearch('bing')}>
                  Bing 搜索
                </button>
                <button className="btn btn-sm" onClick={() => openExternalSearch('baidu')}>
                  百度 搜索
                </button>
              </div>
            </>
          )}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => { setQuery(''); setActiveTag(null); }}>
            清空筛选
          </button>
        </div>
      )}

      {!loading &&
        groups.map(({ group, visible }, index) => (
          <GroupSection
            key={group.id}
            group={group}
            groupIndex={index}
            query={query}
            visible={visible}
            lanMap={lanMap}
            onToggleLan={onToggleLan}
            layout={layout}
            collapsed={isCollapsed(group.id, group.collapsed)}
            onToggleCollapse={toggleCollapse}
            selectedId={selectedId}
          />
        ))}
      </div>
    </>
  );
}
