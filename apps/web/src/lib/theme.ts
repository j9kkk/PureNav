import type { SiteSettings } from '../types';

const OVERRIDE_KEY = 'pn.theme.override';

export type ThemeMode = 'light' | 'dark';

/**
 * A manual toggle always wins over the site's own mode, and is remembered, so a
 * visitor who prefers dark does not get flipped back on every reload.
 */
export function readThemeOverride(): ThemeMode | null {
  try {
    const value = localStorage.getItem(OVERRIDE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function writeThemeOverride(mode: ThemeMode): void {
  try {
    localStorage.setItem(OVERRIDE_KEY, mode);
  } catch {
    // Private mode: the choice simply won't persist.
  }
}

export function clearThemeOverride(): void {
  try {
    localStorage.removeItem(OVERRIDE_KEY);
  } catch {
    // ignore
  }
}

export function systemTheme(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Effective theme: manual override, else the site setting, else the OS preference. */
export function resolveTheme(mode: SiteSettings['theme']['mode'] | undefined): ThemeMode {
  const override = readThemeOverride();
  if (override) return override;
  if (mode === 'light' || mode === 'dark') return mode;
  return systemTheme();
}

const SHADOWS = {
  none: 'none',
  soft: 'var(--shadow-soft)',
  strong: 'var(--shadow-strong)',
} as const;

/** Paints the site's theme onto :root. Idempotent, so calling it on every render is safe. */
export function applyTheme(site: Partial<SiteSettings> | undefined): void {
  const root = document.documentElement;
  const theme = site?.theme;

  root.dataset.theme = resolveTheme(theme?.mode);

  if (theme?.accent) root.style.setProperty('--accent', theme.accent);
  if (typeof theme?.radius === 'number') root.style.setProperty('--radius', `${theme.radius}px`);
  if (theme?.shadow) root.style.setProperty('--shadow', SHADOWS[theme.shadow] ?? SHADOWS.soft);
}

export interface LayoutVars {
  density?: 'compact' | 'comfortable';
  cardSize?: 'sm' | 'md' | 'lg';
  showDescription?: boolean;
  defaultView?: 'grid' | 'list';
}

/** Normalises layout settings into attributes the CSS understands. */
export function layoutAttributes(layout: LayoutVars | undefined): {
  density: 'compact' | 'comfortable';
  size: 'sm' | 'md' | 'lg';
  view: 'grid' | 'list';
  showDescription: boolean;
} {
  return {
    density: layout?.density ?? 'comfortable',
    size: layout?.cardSize ?? 'md',
    view: layout?.defaultView ?? 'grid',
    showDescription: layout?.showDescription !== false,
  };
}
