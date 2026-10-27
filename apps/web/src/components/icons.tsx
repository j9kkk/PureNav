// 统一的 1.5px 描边线性图标（SF Symbols 风格），替代文字字形与 emoji。
interface IconProps {
  size?: number;
}

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

export function IconSearch({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="7" cy="7" r="4.6" />
      <path d="M10.6 10.6L14 14" />
    </svg>
  );
}

export function IconGrid({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="currentColor" stroke="none">
      <rect x="2" y="2" width="5" height="5" rx="1.5" />
      <rect x="9" y="2" width="5" height="5" rx="1.5" />
      <rect x="2" y="9" width="5" height="5" rx="1.5" />
      <rect x="9" y="9" width="5" height="5" rx="1.5" />
    </svg>
  );
}

export function IconListRows({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
    </svg>
  );
}

export function IconSun({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" />
    </svg>
  );
}

export function IconMoon({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M13.2 9.3A5.6 5.6 0 1 1 6.7 2.8a4.5 4.5 0 0 0 6.5 6.5z" />
    </svg>
  );
}

export function IconSliders({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M2.5 4.5h11M2.5 11.5h11" />
      <circle cx="10" cy="4.5" r="1.9" fill="var(--bg-solid, #fff)" />
      <circle cx="6" cy="11.5" r="1.9" fill="var(--bg-solid, #fff)" />
    </svg>
  );
}

export function IconPlus({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function IconUser({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="8" cy="5.2" r="2.7" />
      <path d="M2.8 13.6c.7-2.4 2.8-3.7 5.2-3.7s4.5 1.3 5.2 3.7" />
    </svg>
  );
}

export function IconHome({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M2.8 7.2L8 2.8l5.2 4.4M4 6.4v6.8h8V6.4" />
    </svg>
  );
}

export function IconLogout({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M6.5 2.5H3.5v11h3M6.5 8h7M10.8 5.2L13.5 8l-2.7 2.8" />
    </svg>
  );
}

export function IconDownload({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M8 2.5v7M5 6.7L8 9.5l3-2.8M2.8 12.8h10.4" />
    </svg>
  );
}

export function IconArrowUpRight({ size = 12 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4.5 11.5L11.5 4.5M5.8 4.5h5.7v5.7" />
    </svg>
  );
}

export function IconChevronRight({ size = 10 }: IconProps) {
  return (
    <svg {...svgProps(size)} strokeWidth={1.8}>
      <path d="M5.5 3l4.2 5-4.2 5" />
    </svg>
  );
}

export function IconChevronDown({ size = 11 }: IconProps) {
  return (
    <svg {...svgProps(size)} strokeWidth={1.8}>
      <path d="M3 5.5l5 4.2 5-4.2" />
    </svg>
  );
}

export function IconGrip({ size = 12 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="currentColor" stroke="none">
      <circle cx="5.5" cy="3.5" r="1.2" />
      <circle cx="10.5" cy="3.5" r="1.2" />
      <circle cx="5.5" cy="8" r="1.2" />
      <circle cx="10.5" cy="8" r="1.2" />
      <circle cx="5.5" cy="12.5" r="1.2" />
      <circle cx="10.5" cy="12.5" r="1.2" />
    </svg>
  );
}

export function IconBookmark({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 2.8h8v10.4L8 9.9l-4 3.3z" />
    </svg>
  );
}

export function IconFolder({ size = 14 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M2.2 4.4c0-.8.6-1.4 1.4-1.4h2.3l1.5 1.7h4.7c.8 0 1.4.6 1.4 1.4v5.5c0 .8-.6 1.4-1.4 1.4H3.6c-.8 0-1.4-.6-1.4-1.4z" />
    </svg>
  );
}

export function IconPencil({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5.2 12.8 2.5 13.5l.7-2.7L11.5 2.5z" />
      <path d="M9.5 4.5l2 2" />
    </svg>
  );
}

export function IconSlashCircle({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M4.1 4.1l7.8 7.8" />
    </svg>
  );
}

export function IconCheckCircle({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M5.2 8.2l2 2 3.8-4" />
    </svg>
  );
}

export function IconTrash({ size = 15 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M2.5 4.2h11M6 4.2V2.8a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.4M4 4.2l.7 8.3a1.5 1.5 0 0 0 1.5 1.3h3.6a1.5 1.5 0 0 0 1.5-1.3l.7-8.3M6.5 7.2v4.5M9.5 7.2v4.5" />
    </svg>
  );
}

