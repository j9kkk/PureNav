import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type AdminSettings, type DoctorReportResponse, type SettingsPatch } from '../api';
import type { PublicConfig, PublicGroup, PublicItem } from '../types';
import { probeLanReachable, readLanChoice, resolveTarget, writeLanChoice } from '../lib/lan';
import { getItemPalette } from '../lib/color';
import { fallbackIconSrc, primaryIconSrc } from '../lib/iconUrl';
import { useIconImage } from '../lib/iconImage';
import { BrandMark } from '../components/BrandMark';
import { applyTheme, resolveTheme, type ThemeMode } from '../lib/theme';
import '../nav-workspace.css';

const SNAPSHOT_KEY = 'pn.config.snapshot';

interface Props {
  authenticated: boolean;
  onAdmin: () => void;
  onLogin: () => void;
}

type ViewKind = 'all' | 'pinned' | 'recent' | 'inbox' | 'doctor' | 'folder';
type SortBy = 'visits' | 'title' | 'date';
type ViewMode = 'grid' | 'single';

interface LanInfo {
  lanUrl: string;
  reachable: boolean;
}

interface Toast {
  id: number;
  text: string;
}

/* ------------------------------------------------------------------ icons */

type IcoProps = { size?: number };

function Ico({ size = 16, children }: IcoProps & { children: React.ReactNode }) {
  return (
    <svg
      className={size <= 13 ? 'nx-icon nx-icon-sm' : 'nx-icon'}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const IcoBookmarks = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M2.5 3.5h11v9h-11zM2.5 6.5h11M6.5 6.5v6" />
  </Ico>
);
const IcoPin = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M9.5 2.5l4 4-2 3-5-5 3-2zM6.5 4.5l-4 4 2 2 3-1 3 3-5 1.5-2-2 1.5-5 3 3-1 3 2 2 4-4" />
  </Ico>
);
const IcoClock = (p: IcoProps) => (
  <Ico {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 5v3.5l2.5 1.5" />
  </Ico>
);
const IcoInbox = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M2.5 3.5h11v9h-11zM2.5 9h3l1.5 2h2l1.5-2h3" />
  </Ico>
);
const IcoPulse = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M2 8h3l2-4 3 8 2-4h4" />
  </Ico>
);
const IcoFolder = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M2 4.5h4l1.5 2H14v6.5H2z" />
  </Ico>
);
const IcoChevron = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M6 4l4 4-4 4" />
  </Ico>
);
const IcoSearch = (p: IcoProps) => (
  <Ico {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </Ico>
);
const IcoPlus = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M8 3v10M3 8h10" />
  </Ico>
);
const IcoClose = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Ico>
);
const IcoGrid = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M2.5 3h4.5v4.5H2.5zM9 3h4.5v4.5H9zM2.5 9.5h4.5V14H2.5zM9 9.5h4.5V14H9z" />
  </Ico>
);
const IcoRows = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
  </Ico>
);
const IcoMenu = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
  </Ico>
);
const IcoMore = (p: IcoProps) => (
  <Ico {...p}>
    <circle cx="4" cy="8" r="1.2" />
    <circle cx="8" cy="8" r="1.2" />
    <circle cx="12" cy="8" r="1.2" />
  </Ico>
);
const IcoLan = (p: IcoProps) => (
  <Ico {...p}>
    <circle cx="4" cy="8" r="2" />
    <circle cx="12" cy="8" r="2" />
    <path d="M6 8h4" />
  </Ico>
);
const IcoPencil = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M10 2.5l3.5 3.5L5 14.5H1.5V11L10 2.5z" />
  </Ico>
);
const IcoTrash = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M3 4.5h10M6 4.5V2.5h4v2M5 4.5v8.5h6V4.5" />
  </Ico>
);
const IcoOpen = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M5 11l6-6M6 5h5v5" />
  </Ico>
);
const IcoCopy = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M4.5 3.5h7v9h-7zM2.5 5.5v8h7" />
  </Ico>
);
const IcoGear = (p: IcoProps) => (
  <Ico {...p}>
    <circle cx="8" cy="8" r="2.5" />
    <path d="M8 2.5v1.5M8 12v1.5M2.5 8H4M12 8h1.5" />
  </Ico>
);
const IcoSun = (p: IcoProps) => (
  <Ico {...p}>
    <circle cx="8" cy="8" r="4" />
    <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" />
  </Ico>
);
const IcoMoon = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M13 9.5A5.5 5.5 0 016.5 3a5.5 5.5 0 106.5 6.5z" />
  </Ico>
);
const IcoCheck = (p: IcoProps) => (
  <Ico {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M5.5 8l2 2 3.5-3.5" />
  </Ico>
);
const IcoWarn = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M8 2.5L14 13.5H2L8 2.5zM8 7v3M8 11.5v.5" />
  </Ico>
);
const IcoArrowUpRight = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M5 11l6-6M6 5h5v5" />
  </Ico>
);
const IcoDatabase = (p: IcoProps) => (
  <Ico {...p}>
    <ellipse cx="8" cy="4" rx="4.5" ry="1.8" />
    <path d="M3.5 4v8c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8V4M3.5 8c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8" />
  </Ico>
);
const IcoPalette = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M8 2.2a5.8 5.8 0 100 11.6c1 0 1.4-.6 1.4-1.3 0-.8-.7-1.1-.7-1.9 0-.7.6-1.2 1.3-1.2h1.1c1.4 0 2.4-1 2.4-2.4C13.5 4.3 11 2.2 8 2.2z" />
    <circle cx="5.6" cy="6" r="0.9" />
    <circle cx="8.4" cy="4.8" r="0.9" />
  </Ico>
);
const IcoLogin = (p: IcoProps) => (
  <Ico {...p}>
    <path d="M9.5 3.5h3v9h-3M6.5 8h6M9 5.5L6.5 8 9 10.5" />
  </Ico>
);

/* ------------------------------------------------------------------ helpers */

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function monogram(title: string): string {
  const first = title.trim().split(/[\s\-_/]+/).filter(Boolean)[0] ?? '';
  if (!first) return '·';
  // 统一取首词的第一个「字素」两个字符：中文取前两字，拉丁取前两个字母。
  const chars = Array.from(first);
  return chars.slice(0, 2).join('').toUpperCase();
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] ?? url;
  }
}

function readSnapshot(): PublicConfig | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as PublicConfig) : null;
  } catch {
    return null;
  }
}

interface FlatItem {
  item: PublicItem;
  group: PublicGroup;
  path: string;
}

function sortItems(list: FlatItem[], sortBy: SortBy, visits: Map<string, number>): FlatItem[] {
  const out = [...list];
  const visitOf = (f: FlatItem) => visits.get(f.item.id) ?? f.item.visitCount ?? 0;
  if (sortBy === 'visits') out.sort((a, b) => visitOf(b) - visitOf(a) || a.item.title.localeCompare(b.item.title, 'zh-CN'));
  else if (sortBy === 'title') out.sort((a, b) => a.item.title.localeCompare(b.item.title, 'zh-CN'));
  else
    out.sort(
      (a, b) =>
        (b.item.createdAt ?? '').localeCompare(a.item.createdAt ?? '') ||
        a.item.title.localeCompare(b.item.title, 'zh-CN'),
    );
  return out;
}

/* ------------------------------------------------------------------ card */

const BookmarkIcon = memo(function BookmarkIcon({
  item,
  size = 'lg',
}: {
  item: PublicItem;
  size?: 'sm' | 'lg';
}) {
  const palette = useMemo(() => getItemPalette(item.url, item.title), [item.url, item.title]);
  const primary = useMemo(() => primaryIconSrc(item.icon, item.url, palette.color), [item.icon, item.url, palette.color]);
  const [src, setSrc] = useState(primary);
  const { ref: imgRef, loaded, broken, variant, onLoad, setBroken } = useIconImage(src);

  useEffect(() => {
    setSrc(primary);
    setBroken(false);
  }, [primary, setBroken]);

  const handleError = () => {
    const fallback = fallbackIconSrc(item.icon, item.url);
    if (fallback && src !== fallback) {
      setSrc(fallback);
      return;
    }
    setBroken(true);
  };

  const hasImage = Boolean(src && loaded && !broken);

  return (
    <span
      className={size === 'sm' ? 'nx-mono' : 'nx-mono-lg'}
      data-has-image={hasImage ? 'true' : 'false'}
      data-variant={variant}
    >
      {!hasImage && <span>{monogram(item.title)}</span>}
      {src && !broken && (
        <img
          ref={imgRef}
          src={src}
          alt=""
          decoding="async"
          data-loaded={loaded}
          onLoad={onLoad}
          onError={handleError}
        />
      )}
    </span>
  );
});

