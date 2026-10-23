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
  gradient: string;
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

const GROUP_PALETTES: { hue: number; color: string; glow: string; gradient: string }[] = [
  {
    hue: 242,
    color: '#6366f1',
    glow: 'rgba(99, 102, 241, 0.16)',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
  },
  {
    hue: 188,
    color: '#06b6d4',
    glow: 'rgba(6, 182, 212, 0.16)',
    gradient: 'linear-gradient(135deg, #06b6d4 0%, #10b981 100%)',
  },
  {
    hue: 345,
    color: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.16)',
    gradient: 'linear-gradient(135deg, #f43f5e 0%, #fb923c 100%)',
  },
  {
    hue: 38,
    color: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.16)',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  },
  {
    hue: 215,
    color: '#3b82f6',
    glow: 'rgba(59, 130, 246, 0.16)',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
  },
  {
    hue: 315,
    color: '#ec4899',
    glow: 'rgba(236, 72, 153, 0.16)',
    gradient: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
  },
  {
    hue: 155,
    color: '#10b981',
    glow: 'rgba(16, 185, 129, 0.16)',
    gradient: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
  },
];

export function getGroupPalette(groupName: string, index: number): GroupPalette {
  const preset = GROUP_PALETTES[index % GROUP_PALETTES.length];
  if (preset) {
    return preset;
  }
  const hash = hashString(groupName);
  const hue = Math.round((hash * 137.508) % 360);
  const color = `hsl(${hue}, 70%, 54%)`;
  const nextColor = `hsl(${(hue + 40) % 360}, 75%, 56%)`;
  return {
    hue,
    color,
    glow: `hsla(${hue}, 75%, 55%, 0.16)`,
    gradient: `linear-gradient(135deg, ${color} 0%, ${nextColor} 100%)`,
  };
}
