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
 */
export function parseBookmarksHtml(htmlContent: string): ParsedBookmarkFolder[] {
  const foldersMap = new Map<string, ParsedBookmarkItem[]>();
  const currentPath: string[] = [];

  // Match folder <H3>, bookmark <A>, and container open/close <DL> / </DL>
  const tagRegex = /<(H3)[^>]*>([\s\S]*?)<\/H3>|<(A)\s+([^>]+)>([\s\S]*?)<\/A>|<\/?(DL)[^>]*>/gi;

  let match: RegExpExecArray | null;
  let itemCounter = 0;

  while ((match = tagRegex.exec(htmlContent)) !== null) {
    if (match[1]) {
      // <H3> folder title
      const rawTitle = match[2]?.trim().replace(/<[^>]+>/g, '') ?? '';
      const folderTitle = decodeHtml(rawTitle) || '未命名文件夹';
      currentPath.push(folderTitle);
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
          const folderName = currentPath.length > 0 ? currentPath[currentPath.length - 1]! : '快捷书签';
          if (!foldersMap.has(folderName)) {
            foldersMap.set(folderName, []);
          }
          itemCounter++;
          foldersMap.get(folderName)!.push({
            id: `bm-${itemCounter}`,
            title: title || url,
            url,
            icon: iconMatch ? iconMatch[1] : undefined,
            selected: true,
          });
        }
      }
    } else if (match[6]) {
      // <DL> or </DL>
      if (match[0].startsWith('</')) {
        currentPath.pop();
      }
    }
  }

  let folderCounter = 0;
  return Array.from(foldersMap.entries())
    .filter(([_, items]) => items.length > 0)
    .map(([name, items]) => {
      folderCounter++;
      return {
        id: `folder-${folderCounter}`,
        name,
        items,
        selected: true,
        collapsed: false,
      };
    });
}

/**
 * Converts selected bookmark folders into standard PureNav import payload.
 */
export function bookmarkFoldersToImportPayload(folders: ParsedBookmarkFolder[]) {
  const groups = folders.map((folder, gIdx) => ({
    id: folder.id,
    name: folder.name,
    sort_order: (gIdx + 1) * 1024,
    visibility: 'public',
    enabled: 1,
  }));

  const items = folders.flatMap((folder) =>
    folder.items.map((item, iIdx) => ({
      group_id: folder.id,
      title: item.title,
      url: item.url,
      icon_type: item.icon ? 'url' : 'auto',
      icon_ref: item.icon || null,
      open_in_new_tab: 1,
      pinned: 0,
      sort_order: (iIdx + 1) * 1024,
      visibility: 'public',
      enabled: 1,
    })),
  );

  return {
    format: 'purenav/v1',
    groups,
    items,
  };
}
