import type { SiteSettings } from '../types';

export type ThemeMode = 'light' | 'dark';

export function systemTheme(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Effective theme. The site owns the theme, so there is no per-visitor override:
 * `light` / `dark` from the site settings win, and the legacy `auto` value (still
 * reachable through the API and old databases) falls back to the OS preference.
 */
export function resolveTheme(mode: SiteSettings['theme']['mode'] | undefined): ThemeMode {
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