const ItemCard = memo(function ItemCard({
  flat,
  visits,
  lan,
  onOpen,
  onToggleLan,
  onContext,
  onMore,
  onDragStartItem,
  highlight,
  canEdit,
  onRename,
}: {
  flat: FlatItem;
  visits: number;
  lan?: LanInfo;
  onOpen: (flat: FlatItem) => void;
  onToggleLan: (flat: FlatItem, target: 'lan' | 'public') => void;
  onContext: (flat: FlatItem, x: number, y: number) => void;
  onMore: (flat: FlatItem, el: HTMLElement) => void;
  onDragStartItem: (id: string) => void;
  highlight: boolean;
  canEdit: boolean;
  onRename: (id: string, title: string, previous: string) => void;
}) {
  const { item } = flat;
  const usingLan = lan ? resolveTarget(item.id, item.url, lan.lanUrl, lan.reachable) === lan.lanUrl : false;
  const displayHost = hostOf(usingLan && lan ? lan.lanUrl : item.url);
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <article
      className="nx-card"
      data-highlight={highlight || undefined}
      data-item-id={item.id}
      draggable={canEdit || undefined}
      onDragStart={
        canEdit
          ? (event) => {
              event.dataTransfer.setData('text/plain', item.id);
              event.dataTransfer.effectAllowed = 'move';
              onDragStartItem(item.id);
            }
          : undefined
      }
      onClick={() => onOpen(flat)}
      onContextMenu={(event) => {
        event.preventDefault();
        onContext(flat, event.clientX, event.clientY);
      }}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(flat);
      }}
    >
      <BookmarkIcon item={item} size="lg" />
      <div className="nx-card-body">
        <div className="nx-row1">
          <div className="nx-title-wrap">
            {draft === null ? (
              <span
                className="nx-card-title"
                title={canEdit ? `${item.title} · 双击重命名` : item.title}
                onDoubleClick={
                  canEdit
                    ? (event) => {
                        event.stopPropagation();
                        setDraft(item.title);
                      }
                    : undefined
                }
              >
                {item.title}
              </span>
            ) : (
              <input
                className="nx-title-input"
                autoFocus
                value={draft}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') {
                    const next = draft.trim();
                    setDraft(null);
                    if (next && next !== item.title) onRename(item.id, next, item.title);
                  }
                  if (event.key === 'Escape') setDraft(null);
                }}
                onBlur={() => {
                  const next = draft.trim();
                  setDraft(null);
                  if (next && next !== item.title) onRename(item.id, next, item.title);
                }}
              />
            )}
            <span className="nx-domain" data-lan={usingLan || undefined} title={item.url}>
              {displayHost}
            </span>
            {lan && (
              <button
                className="nx-lan-chip"
                data-active={usingLan ? 'lan' : 'wan'}
                title={usingLan ? '当前内网地址，点击切换公网' : '当前公网地址，点击切换内网'}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleLan(flat, usingLan ? 'public' : 'lan');
                }}
              >
                <IcoLan size={13} />
                <span>{usingLan ? '内网' : '外网'}</span>
              </button>
            )}
          </div>
          <div className="nx-meta">
            {item.tags[0] && <span className="nx-tag">{item.tags[0]}</span>}
            {item.pinned && (
              <span className="nx-pin" title="常用置顶">
                <IcoPin size={13} />
              </span>
            )}
            <span className="nx-visits">{visits}次</span>
            {canEdit && (
              <button
                className="nx-more"
                title="更多操作（也可右键）"
                onClick={(event) => {
                  event.stopPropagation();
                  onMore(flat, event.currentTarget);
                }}
              >
                <IcoMore size={13} />
              </button>
            )}
          </div>
        </div>
        <div className="nx-row2">
          <p className="nx-desc">{item.description ?? hostOf(item.url)}</p>
          <span className="nx-path" title={flat.path}>
            {flat.path}
          </span>
        </div>
      </div>
    </article>
  );
});

/* ------------------------------------------------------------------ page */

