// 以真实收藏夹导出文件为样本，走与前端完全一致的解析/载荷链路导入到本地实例
import { readFileSync } from 'node:fs';
import { parseBookmarksHtml, bookmarkFoldersToImportPayload } from '../apps/web/src/lib/bookmarkParser.ts';

const html = readFileSync('/Users/joker/Documents/favorites_2026_10_25.html', 'utf8');
const folders = parseBookmarksHtml(html);
const folderCount = folders.length;
const itemCount = folders.reduce((sum, f) => sum + f.items.length, 0);
console.log(`解析完成：${folderCount} 个文件夹，${itemCount} 个书签`);

const payload = bookmarkFoldersToImportPayload(folders);
const body = JSON.stringify(payload);
console.log(`载荷大小：${(body.length / 1024 / 1024).toFixed(2)} MB`);

const res = await fetch('http://127.0.0.1:8090/api/v1/admin/import?mode=replace', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Cookie: readFileSync('/tmp/purenav-cookies.txt', 'utf8')
      .split('\n')
      .filter((line) => line.includes('purenav') || line.includes('sid') || line.includes('session'))
      .map((line) => line.split('\t').slice(-2).join('='))
      .join('; '),
  },
  body,
});
const text = await res.text();
console.log(`HTTP ${res.status}: ${text.slice(0, 300)}`);
