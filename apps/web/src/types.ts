export interface IconRef {
  type: 'auto' | 'url' | 'iconify' | 'asset' | 'text';
  ref: string | null;
  assetId: string | null;
}

export interface PublicItem {
  id: string;
  title: string;
  url: string;
  description: string | null;
  icon: IconRef;
  openInNewTab: boolean;
  pinned: boolean;
  tags: string[];
}

export interface PublicGroup {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  collapsed: boolean;
  items: PublicItem[];
}

export interface SiteSettings {
  identity: { title: string; logo: string | null; favicon: string | null; description: string | null };
  theme: { mode: 'light' | 'dark' | 'auto'; accent: string; radius: number; shadow: 'none' | 'soft' | 'strong' };
  layout: { density: 'compact' | 'comfortable'; cardSize: 'sm' | 'md' | 'lg'; showDescription: boolean; defaultView: 'grid' | 'list' };
}

export interface PublicConfig {
  version: number;
  site: SiteSettings;
  groups: PublicGroup[];
  tags: { id: string; name: string; color: string | null }[];
}

export interface AdminGroup extends PublicGroup {
  sortOrder: number;
  visibility: 'public' | 'private';
  enabled: boolean;
  itemCount: number;
}

export interface AdminItem extends PublicItem {
  groupId: string;
  lanUrl: string | null;
  sortOrder: number;
  visibility: 'public' | 'private';
  enabled: boolean;
}

export interface SessionUser {
  id: string;
  username: string;
  role: 'admin' | 'viewer';
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
