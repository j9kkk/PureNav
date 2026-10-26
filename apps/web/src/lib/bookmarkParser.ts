// Standard Netscape Bookmark File parser (Chrome, Safari, Edge, Firefox, Brave, Arc, etc.)

export interface ParsedBookmarkItem {
  id: string;
  title: string;
  url: string;
  icon?: string;
  selected: boolean;
}

export interface ParsedBookmarkFolder {
  id: string;
  name: string;
  fullPath: string; // e.g. "书签栏 / 开发 / 前端"
  depth: number;
  items: ParsedBookmarkItem[];
  selected: boolean;
  collapsed?: boolean;
}

function decodeHtml(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/');
}

/**
 * Parses standard Netscape Bookmark HTML exported from Chrome, Safari, Edge, Firefox, etc.
 * Supports preservation of hierarchy paths and smart folder flattening.
 */
export function parseBookmarksHtml(htmlContent: string): ParsedBookmarkFolder[] {
  // Folder tree tracker
  interface FolderEntry {
    name: string;
    fullPath: string;
    depth: number;
    items: ParsedBookmarkItem[];
  }

  const folderEntries: FolderEntry[] = [];
  const folderStack: string[] = [];

  // Match folder <H3>, bookmark <A>, and container open/close <DL> / </DL>
  const tagRegex = /<(H3)[^>]*>([\s\S]*?)<\/H3>|<(A)\s+([^>]+)>([\s\S]*?)<\/A>|<\/?(DL)[^>]*>/gi;

  let match: RegExpExecArray | null;
  let itemCounter = 0;

  // Root level virtual folder if any bookmarks exist outside <H3> folders
  const rootItems: ParsedBookmarkItem[] = [];

  while ((match = tagRegex.exec(htmlContent)) !== null) {
    if (match[1]) {
      // <H3> folder title
      const rawTitle = match[2]?.trim().replace(/<[^>]+>/g, '') ?? '';
      const folderTitle = decodeHtml(rawTitle) || '未命名文件夹';
      folderStack.push(folderTitle);

      const fullPath = folderStack.join(' / ');
      folderEntries.push({
        name: folderTitle,
        fullPath,
        depth: folderStack.length - 1,
        items: [],
      });
    } else if (match[3]) {
      // <A HREF="..." ...>title</A>
      const attrs = match[4] ?? '';
      const rawTitle = match[5]?.trim().replace(/<[^>]+>/g, '') ?? '';
      const title = decodeHtml(rawTitle);

      const hrefMatch = attrs.match(/HREF="([^"]+)"/i) || attrs.match(/HREF=([^\s>]+)/i);
      const iconMatch = attrs.match(/ICON="([^"]+)"/i);

      if (hrefMatch) {
        const url = hrefMatch[1]?.trim() ?? '';
        // Only accept standard web URLs (exclude javascript:, chrome://, file:, place:)
        if (/^https?:\/\//i.test(url)) {
          itemCounter++;
          const bookmark: ParsedBookmarkItem = {
            id: `bm-${itemCounter}`,
            title: title || url,
            url,
            icon: iconMatch ? iconMatch[1] : undefined,
            selected: true,
          };

          if (folderEntries.length > 0) {
            folderEntries[folderEntries.length - 1]!.items.push(bookmark);
          } else {
            rootItems.push(bookmark);
          }
        }
      }
    } else if (match[6]) {
      // <DL> or </DL>
      if (match[0].startsWith('</')) {
        folderStack.pop();
      }
    }
  }

  // If there are root items, prepend as "快捷书签"
  const allFolders: FolderEntry[] = [];
  if (rootItems.length > 0) {
    allFolders.push({
      name: '快捷书签',
      fullPath: '快捷书签',
      depth: 0,
      items: rootItems,
    });
  }
  allFolders.push(...folderEntries);

  let folderCounter = 0;
  return allFolders
    .filter((f) => f.items.length > 0)
    .map((f) => {
      folderCounter++;
      return {
        id: `folder-${folderCounter}`,
        name: f.name,
        fullPath: f.fullPath,
        depth: f.depth,
        items: f.items,
        selected: true,
        collapsed: false,
      };
    });
}

/**
 * Converts selected bookmark folders into standard PureNav import payload.
 * 浏览器导出的 base64 data-URI 图标会被丢弃（每个几 KB、动辄数千个，会令配置载荷膨胀数 MB 拖慢前台），
 * 改用 auto 模式由 DuckDuckGo 自动匹配高清 favicon。
 */
export function bookmarkFoldersToImportPayload(folders: ParsedBookmarkFolder[]) {
  const groups = folders.map((folder, gIdx) => ({
    id: folder.id,
    name: folder.fullPath || folder.name,
    sort_order: (gIdx + 1) * 1024,
    visibility: 'public',
    enabled: 1,
  }));

  const items = folders.flatMap((folder) =>
    folder.items.map((item, iIdx) => {
      // data: URI 图标体积过大，统一降级为 auto；仅保留 http(s) 远程图标
      const remoteIcon = item.icon && /^https?:\/\//i.test(item.icon) ? item.icon : null;
      return {
        group_id: folder.id,
        title: item.title,
        url: item.url,
        icon_type: remoteIcon ? 'url' : 'auto',
        icon_ref: remoteIcon,
        open_in_new_tab: 1,
        pinned: 0,
        sort_order: (iIdx + 1) * 1024,
        visibility: 'public',
        enabled: 1,
      };
    }),
  );

  return {
    format: 'purenav/v1',
    groups,
    items,
  };
}
