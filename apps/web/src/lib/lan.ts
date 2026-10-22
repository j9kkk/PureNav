/**
 * LAN reachability probing.
 *
 * A page cannot reliably tell whether an internal host is reachable: CORS hides the
 * response, and our CSP may block the request outright. So a probe answer is only
 * ever used to pick a *default*, and any failure quietly falls back to the public URL.
 * The user's explicit choice always wins and is remembered.
 */

const PROBE_TIMEOUT_MS = 1200;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CHOICE_KEY = 'pn.lan.choice';

type Choice = 'lan' | 'public';

const probeCache = new Map<string, { reachable: boolean; at: number }>();

export function readLanChoice(itemId: string): Choice | null {
  try {
    const raw = localStorage.getItem(CHOICE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, Choice>;
    return map[itemId] ?? null;
  } catch {
    return null;
  }
}

export function writeLanChoice(itemId: string, choice: Choice): void {
  try {
    const raw = localStorage.getItem(CHOICE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, Choice>) : {};
    map[itemId] = choice;
    localStorage.setItem(CHOICE_KEY, JSON.stringify(map));
  } catch {
    // Storage may be unavailable (private mode); the choice just won't persist.
  }
}

/**
 * Probes with `no-cors`, so any completed response counts as reachable. A blocked
 * request (CSP/CORS/DNS) rejects and is treated as unreachable — which is why the
 * result is a hint, not a verdict.
 */
export async function probeLanReachable(url: string): Promise<boolean> {
  const cached = probeCache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.reachable;

  let reachable = false;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    reachable = true;
  } catch {
    reachable = false;
  } finally {
    window.clearTimeout(timer);
  }

  probeCache.set(url, { reachable, at: Date.now() });
  return reachable;
}

/** The URL to actually navigate to for an item, honouring an explicit user choice. */
export function resolveTarget(
  itemId: string,
  publicUrl: string,
  lanUrl: string | null | undefined,
  autoLanReachable: boolean,
): string {
  if (!lanUrl) return publicUrl;
  const choice = readLanChoice(itemId);
  if (choice === 'public') return publicUrl;
  if (choice === 'lan') return lanUrl;
  return autoLanReachable ? lanUrl : publicUrl;
}