export function NavPage({ authenticated, onAdmin, onLogin }: Props) {
  const [config, setConfig] = useState<PublicConfig | null>(() => readSnapshot());
  const [loading, setLoading] = useState(() => readSnapshot() === null);
  const [offline, setOffline] = useState(false);
  const [view, setView] = useState<ViewKind>('all');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('visits');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => resolveTheme(undefined));
  /**
   * The unified page has three states: visitor, signed-in browsing, signed-in editing.
   * `editMode` is deliberately session-only (never persisted) so a signed-in visit never
   * starts with drag handles and destructive controls already armed.
   */
  const [editMode, setEditMode] = useState(false);
  const canEdit = authenticated && editMode;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mobileNav, setMobileNav] = useState(false);
  const [lanMap, setLanMap] = useState<Map<string, LanInfo>>(new Map());
  const [lanTick, setLanTick] = useState(0);
  const [visitOverride, setVisitOverride] = useState<Map<string, number>>(new Map());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ctxMenu, setCtxMenu] = useState<{ flat: FlatItem; x: number; y: number } | null>(null);
  const [ctxMoveOpen, setCtxMoveOpen] = useState(false);
  const [dialog, setDialog] = useState<
    { mode: 'capture'; initialUrl?: string; initialTitle?: string } | { mode: 'edit'; flat: FlatItem } | null
  >(null);
  const [doctor, setDoctor] = useState<DoctorReportResponse | null>(null);
  const [doctorBusy, setDoctorBusy] = useState(false);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [newFolder, setNewFolder] = useState<{ open: boolean; name: string }>({ open: false, name: '' });
  const [dragging, setDragging] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /* ---------------- data plumbing ---------------- */

  const loadConfig = useCallback(() => {
    return api
      .publicConfig()
      .then((next) => {
        setConfig(next);
        try {
          localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(next));
        } catch {
          // private mode: the snapshot simply won't persist
        }
        setOffline(false);
        return next;
      })
      .catch(() => {
        setOffline(true);
        return null;
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    document.body.classList.add('pn-app-locked');
    return () => document.body.classList.remove('pn-app-locked');
  }, []);

  // 支持从小书签（Bookmarklet）跳回 /?capture=1&url=...&title=... 自动弹出快速收录并回填
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('capture') === '1') {
      const initialUrl = params.get('url')?.trim() ?? '';
      const initialTitle = params.get('title')?.trim() ?? '';
      setDialog({ mode: 'capture', initialUrl, initialTitle });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    applyTheme(config?.site);
    setThemeMode(resolveTheme(config?.site.theme.mode));
  }, [config?.site]);

  useEffect(() => {
    const identity = config?.site.identity;
    document.title = identity?.title ?? 'PureNav';
  }, [config?.site.identity]);

  // LAN URLs only exist for a signed-in admin; probing just seeds the default choice.
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
            return [id, { lanUrl, reachable }] as const;
          }),
        );
        if (!cancelled) setLanMap(new Map(settled));
      })
      .catch(() => {
        // no LAN switching is a valid state
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, config?.version]);

  const loadDoctor = useCallback(async () => {
    if (!authenticated) return;
    try {
      const report = await api.doctorReport();
      setDoctor(report);
    } catch {
      setDoctor(null);
    }
  }, [authenticated]);

  useEffect(() => {
    if (authenticated) void loadDoctor();
  }, [authenticated, loadDoctor, config?.version]);

  /* ---------------- derived tree ---------------- */

  const groups = useMemo(() => config?.groups ?? [], [config]);

  // 有子文件夹的节点默认展开：树是导航主路径，收起等于把内容藏起来。
  useEffect(() => {
    if (groups.length === 0) return;
    setExpanded((current) => {
      const next = new Set(current);
      for (const group of groups) {
        if (groups.some((child) => child.parentId === group.id)) next.add(group.id);
      }
      return next.size === current.size ? current : next;
    });
  }, [groups]);

  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, PublicGroup[]>();
    for (const group of groups) {
      const list = map.get(group.parentId) ?? [];
      list.push(group);
      map.set(group.parentId, list);
    }
    return map;
  }, [groups]);

  const pathOf = useCallback(
    (groupId: string): string => {
      const names: string[] = [];
      let cursor = groupById.get(groupId);
      let guard = 0;
      while (cursor && guard < 12) {
        names.unshift(cursor.name);
        cursor = cursor.parentId ? groupById.get(cursor.parentId) : undefined;
        guard += 1;
      }
      return names.join(' / ');
    },
    [groupById],
  );

  const subtreeIds = useCallback(
    (rootId: string): Set<string> => {
      const out = new Set<string>([rootId]);
      const walk = (id: string) => {
        for (const child of childrenByParent.get(id) ?? []) {
          out.add(child.id);
          walk(child.id);
        }
      };
      walk(rootId);
      return out;
    },
    [childrenByParent],
  );

  const allFlat = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = [];
    for (const group of groups) {
      const path = pathOf(group.id);
      for (const item of group.items) out.push({ item, group, path });
    }
    return out;
  }, [groups, pathOf]);

  const subtreeFlat = useCallback(
    (rootId: string): FlatItem[] => {
      const ids = subtreeIds(rootId);
      return allFlat.filter((flat) => ids.has(flat.group.id));
    },
    [allFlat, subtreeIds],
  );

  const matches = useCallback(
    (flat: FlatItem): boolean => {
      if (activeTag && !flat.item.tags.some((tag) => normalize(tag) === normalize(activeTag))) return false;
      if (!query.trim()) return true;
      const needle = normalize(query);
      return (
        normalize(flat.item.title).includes(needle) ||
        normalize(flat.item.url).includes(needle) ||
        normalize(flat.item.description ?? '').includes(needle) ||
        normalize(flat.path).includes(needle) ||
        flat.item.tags.some((tag) => normalize(tag).includes(needle))
      );
    },
    [activeTag, query],
  );

  const filtered = useMemo(() => allFlat.filter(matches), [allFlat, matches]);

  const counts = useMemo(() => {
    const pinned = allFlat.filter((flat) => flat.item.pinned).length;
    const inbox = allFlat.filter((flat) => flat.item.isInbox).length;
    const recent = allFlat.filter((flat) => flat.item.lastVisitedAt).length;
    return { all: allFlat.length, pinned, inbox, recent };
  }, [allFlat]);

  const issueCount = useMemo(() => {
    if (!doctor) return 0;
    return (
      doctor.duplicates.length +
      doctor.redirects.filter((r) => !ignored.has(r.id)).length +
      doctor.broken.filter((b) => !ignored.has(b.id)).length
    );
  }, [doctor, ignored]);

  const visitOf = useCallback(
    (item: PublicItem) => visitOverride.get(item.id) ?? item.visitCount ?? 0,
    [visitOverride],
  );

  /* ---------------- actions ---------------- */

  const pushToast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, text }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const selectView = useCallback((next: ViewKind, id?: string) => {
    setView(next);
    setFolderId(id ?? null);
    setActiveTag(null);
    setMobileNav(false);
  }, []);

  const openItem = useCallback(
    (flat: FlatItem) => {
      const lan = lanMap.get(flat.item.id);
      const target = lan ? resolveTarget(flat.item.id, flat.item.url, lan.lanUrl, lan.reachable) : flat.item.url;
      setVisitOverride((current) => new Map(current).set(flat.item.id, visitOf(flat.item) + 1));
      void api.hitItem(flat.item.id).catch(() => undefined);
      if (flat.item.openInNewTab) window.open(target, '_blank', 'noopener,noreferrer');
      else window.location.href = target;
    },
    [lanMap, visitOf],
  );

  const toggleLan = useCallback((flat: FlatItem, target: 'lan' | 'public') => {
    writeLanChoice(flat.item.id, target);
    setLanTick((value) => value + 1);
    pushToast(`${flat.item.title} 已切换至${target === 'lan' ? '内网' : '公网'}地址`);
  }, [pushToast]);

  const openContext = useCallback((flat: FlatItem, x: number, y: number) => {
    if (!canEdit) return;
    setCtxMoveOpen(false);
    setCtxMenu({ flat, x: Math.min(x, window.innerWidth - 240), y: Math.min(y, window.innerHeight - 380) });
  }, [canEdit]);

  const closeContext = useCallback(() => {
    setCtxMenu(null);
    setCtxMoveOpen(false);
  }, []);

  const onDragStartItem = useCallback(() => setDragging(true), []);

  useEffect(() => {
    const clear = () => {
      setDragging(false);
      setDropTargetId(null);
    };
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
    };
  }, []);

  // Keep the LAN chip honest after a toggle without re-probing.
  void lanTick;

  const refreshAll = useCallback(async () => {
    await loadConfig();
    await loadDoctor();
  }, [loadConfig, loadDoctor]);

  const patchItem = useCallback(
    async (id: string, body: Record<string, unknown>, message: string) => {
      try {
        await api.updateItem(id, body);
        pushToast(message);
        await refreshAll();
      } catch (error) {
        pushToast(error instanceof Error ? error.message : '操作失败');
      }
    },
    [pushToast, refreshAll],
  );

  const deleteItem = useCallback(
    async (id: string, title: string) => {
      try {
        await api.deleteItem(id);
        pushToast(`已删除书签「${title}」`);
        await refreshAll();
      } catch (error) {
        pushToast(error instanceof Error ? error.message : '删除失败');
      }
    },
    [pushToast, refreshAll],
  );

  const moveItem = useCallback(
    async (id: string, targetGroupId: string, targetName: string) => {
      if (targetGroupId === '__inbox__') {
        await patchItem(id, { isInbox: true }, `已移入待整理收件箱`);
        setView('inbox');
        return;
      }
      await patchItem(id, { groupId: targetGroupId, isInbox: false }, `已移动至「${targetName}」`);
    },
    [patchItem],
  );

  const dropProps = useCallback(
    (groupId: string) =>
      canEdit
        ? {
            onDragOver: (event: React.DragEvent) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDropTargetId(groupId);
            },
            onDragLeave: () => setDropTargetId((current) => (current === groupId ? null : current)),
            onDrop: (event: React.DragEvent) => {
              event.preventDefault();
              event.stopPropagation();
              const id = event.dataTransfer.getData('text/plain');
              const target = groupById.get(groupId);
              setDropTargetId(null);
              setDragging(false);
              if (!id || !target) return;
              void moveItem(id, groupId, target.name);
            },
          }
        : {},
    [canEdit, groupById, moveItem],
  );

  const createFolder = useCallback(async () => {
    const name = newFolder.name.trim();
    if (!name) return;
    try {
      await api.createGroup({ name, parentId: folderId ?? undefined });
      setNewFolder({ open: false, name: '' });
      pushToast(`已新建文件夹「${name}」`);
      await loadConfig();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '新建文件夹失败');
    }
  }, [newFolder.name, folderId, pushToast, loadConfig]);

  /* ---------------- drawers (appearance / structure / data) ---------------- */

  const [drawer, setDrawer] = useState<null | 'appearance' | 'structure' | 'data'>(null);
  const [siteSettings, setSiteSettings] = useState<AdminSettings | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [folderEdit, setFolderEdit] = useState<{ id: string; name: string } | null>(null);
  const [dataBusy, setDataBusy] = useState(false);

  useEffect(() => {
    if (!drawer || !authenticated || siteSettings) return;
    let alive = true;
    void api
      .settings()
      .then((next) => {
        if (alive) setSiteSettings(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [drawer, authenticated, siteSettings]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawer(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const saveSettings = useCallback(
    async (patch: SettingsPatch, message = '外观已保存') => {
      setSettingsBusy(true);
      try {
        const next = await api.updateSettings(patch);
        setSiteSettings(next);
        applyTheme({ theme: next.theme });
        setThemeMode(resolveTheme(next.theme.mode));
        setConfig((current) => (current ? { ...current, site: { ...current.site, theme: next.theme, layout: next.layout } } : current));
        pushToast(message);
      } catch (error) {
        pushToast(error instanceof Error ? error.message : '保存失败');
      } finally {
        setSettingsBusy(false);
      }
    },
    [pushToast],
  );

  const saveFolderName = useCallback(async () => {
    if (!folderEdit) return;
    const name = folderEdit.name.trim();
    if (!name) {
      setFolderEdit(null);
      return;
    }
    try {
      await api.updateGroup(folderEdit.id, { name });
      pushToast(`已重命名为「${name}」`);
      setFolderEdit(null);
      await loadConfig();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '重命名失败');
    }
  }, [folderEdit, pushToast, loadConfig]);

  const removeFolder = useCallback(
    async (id: string, name: string) => {
      try {
        await api.deleteGroup(id, true);
        pushToast(`已删除文件夹「${name}」及其内容`);
        if (folderId === id) selectView('all');
        await refreshAll();
      } catch (error) {
        pushToast(error instanceof Error ? error.message : '删除失败');
      }
    },
    [pushToast, folderId, selectView, refreshAll],
  );

  const exportData = useCallback(
    async (format: 'json' | 'bookmarks.html') => {
      setDataBusy(true);
      try {
        const blob = format === 'json' ? await api.exportJson() : await api.exportBookmarks();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `purenav-${new Date().toISOString().slice(0, 10)}.${format === 'json' ? 'json' : 'html'}`;
        anchor.click();
        URL.revokeObjectURL(url);
        pushToast('导出已开始下载');
      } catch (error) {
        pushToast(error instanceof Error ? error.message : '导出失败');
      } finally {
        setDataBusy(false);
      }
    },
    [pushToast],
  );

  const importData = useCallback(
    async (file: File, mode: 'merge' | 'replace') => {
      setDataBusy(true);
      try {
        const payload = JSON.parse(await file.text()) as unknown;
        const result = await api.importConfig(payload, mode);
        pushToast(`已导入 ${result.created} 条数据（${mode === 'replace' ? '覆盖' : '合并'}）`);
        await refreshAll();
      } catch (error) {
        pushToast(error instanceof Error ? error.message : '导入失败');
      } finally {
        setDataBusy(false);
      }
    },
    [pushToast, refreshAll],
  );

  const rescanDoctor = async () => {
    setDoctorBusy(true);
    try {
      const result = await api.doctorScan();
      pushToast(`已扫描 ${result.checked} 条书签，${result.ok} 条连接正常`);
      await loadDoctor();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '扫描失败');
    } finally {
      setDoctorBusy(false);
    }
  };

  const mergeDuplicates = async (group: DoctorReportResponse['duplicates'][number]) => {
    const sorted = [...group.items].sort((a, b) => b.visitCount - a.visitCount);
    const keep = sorted[0]!;
    const drop = sorted.slice(1).map((entry) => entry.id);
    if (drop.length === 0) return;
    try {
      await api.batchItems('delete', drop);
      pushToast(`已合并重复书签，保留「${keep.title}」`);
      await refreshAll();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '合并失败');
    }
  };

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if ((event.key === 'n' || event.key === 'N') && !typing && canEdit) {
        event.preventDefault();
        setDialog({ mode: 'capture' });
        return;
      }
      if (event.key === 'Escape') {
        if (dialog) setDialog(null);
        else if (ctxMenu) closeContext();
        else if (mobileNav) setMobileNav(false);
        else if (document.activeElement === searchRef.current) {
          setQuery('');
          searchRef.current?.blur();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authenticated, dialog, ctxMenu, closeContext, mobileNav]);

  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = () => closeContext();
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [ctxMenu, closeContext]);

  /* ---------------- view data ---------------- */

  const viewItems = useMemo(() => {
    if (view === 'pinned') {
      return sortItems(filtered.filter((flat) => flat.item.pinned), sortBy, visitOverride);
    }
    if (view === 'recent') {
      const withVisits = filtered.filter((flat) => flat.item.lastVisitedAt || visitOf(flat.item) > 0);
      withVisits.sort(
        (a, b) =>
          (b.item.lastVisitedAt ?? '').localeCompare(a.item.lastVisitedAt ?? '') ||
          visitOf(b.item) - visitOf(a.item),
      );
      return withVisits.slice(0, 16);
    }
    if (view === 'inbox') {
      return sortItems(filtered.filter((flat) => flat.item.isInbox), 'date', visitOverride);
    }
    if (view === 'folder' && folderId) {
      return sortItems(filtered.filter((flat) => subtreeIds(folderId).has(flat.group.id)), sortBy, visitOverride);
    }
    return sortItems(filtered, sortBy, visitOverride);
  }, [view, filtered, folderId, sortBy, visitOverride, subtreeIds]);

  const pinnedItems = useMemo(
    () =>
      [...allFlat]
        .filter((flat) => flat.item.pinned)
        .sort((a, b) => visitOf(b.item) - visitOf(a.item))
        .slice(0, 8),
    [allFlat, visitOf],
  );

  const currentFolder = folderId ? groupById.get(folderId) ?? null : null;

  const crumbTrail = useMemo(() => {
    if (!currentFolder) return [];
    const trail: PublicGroup[] = [];
    let cursor: PublicGroup | undefined = currentFolder;
    let guard = 0;
    while (cursor && guard < 12) {
      trail.unshift(cursor);
      cursor = cursor.parentId ? groupById.get(cursor.parentId) : undefined;
      guard += 1;
    }
    return trail;
  }, [currentFolder, groupById]);

  const showDock = view === 'all' && !query.trim() && !activeTag && pinnedItems.length > 0;

  const roots = childrenByParent.get(null) ?? [];

  /* ---------------- render helpers ---------------- */

  const renameItem = useCallback(
    (id: string, title: string) => {
      void patchItem(id, { title }, `已重命名为「${title}」`);
    },
    [patchItem],
  );

  const renderCards = (list: FlatItem[]) => (
    <div className="nx-grid" data-single={viewMode === 'single' || undefined}>
      {list.map((flat) => (
        <ItemCard
          key={flat.item.id}
          flat={flat}
          visits={visitOf(flat.item)}
          lan={lanMap.get(flat.item.id)}
          onOpen={openItem}
          onToggleLan={toggleLan}
          onContext={openContext}
          onMore={(target, el) => {
            const rect = el.getBoundingClientRect();
            openContext(target, rect.right - 224, rect.bottom + 6);
          }}
          onDragStartItem={onDragStartItem}
          highlight={ctxMenu?.flat.item.id === flat.item.id}
          canEdit={canEdit}
          onRename={renameItem}
        />
      ))}
    </div>
  );

  const renderSubfolders = (parentId: string) => {
    const kids = childrenByParent.get(parentId) ?? [];
    if (kids.length === 0) return null;
    return (
      <div className="nx-subfolders">
        {kids.map((child) => (
          <button
            key={child.id}
            className="nx-subfolder-card"
            data-drop={dropTargetId === child.id || undefined}
            onClick={() => selectView('folder', child.id)}
            {...dropProps(child.id)}
          >
            <IcoFolder size={13} />
            <span>{child.name}</span>
            <span className="nx-subfolder-count">{subtreeFlat(child.id).length} ›</span>
          </button>
        ))}
      </div>
    );
  };

  const renderSidebarTree = () => {
    const renderNode = (group: PublicGroup, depth: number): React.ReactNode => {
      const kids = childrenByParent.get(group.id) ?? [];
      const open = expanded.has(group.id);
      const active = view === 'folder' && folderId === group.id;
      const total = subtreeFlat(group.id).length;
      return (
        <div key={group.id}>
          <button
            className={depth === 0 ? 'nx-nav-item' : 'nx-tree-child'}
            data-active={active || undefined}
            data-drop={dropTargetId === group.id || undefined}
            style={depth > 0 ? undefined : { paddingLeft: 8 }}
            onClick={() => selectView('folder', group.id)}
            {...dropProps(group.id)}
          >
            <span className="nx-nav-left">
              {kids.length > 0 && (
                <span
                  className="nx-tree-arrow"
                  data-open={open || undefined}
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(group.id)) next.delete(group.id);
                      else next.add(group.id);
                      return next;
                    });
                  }}
                >
                  <IcoChevron size={13} />
                </span>
              )}
              {kids.length === 0 && depth > 0 && <IcoFolder size={13} />}
              {depth === 0 && <IcoFolder size={15} />}
              <span className="nx-nav-name">{group.name}</span>
            </span>
            <span className="nx-nav-count">{total}</span>
          </button>
          {kids.length > 0 && open && (
            <div className="nx-tree-children">
              {kids.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    };
    return roots.map((root) => renderNode(root, 0));
  };

  const renderDoctor = () => {
    if (!doctor) {
      return (
        <div className="nx-empty">
          <div className="nx-empty-title">正在读取体检报告…</div>
        </div>
      );
    }
    const total = doctor.totalItems;
    const activeIssues =
      doctor.duplicates.length +
      doctor.redirects.filter((r) => !ignored.has(r.id)).length +
      doctor.broken.filter((b) => !ignored.has(b.id)).length;
    const healthy = Math.max(0, total - activeIssues);
    const score = total === 0 ? 100 : Math.max(0, Math.round((healthy / total) * 100));

    return (
      <div className="nx-doctor">
        <div className="nx-doctor-summary">
          <div className="nx-doctor-left">
            <div className="nx-score">{score}</div>
            <div className="nx-doctor-text">
              <span className="nx-doctor-title">收藏夹健康治理中心</span>
              <div className="nx-doctor-stats">
                <span>全库 {total} 条书签</span>
                <span>·</span>
                <span className="nx-stat-tag" data-kind="clean">
                  健康 {healthy} 条
                </span>
                <span>·</span>
                <span className="nx-stat-tag" data-kind="alert">
                  待处理 {activeIssues} 项
                </span>
              </div>
            </div>
          </div>
          <button className="nx-btn-primary" onClick={() => void rescanDoctor()} disabled={doctorBusy}>
            <IcoPulse size={13} />
            <span>{doctorBusy ? '扫描中…' : '重新扫描全库'}</span>
          </button>
        </div>

        <div className="nx-issue-list">
          {doctor.duplicates.map((group) => {
            const keep = [...group.items].sort((a, b) => b.visitCount - a.visitCount)[0]!;
            return (
              <div className="nx-issue" key={`dup-${group.normalizedUrl}`}>
                <div className="nx-issue-info">
                  <span className="nx-badge" data-kind="dup">
                    重复收藏 {group.items.length}
                  </span>
                  <div className="nx-issue-body">
                    <div className="nx-issue-title-row">
                      <span className="nx-issue-site">{keep.title}</span>
                      <span className="nx-issue-path">{keep.groupPath}</span>
                    </div>
                    <div className="nx-issue-detail">
                      归一化后相同网址 <code>{group.normalizedUrl}</code> 出现 {group.items.length} 次：
                      {group.items.map((entry) => entry.groupPath).join(' · ')}
                    </div>
                  </div>
                </div>
                <div className="nx-issue-actions">
                  <button className="nx-btn-primary" onClick={() => void mergeDuplicates(group)}>
                    合并保留一条
                  </button>
                </div>
              </div>
            );
          })}

          {doctor.redirects.map((entry) => (
            <div className="nx-issue" key={`red-${entry.id}`} data-resolved={ignored.has(entry.id) || undefined}>
              <div className="nx-issue-info">
                <span className="nx-badge" data-kind={ignored.has(entry.id) ? 'resolved' : 'redirect'}>
                  {ignored.has(entry.id) ? '已忽略' : `${entry.httpStatus} 重定向`}
                </span>
                <div className="nx-issue-body">
                  <div className="nx-issue-title-row">
                    <span className="nx-issue-site">{entry.title}</span>
                    <span className="nx-issue-path">{entry.groupPath}</span>
                  </div>
                  <div className="nx-issue-detail">
                    <code>{entry.url}</code> → <code>{entry.finalUrl}</code>
                  </div>
                </div>
              </div>
              <div className="nx-issue-actions">
                {ignored.has(entry.id) ? (
                  <span className="nx-done">已忽略</span>
                ) : (
                  <>
                    <button
                      className="nx-btn-primary"
                      onClick={() =>
                        void patchItem(
                          entry.id,
                          { url: entry.finalUrl, finalUrl: null, httpStatus: 200 },
                          `${entry.title} 地址已升级至 ${entry.finalUrl}`,
                        )
                      }
                    >
                      一键更新为新网址
                    </button>
                    <button
                      className="nx-btn-secondary"
                      onClick={() => setIgnored((current) => new Set(current).add(entry.id))}
                    >
                      忽略
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

          {doctor.broken.map((entry) => (
            <div className="nx-issue" key={`bad-${entry.id}`} data-resolved={ignored.has(entry.id) || undefined}>
              <div className="nx-issue-info">
                <span className="nx-badge" data-kind={ignored.has(entry.id) ? 'resolved' : 'broken'}>
                  {ignored.has(entry.id) ? '已忽略' : entry.httpStatus === 0 ? '连接失败' : `HTTP ${entry.httpStatus}`}
                </span>
                <div className="nx-issue-body">
                  <div className="nx-issue-title-row">
                    <span className="nx-issue-site">{entry.title}</span>
                    <span className="nx-issue-path">{entry.groupPath}</span>
                  </div>
                  <div className="nx-issue-detail">
                    <code>{entry.url}</code>
                  </div>
                </div>
              </div>
              <div className="nx-issue-actions">
                {ignored.has(entry.id) ? (
                  <span className="nx-done">已忽略</span>
                ) : (
                  <>
                    <button
                      className="nx-btn-secondary"
                      onClick={() => void deleteItem(entry.id, entry.title)}
                    >
                      删除书签
                    </button>
                    <button
                      className="nx-btn-secondary"
                      onClick={() => setIgnored((current) => new Set(current).add(entry.id))}
                    >
                      忽略
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

          {activeIssues === 0 && (
            <div className="nx-empty">
              <div className="nx-empty-title">没有发现问题</div>
              <p className="nx-empty-desc">全库没有重复网址、失效链接或未处理的永久重定向。</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderStructureRows = () => {
    const rows: React.ReactNode[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const group of childrenByParent.get(parent) ?? []) {
        const itemCount = allFlat.filter((flat) => flat.group.id === group.id).length;
        const editing = folderEdit?.id === group.id;
        rows.push(
          <div className="nx-structure-row" key={group.id} style={{ paddingLeft: 10 + depth * 16 }}>
            {editing ? (
              <input
                className="nx-structure-input"
                autoFocus
                value={folderEdit.name}
                onChange={(event) => setFolderEdit({ id: group.id, name: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveFolderName();
                  if (event.key === 'Escape') setFolderEdit(null);
                }}
                onBlur={() => void saveFolderName()}
              />
            ) : (
              <button
                className="nx-structure-name"
                onClick={() => {
                  setDrawer(null);
                  selectView('folder', group.id);
                }}
                title="在页面中打开该文件夹"
              >
                <IcoFolder size={13} />
                <span>{group.name}</span>
                <span className="nx-structure-count">{itemCount}</span>
              </button>
            )}
            <span className="nx-structure-actions">
              <button
                className="nx-icon-btn"
                title="重命名"
                onClick={() => setFolderEdit({ id: group.id, name: group.name })}
              >
                <IcoPencil size={12} />
              </button>
              <button
                className="nx-icon-btn"
                title="删除（含子文件夹与书签）"
                onClick={() => {
                  if (window.confirm(`删除文件夹「${group.name}」及其全部内容？此操作不可撤销。`)) {
                    void removeFolder(group.id, group.name);
                  }
                }}
              >
                <IcoTrash size={12} />
              </button>
            </span>
          </div>,
        );
        walk(group.id, depth + 1);
      }
    };
    walk(null, 0);
    if (rows.length === 0) return <span className="nx-empty-hint">还没有文件夹，先在左侧新建一个。</span>;
    return rows;
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="nx-empty">
          <div className="nx-empty-title">正在加载书签…</div>
        </div>
      );
    }

    if (groups.length === 0) {
      return (
        <div className="nx-empty">
          <span className="nx-empty-icon">
            <IcoBookmarks size={20} />
          </span>
          <div className="nx-empty-title">收藏夹空空如也</div>
          <p className="nx-empty-desc">
            可以导入 Chrome / Edge / Safari / Firefox 导出的标准 HTML 书签文件，多级目录会自动还原成文件夹树；也可以直接收录第一个网页。
          </p>
          <div className="nx-empty-actions">
            {canEdit ? (
              <>
                <button className="nx-btn-primary" onClick={() => setDialog({ mode: 'capture' })}>
                  <IcoPlus size={13} />
                  <span>快速收录第一个网页</span>
                </button>
                <button className="nx-btn-secondary" onClick={onAdmin}>
                  <span>导入浏览器书签</span>
                </button>
              </>
            ) : (
              <button className="nx-btn-primary" onClick={onLogin}>
        管理员登录后开始整理
              </button>
            )}
          </div>
          <span className="nx-empty-hint">支持多层级目录自动解析与标签自动提取</span>
        </div>
      );
    }

    if (view === 'doctor') return renderDoctor();

    if (viewItems.length === 0) {
      const reason = query.trim()
        ? `没有匹配「${query}」的书签`
        : activeTag
          ? `标签「${activeTag}」下暂无书签`
          : '这个视图里还没有书签';
      return (
        <div className="nx-empty">
          <span className="nx-empty-icon">
            <IcoSearch size={20} />
          </span>
          <div className="nx-empty-title">{reason}</div>
          {query.trim() && (
            <>
              <p className="nx-empty-desc">库内没有这个关键词，可以继续在外部搜索引擎里查找，或直接收录为书签。</p>
              <div className="nx-engines">
                {(
                  [
                    ['Google', `https://www.google.com/search?q=${encodeURIComponent(query)}`],
                    ['GitHub', `https://github.com/search?q=${encodeURIComponent(query)}`],
                    ['Bing', `https://www.bing.com/search?q=${encodeURIComponent(query)}`],
                    ['百度', `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`],
                  ] as const
                ).map(([label, href]) => (
                  <button
                    key={label}
                    className="nx-btn-secondary"
                    onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}
                  >
                    {label} 搜索 ↗
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            className="nx-btn-primary"
            onClick={() => {
              setQuery('');
              setActiveTag(null);
              selectView('all');
            }}
          >
            清空筛选条件
          </button>
        </div>
      );
    }

    if (view === 'all' && !query.trim() && !activeTag) {
      return (
        <>
          {roots.map((root) => {
            const items = sortItems(
              filtered.filter((flat) => subtreeIds(root.id).has(flat.group.id)),
              sortBy,
              visitOverride,
            );
            if (items.length === 0) return null;
            return (
              <section className="nx-folder-block" key={root.id}>
                <div className="nx-folder-head">
                  <div className="nx-folder-title-wrap">
                    <span className="nx-folder-title">{root.name}</span>
                    <span className="nx-folder-count">{subtreeFlat(root.id).length}</span>
                  </div>
                  <button className="nx-btn-secondary" onClick={() => selectView('folder', root.id)}>
                    <span>查看此目录 ›</span>
                  </button>
                </div>
                {renderSubfolders(root.id)}
                {renderCards(items)}
              </section>
            );
          })}
        </>
      );
    }

    const titleText =
      view === 'pinned'
        ? '常用置顶'
        : view === 'recent'
          ? '最近访问'
          : view === 'inbox'
            ? '待整理收件箱'
            : currentFolder?.name ?? '全部书签';

    return (
      <>
        <div className="nx-head-box">
          <div className="nx-view-head">
            <div className="nx-crumbs">
              {view === 'folder' && crumbTrail.length > 0 ? (
                <>
                  <button className="nx-crumb" onClick={() => selectView('all')}>
                    全部书签
                  </button>
                  {crumbTrail.map((node, index) => (
                    <span key={node.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className="nx-crumb-sep">/</span>
                      <button
                        className="nx-crumb"
                        data-current={index === crumbTrail.length - 1 || undefined}
                        onClick={() => index < crumbTrail.length - 1 && selectView('folder', node.id)}
                      >
                        {node.name}
                      </button>
                    </span>
                  ))}
                </>
              ) : (
                <button className="nx-crumb" data-current onClick={() => selectView('all')}>
                  {titleText}
                </button>
              )}
              <span className="nx-total">({viewItems.length})</span>
            </div>
            {canEdit && (
              <button className="nx-btn-secondary" onClick={() => setDialog({ mode: 'capture' })}>
                <IcoPlus size={13} />
                <span>添加书签</span>
              </button>
            )}
          </div>
          {view === 'folder' && folderId && renderSubfolders(folderId)}
        </div>
        {renderCards(viewItems)}
      </>
    );
  };

  /* ---------------- context menu target ---------------- */

  const ctxFlat = ctxMenu?.flat ?? null;

  return (
    <div
      className="nx-app"
      data-theme={themeMode}
      data-auth={authenticated ? 'admin' : 'anon'}
      data-edit={canEdit ? 'true' : 'false'}
      data-density={config?.site.layout.density ?? 'comfortable'}
      data-size={config?.site.layout.cardSize ?? 'md'}
      data-desc={config?.site.layout.showDescription === false ? 'off' : 'on'}
      data-dragging={dragging || undefined}
    >
      <aside className="nx-sidebar" data-open={mobileNav || undefined}>
        <div className="nx-brand-box">
          <div className="nx-brand-row">
            <span className="nx-brand-logo">
              <BrandMark />
            </span>
            <span className="nx-brand-title">{config?.site.identity.title ?? 'PureNav'}</span>
          </div>
          {canEdit && (
            <button className="nx-capture-btn" onClick={() => setDialog({ mode: 'capture' })} title="快速收录新网页 (N)">
              <IcoPlus size={13} />
              <span>快速收录</span>
              <span className="nx-capture-kbd">N</span>
            </button>
          )}
        </div>

        <div className="nx-side-scroll">
          <div className="nx-side-section">
            <div className="nx-section-title">
              <span>智能视图</span>
            </div>
            <button className="nx-nav-item" data-active={view === 'all' || undefined} onClick={() => selectView('all')}>
              <span className="nx-nav-left">
                <IcoBookmarks size={15} />
                <span className="nx-nav-name">全部书签</span>
              </span>
              <span className="nx-nav-count">{counts.all}</span>
            </button>
            <button
              className="nx-nav-item"
              data-active={view === 'pinned' || undefined}
              onClick={() => selectView('pinned')}
            >
              <span className="nx-nav-left">
                <IcoPin size={15} />
                <span className="nx-nav-name">常用置顶</span>
              </span>
              <span className="nx-nav-count">{counts.pinned}</span>
            </button>
            <button
              className="nx-nav-item"
              data-active={view === 'recent' || undefined}
              onClick={() => selectView('recent')}
            >
              <span className="nx-nav-left">
                <IcoClock size={15} />
                <span className="nx-nav-name">最近访问</span>
              </span>
              <span className="nx-nav-count">{counts.recent}</span>
            </button>
            {authenticated && (
              <button
                className="nx-nav-item"
                data-active={view === 'inbox' || undefined}
                onClick={() => selectView('inbox')}
              >
                <span className="nx-nav-left">
                  <IcoInbox size={15} />
                  <span className="nx-nav-name">待整理收件箱</span>
                </span>
                <span className="nx-nav-count">{counts.inbox}</span>
              </button>
            )}
            {authenticated && (
              <button
                className="nx-nav-item"
                data-active={view === 'doctor' || undefined}
                onClick={() => selectView('doctor')}
              >
                <span className="nx-nav-left">
                  <IcoPulse size={15} />
                  <span className="nx-nav-name">书签体检</span>
                </span>
                <span className="nx-nav-count" data-alert={issueCount > 0 || undefined}>
                  {issueCount}
                </span>
              </button>
            )}
          </div>

          <div className="nx-side-section">
            <div className="nx-section-title">
              <span>文件夹树</span>
              {canEdit && (
                <button
                  className="nx-section-action"
                  title={folderId ? '在当前文件夹下新建子文件夹' : '新建根文件夹'}
                  onClick={() => setNewFolder({ open: !newFolder.open, name: '' })}
                >
                  <IcoPlus size={13} />
                </button>
              )}
            </div>
            {newFolder.open && (
              <div className="nx-inline-form">
                <input
                  autoFocus
                  value={newFolder.name}
                  placeholder={folderId ? '子文件夹名称' : '文件夹名称'}
                  onChange={(event) => setNewFolder({ open: true, name: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void createFolder();
                    if (event.key === 'Escape') setNewFolder({ open: false, name: '' });
                  }}
                />
                <button className="nx-section-action" title="创建" onClick={() => void createFolder()}>
                  <IcoCheck size={13} />
                </button>
              </div>
            )}
            {renderSidebarTree()}
          </div>

          {config && config.tags.length > 0 && (
            <div className="nx-side-section">
              <div className="nx-section-title">
                <span>标签筛选</span>
              </div>
              <div className="nx-tag-wrap">
                {config.tags.map((tag) => (
                  <button
                    key={tag.id}
                    className="nx-tag-pill"
                    data-active={activeTag === tag.name || undefined}
                    onClick={() => setActiveTag((current) => (current === tag.name ? null : tag.name))}
                  >
                    {tag.name} {allFlat.filter((flat) => flat.item.tags.includes(tag.name)).length}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="nx-side-footer">
          <div className="nx-user">
            <span className="nx-avatar">{authenticated ? 'A' : '·'}</span>
            <span className="nx-user-name">{authenticated ? 'admin' : '访客只读'}</span>
          </div>
          <div className="nx-footer-actions">
            {authenticated ? (
              <>
                <button
                  className="nx-icon-btn"
                  data-active={drawer === 'appearance' || undefined}
                  onClick={() => setDrawer((current) => (current === 'appearance' ? null : 'appearance'))}
                  title="外观设置"
                >
                  <IcoPalette size={13} />
                </button>
                <button
                  className="nx-icon-btn"
                  data-active={drawer === 'structure' || undefined}
                  onClick={() => setDrawer((current) => (current === 'structure' ? null : 'structure'))}
                  title="分组结构"
                >
                  <IcoFolder size={13} />
                </button>
                <button
                  className="nx-icon-btn"
                  data-active={drawer === 'data' || undefined}
                  onClick={() => setDrawer((current) => (current === 'data' ? null : 'data'))}
                  title="数据与备份"
                >
                  <IcoDatabase size={13} />
                </button>
                <button className="nx-icon-btn" onClick={onAdmin} title="旧的完整后台（保留只读运维页）">
                  <IcoGear size={13} />
                </button>
              </>
            ) : (
              <button className="nx-icon-btn" onClick={onLogin} title="管理员登录">
                <IcoGear size={13} />
              </button>
            )}
          </div>
        </div>
      </aside>

      <main className="nx-main">
        <header className="nx-topbar">
          <div className="nx-topbar-left">
            <button className="nx-menu-btn" onClick={() => setMobileNav((value) => !value)} title="打开侧栏">
              <IcoMenu size={16} />
            </button>
            <div className="nx-search">
              <IcoSearch size={15} />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题 / 域名 / 路径 / 标签 (/ 或 ⌘K)"
                aria-label="搜索书签"
              />
              {query ? (
                <button className="nx-search-clear" onClick={() => setQuery('')} title="清空搜索">
                  <IcoClose size={13} />
                </button>
              ) : (
                <span className="nx-kbd">/</span>
              )}
            </div>
          </div>
          <div className="nx-topbar-right">
            <select
              className="nx-select"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortBy)}
              title="排序方式"
            >
              <option value="visits">按访问频次降序</option>
              <option value="title">按标题升序</option>
              <option value="date">按添加时间倒序</option>
            </select>
            <div className="nx-toggle">
              <button
                data-active={viewMode === 'grid' || undefined}
                onClick={() => setViewMode('grid')}
                title="双列卡片矩阵"
              >
                <IcoGrid size={13} />
              </button>
              <button
                data-active={viewMode === 'single' || undefined}
                onClick={() => setViewMode('single')}
                title="单列紧凑列表"
              >
                <IcoRows size={13} />
              </button>
            </div>
            {authenticated ? (
              <div className="nx-edit-switch-wrap">
                <button
                  type="button"
                  role="switch"
                  aria-checked={editMode}
                  className="nx-edit-switch"
                  data-active={editMode || undefined}
                  onClick={() => {
                    setEditMode((current) => {
                      if (current) closeContext();
                      return !current;
                    });
                  }}
                  title={editMode ? '退出编辑模式' : '进入编辑模式：拖拽排序、移动、右键管理'}
                >
                  <span className="nx-switch-knob" />
                </button>
                <span className="nx-edit-switch-label">编辑</span>
              </div>
            ) : (
              <button className="nx-login-btn" onClick={onLogin}>
                <IcoLogin size={13} />
                <span>登录</span>
              </button>
            )}
          </div>
        </header>

        <section className="nx-content">
          {offline && <span className="nx-empty-hint">当前展示的是离线缓存</span>}

          {showDock && (
            <section className="nx-dock">
              <div className="nx-dock-head">
                <span className="nx-dock-label">
                  <IcoPin size={13} />
                  <span>常用置顶快捷槽</span>
                </span>
                <span className="nx-empty-hint">{pinnedItems.length} 个高频站点</span>
              </div>
              <div className="nx-dock-grid">
                {pinnedItems.map((flat) => (
                  <button
                    key={flat.item.id}
                    className="nx-dock-card"
                    title={`${flat.item.title} · ${flat.item.description ?? flat.item.url}`}
                    onClick={() => openItem(flat)}
                  >
                    <BookmarkIcon item={flat.item} size="sm" />
                    <span className="nx-dock-name">{flat.item.title}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {renderContent()}
        </section>

        <footer className="nx-statusbar">
          <div className="nx-status-left">
            <span className="nx-dot" />
            <span className="nx-status-text">
              共 {counts.all} 条书签 · 置顶 {counts.pinned} · 待整理 {counts.inbox}
              {authenticated ? ` · 体检发现 ${issueCount} 项` : ''}
            </span>
          </div>
          <div className="nx-status-right">
            <span>按 / 搜索 · 右键管理 · N 快速收录</span>
          </div>
        </footer>
      </main>

      {drawer && (
        <>
          <div className="nx-drawer-backdrop" onClick={() => setDrawer(null)} />
          <aside className="nx-drawer" role="dialog" aria-label="工作台抽屉">
            <div className="nx-drawer-head">
              <span className="nx-drawer-title">
                {drawer === 'appearance' ? '外观' : drawer === 'structure' ? '分组结构' : '数据与备份'}
              </span>
              <button className="nx-icon-btn" onClick={() => setDrawer(null)} title="关闭 (Esc)">
                <IcoClose size={14} />
              </button>
            </div>

            <div className="nx-drawer-body">
              {drawer === 'appearance' && (
                <>
                  <div className="nx-field">
                    <span className="nx-field-label">主题</span>
                    <div className="nx-seg">
                      <button
                        data-active={(siteSettings?.theme.mode ?? themeMode) === 'light' || undefined}
                        disabled={settingsBusy}
                        onClick={() => void saveSettings({ theme: { mode: 'light' } }, '已切换为浅色主题')}
                      >
                        浅色
                      </button>
                      <button
                        data-active={siteSettings?.theme.mode === 'dark' || undefined}
                        disabled={settingsBusy}
                        onClick={() => void saveSettings({ theme: { mode: 'dark' } }, '已切换为深色主题')}
                      >
                        深色
                      </button>
                    </div>
                    <span className="nx-field-hint">站点级设置，对所有访客生效。</span>
                  </div>

                  <div className="nx-field">
                    <span className="nx-field-label">强调色</span>
                    <div className="nx-swatches">
                      {['#2f6df6', '#0f9d76', '#e0512f', '#a855f7', '#0ea5e9', '#f59e0b'].map((color) => (
                        <button
                          key={color}
                          className="nx-swatch"
                          style={{ background: color }}
                          data-active={
                            (siteSettings?.theme.accent ?? '').toLowerCase() === color.toLowerCase() || undefined
                          }
                          aria-label={`强调色 ${color}`}
                          disabled={settingsBusy}
                          onClick={() => void saveSettings({ theme: { accent: color } }, '强调色已更新')}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="nx-field">
                    <span className="nx-field-label">圆角 {siteSettings?.theme.radius ?? 12}px</span>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      step={2}
                      value={siteSettings?.theme.radius ?? 12}
                      disabled={settingsBusy || !siteSettings}
                      onChange={(event) =>
                        setSiteSettings((prev) =>
                          prev ? { ...prev, theme: { ...prev.theme, radius: Number(event.target.value) } } : prev,
                        )
                      }
                      onMouseUp={(event) =>
                        void saveSettings({ theme: { radius: Number((event.target as HTMLInputElement).value) } })
                      }
                    />
                  </div>

                  <div className="nx-field">
                    <span className="nx-field-label">阴影</span>
                    <div className="nx-seg">
                      {(
                        [
                          ['none', '无'],
                          ['soft', '柔和'],
                          ['strong', '明显'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          data-active={siteSettings?.theme.shadow === value || undefined}
                          disabled={settingsBusy}
                          onClick={() => void saveSettings({ theme: { shadow: value } }, '阴影已更新')}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="nx-field">
                    <span className="nx-field-label">密度</span>
                    <div className="nx-seg">
                      {(
                        [
                          ['comfortable', '舒展'],
                          ['compact', '紧凑'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          data-active={siteSettings?.layout.density === value || undefined}
                          disabled={settingsBusy}
                          onClick={() => void saveSettings({ layout: { density: value } }, '密度已更新')}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="nx-field">
                    <span className="nx-field-label">卡片尺寸</span>
                    <div className="nx-seg">
                      {(
                        [
                          ['sm', '小'],
                          ['md', '中'],
                          ['lg', '大'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          data-active={siteSettings?.layout.cardSize === value || undefined}
                          disabled={settingsBusy}
                          onClick={() => void saveSettings({ layout: { cardSize: value } }, '卡片尺寸已更新')}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="nx-field" data-row="true">
                    <span className="nx-field-label">显示描述</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={siteSettings?.layout.showDescription !== false}
                      className="nx-edit-switch"
                      data-active={siteSettings?.layout.showDescription !== false || undefined}
                      disabled={settingsBusy}
                      onClick={() =>
                        void saveSettings(
                          { layout: { showDescription: siteSettings?.layout.showDescription === false } },
                          '已更新描述显示',
                        )
                      }
                    >
                      <span className="nx-switch-knob" />
                    </button>
                  </div>
                </>
              )}

              {drawer === 'structure' && (
                <>
                  <p className="nx-drawer-note">
                    重命名、删除文件夹直接作用于站点数据；拖拽排序与移动到文件夹请在编辑态下于页面中完成。
                  </p>
                  <div className="nx-structure-list">
                    {renderStructureRows()}
                  </div>
                  <button
                    className="nx-btn-secondary"
                    onClick={() => {
                      setDrawer(null);
                      setNewFolder({ open: true, name: '' });
                    }}
                  >
                    <IcoPlus size={13} />
                    <span>新建根文件夹</span>
                  </button>
                </>
              )}

              {drawer === 'data' && (
                <>
                  <div className="nx-field">
                    <span className="nx-field-label">导出</span>
                    <div className="nx-drawer-row">
                      <button className="nx-btn-secondary" disabled={dataBusy} onClick={() => void exportData('json')}>
                        <IcoDatabase size={13} />
                        <span>完整 JSON</span>
                      </button>
                      <button
                        className="nx-btn-secondary"
                        disabled={dataBusy}
                        onClick={() => void exportData('bookmarks.html')}
                      >
                        <IcoOpen size={13} />
                        <span>浏览器书签 HTML</span>
                      </button>
                    </div>
                    <span className="nx-field-hint">导出前请先下载留存，导入覆盖模式不可撤销。</span>
                  </div>

                  <div className="nx-field">
                    <span className="nx-field-label">导入</span>
                    <div className="nx-drawer-row">
                      <label className="nx-btn-secondary" data-busy={dataBusy || undefined}>
                        <IcoPlus size={13} />
                        <span>合并导入</span>
                        <input
                          type="file"
                          accept="application/json"
                          hidden
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file) void importData(file, 'merge');
                          }}
                        />
                      </label>
                      <label className="nx-btn-secondary" data-busy={dataBusy || undefined}>
                        <IcoWarn size={13} />
                        <span>覆盖导入</span>
                        <input
                          type="file"
                          accept="application/json"
                          hidden
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file && window.confirm('覆盖导入会清空现有书签与分组，确定继续？')) {
                              void importData(file, 'replace');
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="nx-field">
                    <span className="nx-field-label">体检</span>
                    <div className="nx-drawer-row">
                      <button className="nx-btn-secondary" disabled={doctorBusy} onClick={() => void rescanDoctor()}>
                        <IcoPulse size={13} />
                        <span>{doctorBusy ? '扫描中…' : '重新扫描全部书签'}</span>
                      </button>
                      <button
                        className="nx-btn-secondary"
                        onClick={() => {
                          setDrawer(null);
                          selectView('doctor');
                        }}
                      >
                        <IcoWarn size={13} />
                        <span>查看 {issueCount} 项问题</span>
                      </button>
                    </div>
                  </div>

                  <div className="nx-field">
                    <span className="nx-field-label">待整理</span>
                    <div className="nx-drawer-row">
                      <button
                        className="nx-btn-secondary"
                        onClick={() => {
                          setDrawer(null);
                          selectView('inbox');
                        }}
                      >
                        <IcoInbox size={13} />
                        <span>打开收件箱（{counts.inbox}）</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </aside>
        </>
      )}

      {ctxMenu && ctxFlat && (
        <div
          className="nx-ctx"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            className="nx-ctx-item"
            onClick={() => {
              openItem(ctxFlat);
              closeContext();
            }}
          >
            <span className="nx-ctx-left">
              <IcoOpen size={13} />
              <span>打开书签</span>
            </span>
            <span className="nx-ctx-kbd">Enter</span>
          </button>
          <button
            className="nx-ctx-item"
            data-disabled={!lanMap.get(ctxFlat.item.id) || undefined}
            onClick={() => {
              const lan = lanMap.get(ctxFlat.item.id);
              if (!lan) return;
              const usingLan = resolveTarget(ctxFlat.item.id, ctxFlat.item.url, lan.lanUrl, lan.reachable) === lan.lanUrl;
              toggleLan(ctxFlat, usingLan ? 'public' : 'lan');
              closeContext();
            }}
          >
            <span className="nx-ctx-left">
              <IcoLan size={13} />
              <span>切换内网/外网地址</span>
            </span>
          </button>
          <button
            className="nx-ctx-item"
            onClick={() => {
              void patchItem(
                ctxFlat.item.id,
                { pinned: !ctxFlat.item.pinned },
                ctxFlat.item.pinned ? `已取消「${ctxFlat.item.title}」置顶` : `已将「${ctxFlat.item.title}」设为置顶`,
              );
              closeContext();
            }}
          >
            <span className="nx-ctx-left">
              <IcoPin size={13} />
              <span>{ctxFlat.item.pinned ? '取消置顶' : '设为常用置顶'}</span>
            </span>
          </button>

          <div className="nx-ctx-item" data-open={ctxMoveOpen || undefined}>
            <span className="nx-ctx-left">
              <IcoFolder size={13} />
              <span>移动到文件夹</span>
            </span>
            <IcoChevron size={13} />
            <div className="nx-ctx-sub" onMouseDown={(event) => event.stopPropagation()}>
              <button
                className="nx-ctx-item"
                onClick={() => {
                  void moveItem(ctxFlat.item.id, '__inbox__', '待整理收件箱');
                  closeContext();
                }}
              >
                待整理收件箱
              </button>
              <div className="nx-ctx-sep" />
              {allFlat
                .reduce<PublicGroup[]>((acc, flat) => {
                  if (!acc.some((group) => group.id === flat.group.id)) acc.push(flat.group);
                  return acc;
                }, [])
                .concat(groups.filter((group) => group.items.length === 0))
                .sort((a, b) => pathOf(a.id).localeCompare(pathOf(b.id), 'zh-CN'))
                .map((group) => (
                  <button
                    key={group.id}
                    className="nx-ctx-item"
                    data-disabled={group.id === ctxFlat.group.id || undefined}
                    onClick={() => {
                      void moveItem(ctxFlat.item.id, group.id, group.name);
                      closeContext();
                    }}
                  >
                    {pathOf(group.id)}
                  </button>
                ))}
            </div>
          </div>
          <button
            className="nx-ctx-item"
            onMouseEnter={() => setCtxMoveOpen(false)}
            onClick={() => {
              setDialog({ mode: 'edit', flat: ctxFlat });
              closeContext();
            }}
          >
            <span className="nx-ctx-left">
              <IcoPencil size={13} />
              <span>编辑书签信息…</span>
            </span>
          </button>
          <button
            className="nx-ctx-item"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(ctxFlat.item.url)
                .then(() => pushToast('已复制网址至剪贴板'))
                .catch(() => pushToast('复制失败，请手动选择网址'));
              closeContext();
            }}
          >
            <span className="nx-ctx-left">
              <IcoCopy size={13} />
              <span>复制网址</span>
            </span>
            <span className="nx-ctx-kbd">⌘C</span>
          </button>
          <button
            className="nx-ctx-item"
            onClick={() => {
              void patchItem(ctxFlat.item.id, { isInbox: true }, `已将「${ctxFlat.item.title}」移入待整理收件箱`);
              closeContext();
            }}
          >
            <span className="nx-ctx-left">
              <IcoInbox size={13} />
              <span>移入待整理收件箱</span>
            </span>
          </button>
          <div className="nx-ctx-sep" />
          <button
            className="nx-ctx-item"
            data-danger="true"
            onClick={() => {
              void deleteItem(ctxFlat.item.id, ctxFlat.item.title);
              closeContext();
            }}
          >
            <span className="nx-ctx-left">
              <IcoTrash size={13} />
              <span>删除书签</span>
            </span>
          </button>
        </div>
      )}

      {dialog && (
        <ItemDialog
          mode={dialog.mode}
          flat={dialog.mode === 'edit' ? dialog.flat : null}
          initialUrl={dialog.mode === 'capture' ? dialog.initialUrl : undefined}
          initialTitle={dialog.mode === 'capture' ? dialog.initialTitle : undefined}
          groups={groups}
          pathOf={pathOf}
          defaultGroupId={folderId ?? roots[0]?.id ?? ''}
          onClose={() => setDialog(null)}
          onSaved={async (message) => {
            setDialog(null);
            pushToast(message);
            await refreshAll();
          }}
          onToast={pushToast}
          onLocate={(groupId) => {
            setDialog(null);
            selectView('folder', groupId);
          }}
        />
      )}

      <div className="nx-toast-wrap">
        {toasts.map((toast) => (
          <div className="nx-toast" key={toast.id}>
            <IcoCheck size={13} />
            <span>{toast.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ dialog */

function ItemDialog({
  mode,
  flat,
  initialUrl,
  initialTitle,
  groups,
  pathOf,
  defaultGroupId,
  onClose,
  onSaved,
  onToast,
  onLocate,
}: {
  mode: 'capture' | 'edit';
  flat: FlatItem | null;
  initialUrl?: string;
  initialTitle?: string;
  groups: PublicGroup[];
  pathOf: (groupId: string) => string;
  defaultGroupId: string;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
  onToast: (text: string) => void;
  onLocate: (groupId: string) => void;
}) {
  const [url, setUrl] = useState(flat?.item.url ?? initialUrl ?? '');
  const [title, setTitle] = useState(flat?.item.title ?? initialTitle ?? '');
  const [description, setDescription] = useState(flat?.item.description ?? '');
  const [groupId, setGroupId] = useState(flat?.group.id ?? defaultGroupId);

  useEffect(() => {
    if (!groupId && defaultGroupId) {
      setGroupId(defaultGroupId);
    }
  }, [groupId, defaultGroupId]);
  const [tags, setTags] = useState((flat?.item.tags ?? []).join(', '));
  const [busy, setBusy] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(
    mode === 'edit' ? '编辑模式，保存后立即生效' : null,
  );
  const [duplicate, setDuplicate] = useState<{
    id: string;
    title: string;
    url: string;
    groupId: string;
    groupPath: string;
    kind: 'exact' | 'domain';
  } | null>(null);
  const lastInspected = useRef<string | null>(flat ? flat.item.url : null);

  const folderOptions = useMemo(
    () =>
      [...groups]
        .map((group) => ({ id: group.id, path: pathOf(group.id) }))
        .sort((a, b) => a.path.localeCompare(b.path, 'zh-CN')),
    [groups, pathOf],
  );

  const inspect = useCallback(
    async (target: string) => {
      const trimmed = target.trim();
      if (!/^https?:\/\//i.test(trimmed)) return;
      setInspecting(true);
      setStatusText('正在抓取网页元信息…');
      try {
        const result = await api.inspectUrl(trimmed);
        setTitle((current) => (mode === 'capture' ? result.title || current : current || result.title));
        setDescription((current) =>
          mode === 'capture' ? result.description || current : current || result.description,
        );
        if (result.duplicate) {
          setDuplicate({ ...result.duplicate, kind: result.duplicateKind === 'exact' ? 'exact' : 'domain' });
        } else {
          setDuplicate(null);
        }
        setStatusText(
          result.httpStatus
            ? `已自动抓取元信息 (${result.httpStatus}${result.finalUrl ? ' · 已跟随重定向' : ''})`
            : '未能抓取网页，可手动填写标题',
        );
      } catch {
        setStatusText('抓取失败，可手动填写');
      } finally {
        setInspecting(false);
      }
    },
    [mode],
  );

  useEffect(() => {
    if (mode !== 'capture') return;
    const timer = window.setTimeout(() => {
      if (!url.trim() || url === lastInspected.current) return;
      lastInspected.current = url;
      void inspect(url);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [url, inspect, mode]);

  const bookmarklet = useMemo(() => {
    const base = `${window.location.origin}/?capture=1`;
    return `javascript:(function(){window.open('${base}&url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank');})();`;
  }, []);

  // React 19 会拦截 JSX 中的 href="javascript:..." 并替换成 throw new Error(...)，
  // 必须通过原生 DOM setAttribute('href', ...) 注入，保证拖到书签栏时拿到真实脚本。
  const setBookmarkletRef = useCallback(
    (node: HTMLAnchorElement | null) => {
      if (node) {
        node.setAttribute('href', bookmarklet);
      }
    },
    [bookmarklet],
  );

  const save = async () => {
    if (!title.trim() || !url.trim() || !groupId) {
      onToast('标题、网址与目标文件夹都不能为空');
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        groupId,
        title: title.trim(),
        url: url.trim(),
        description: description.trim() || null,
        tags: tags
          .split(/[,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      };
      if (mode === 'edit' && flat) {
        await api.updateItem(flat.item.id, body);
        await onSaved(`已保存「${title.trim()}」`);
      } else {
        await api.createItem(body);
        await onSaved(`已收录「${title.trim()}」`);
      }
    } catch (error) {
      onToast(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const mergeInto = async () => {
    if (!duplicate) return;
    setBusy(true);
    try {
      await api.updateItem(duplicate.id, {
        title: title.trim() || duplicate.title,
        description: description.trim() || null,
        tags: tags
          .split(/[,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      await onSaved(`已合并更新「${duplicate.title}」`);
    } catch (error) {
      onToast(error instanceof Error ? error.message : '合并失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="nx-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="nx-dialog" role="dialog" aria-modal="true">
        <div className="nx-dialog-head">
          <span className="nx-dialog-title">{mode === 'edit' ? '编辑书签' : '快速收录书签'}</span>
          <button className="nx-dialog-close" onClick={onClose} title="关闭">
            <IcoClose size={16} />
          </button>
        </div>

        <div className="nx-dialog-body">
          <div className="nx-field">
            <div className="nx-label-row">
              <span className="nx-label">网页 URL</span>
              {statusText && (
                <span className="nx-fetch-state" data-busy={inspecting || undefined}>
                  {!inspecting && <IcoCheck size={13} />}
                  <span>{statusText}</span>
                </span>
              )}
            </div>
            <input
              className="nx-input"
              value={url}
              autoFocus
              placeholder="https://example.com"
              onChange={(event) => setUrl(event.target.value)}
              onBlur={() => {
                if (mode === 'capture' && url.trim() && url !== lastInspected.current) {
                  lastInspected.current = url;
                  void inspect(url);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  lastInspected.current = url;
                  void inspect(url);
                }
              }}
            />
          </div>

          {duplicate && (
            <div className="nx-warn">
              <span className="nx-warn-icon">
                <IcoWarn size={13} />
              </span>
              <div className="nx-warn-body">
                <div className="nx-warn-text">
                  {duplicate.kind === 'exact'
                    ? `库内已存在相同网址的书签「${duplicate.title}」（位于：${duplicate.groupPath}），可一键合并或继续保存为独立条目。`
                    : `库内已有同域名书签「${duplicate.title}」（位于：${duplicate.groupPath}），确认要再存一条子页面吗？`}
                </div>
                <div className="nx-warn-actions">
                  <button className="nx-warn-btn" onClick={() => void mergeInto()} disabled={busy}>
                    合并更新现有书签
                  </button>
                  <button
                    className="nx-warn-btn"
                    onClick={() => {
                      onClose();
                      onLocate(duplicate.groupId);
                    }}
                  >
                    查看已有项
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="nx-field">
            <span className="nx-label">网页标题</span>
            <input
              className="nx-input"
              value={title}
              maxLength={80}
              placeholder="给这个书签起个名字"
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="nx-field">
            <span className="nx-label">描述（可选）</span>
            <textarea
              className="nx-textarea"
              value={description}
              maxLength={300}
              placeholder="一句话说明它的用途"
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="nx-dual">
            <div className="nx-field">
              <span className="nx-label">目标存储文件夹</span>
              <select className="nx-input" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                {folderOptions.length === 0 && <option value="">（暂无文件夹）</option>}
                {folderOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.path}
                  </option>
                ))}
              </select>
            </div>
            <div className="nx-field">
              <span className="nx-label">标签（逗号分隔）</span>
              <input
                className="nx-input"
                value={tags}
                placeholder="文档, 前端, 构建"
                onChange={(event) => setTags(event.target.value)}
              />
            </div>
          </div>

          {mode === 'capture' && (
            <div className="nx-bookmarklet">
              <div className="nx-bookmarklet-text">
                <strong>浏览器一键收录小书签：</strong>
                把右侧药丸拖到浏览器书签栏，在任意网页点一下即可带着标题和地址回到这里收录。
              </div>
              <a
                ref={setBookmarkletRef}
                className="nx-bookmarklet-pill"
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/uri-list', bookmarklet);
                  event.dataTransfer.setData('text/plain', bookmarklet);
                }}
                onClick={(event) => {
                  event.preventDefault();
                  onToast('请将该小书签拖至浏览器书签栏后使用');
                }}
              >
                <BrandMark size={14} />
                <span>存入 PureNav</span>
              </a>
            </div>
          )}
        </div>

        <div className="nx-dialog-foot">
          <button className="nx-btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="nx-btn-primary" onClick={() => void save()} disabled={busy}>
            <IcoCheck size={13} />
            <span>{busy ? '保存中…' : '保存书签'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
