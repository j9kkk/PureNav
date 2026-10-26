// Deterministic color palette generator for cards and sections

export interface ItemPalette {
  hue: number;
  color: string;
  glow: string;
  subtleGlow: string;
}

export interface GroupPalette {
  hue: number;
  color: string;
  glow: string;
}

const KNOWN_BRANDS: Record<string, number> = {
  'github.com': 235, // Indigo slate
  'gitlab.com': 22,  // Warm orange
  'youtube.com': 0,  // Red
  'bilibili.com': 335, // Hot pink / magenta
  'twitter.com': 200, // Sky blue
  'x.com': 200,
  'google.com': 215, // Royal blue
  'docker.com': 200, // Azure
  'claude.ai': 24,   // Terracotta orange
  'anthropic.com': 24,
  'openai.com': 165, // Emerald teal
  'chatgpt.com': 165,
  'v2ex.com': 35,    // Amber gold
  'reddit.com': 16,  // Orange red
  'zhihu.com': 212,  // Zhihu blue
  'figma.com': 275,  // Purple violet
  'notion.so': 45,   // Warm sand / yellow
  'netflix.com': 350, // Crimson red
  'spotify.com': 142, // Vibrant green
  'apple.com': 220,  // Slate blue
  'microsoft.com': 205, // Azure blue
  'juejin.cn': 210,  // Tech blue
  'npmjs.com': 355,  // Crimson
  'cloudflare.com': 28, // Cloudflare orange
  'vercel.com': 230, // Midnight indigo
};

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Returns a vibrant, harmonious HSL color palette derived from URL hostname or title.
 */
export function getItemPalette(rawUrl: string, title: string): ItemPalette {
  let host = '';
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
    // Strip common subdomains for brand matching (e.g. api.github.com -> github.com)
    const parts = host.split('.');
    if (parts.length >= 2) {
      const rootDomain = parts.slice(-2).join('.');
      if (KNOWN_BRANDS[rootDomain] !== undefined) {
        const hue = KNOWN_BRANDS[rootDomain];
        return {
          hue,
          color: `hsl(${hue}, 76%, 54%)`,
          glow: `hsla(${hue}, 85%, 55%, 0.22)`,
          subtleGlow: `hsla(${hue}, 80%, 55%, 0.08)`,
        };
      }
    }
  } catch {
    // rawUrl might be relative or non-standard
  }

  // Fallback: Golden-ratio hue distribution based on hash of (host || title)
  const seed = host || title || 'PureNav';
  const hash = hashString(seed);
  // Using golden angle (~137.5 degrees) distributes colors evenly across spectrum
  const hue = Math.round((hash * 137.508) % 360);

  return {
    hue,
    color: `hsl(${hue}, 72%, 52%)`,
    glow: `hsla(${hue}, 80%, 55%, 0.22)`,
    subtleGlow: `hsla(${hue}, 75%, 55%, 0.08)`,
  };
}

/* 分组数据色：苹果系统色相（无紫 / 靛），只用于分组徽标的小面积着色 */
const GROUP_PALETTES: { hue: number; color: string; glow: string }[] = [
  { hue: 211, color: '#0071e3', glow: 'rgba(0, 113, 227, 0.14)' },
  { hue: 187, color: '#30b0c7', glow: 'rgba(48, 176, 199, 0.14)' },
  { hue: 145, color: '#34a853', glow: 'rgba(52, 168, 83, 0.14)' },
  { hue: 35, color: '#e08700', glow: 'rgba(224, 135, 0, 0.14)' },
  { hue: 4, color: '#e0362c', glow: 'rgba(224, 54, 44, 0.14)' },
  { hue: 338, color: '#e0397e', glow: 'rgba(224, 57, 126, 0.14)' },
  { hue: 30, color: '#b0641a', glow: 'rgba(176, 100, 26, 0.14)' },
];

export function getGroupPalette(groupName: string, index: number): GroupPalette {
  const preset = GROUP_PALETTES[index % GROUP_PALETTES.length];
  if (preset) {
    return preset;
  }
  const hash = hashString(groupName);
  const hue = Math.round((hash * 137.508) % 360);
  return {
    hue,
    color: `hsl(${hue}, 62%, 44%)`,
    glow: `hsla(${hue}, 62%, 44%, 0.14)`,
  };
}
