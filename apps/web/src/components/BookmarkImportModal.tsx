import { useState, useMemo } from 'react';
import type { ParsedBookmarkFolder, ParsedBookmarkItem } from '../lib/bookmarkParser';
import { formatDisplayHost } from '../lib/punycode';

interface Props {
  initialFolders: ParsedBookmarkFolder[];
  onClose: () => void;
  onImport: (selectedFolders: ParsedBookmarkFolder[], mode: 'merge' | 'replace') => Promise<void>;
}

export function BookmarkImportModal({ initialFolders, onClose, onImport }: Props) {
  const [folders, setFolders] = useState<ParsedBookmarkFolder[]>(initialFolders);
  const [filterQuery, setFilterQuery] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [submitting, setSubmitting] = useState(false);

  const toggleFolder = (folderId: string) => {
    setFolders((prev) =>
      prev.map((folder) => {
        if (folder.id !== folderId) return folder;
        const nextState = !folder.selected;
        return {
          ...folder,
          selected: nextState,
          items: folder.items.map((item) => ({ ...item, selected: nextState })),
        };
      }),
    );
  };

  const toggleItem = (folderId: string, itemId: string) => {
    setFolders((prev) =>
      prev.map((folder) => {
        if (folder.id !== folderId) return folder;
        const nextItems = folder.items.map((item) =>
          item.id === itemId ? { ...item, selected: !item.selected } : item,
        );
        const hasSelected = nextItems.some((item) => item.selected);
        return {
          ...folder,
          selected: hasSelected,
          items: nextItems,
        };
      }),
    );
  };

  const toggleCollapse = (folderId: string) => {
    setFolders((prev) =>
      prev.map((folder) => (folder.id === folderId ? { ...folder, collapsed: !folder.collapsed } : folder)),
    );
  };

  const selectAll = (selected: boolean) => {
    setFolders((prev) =>
      prev.map((folder) => ({
        ...folder,
        selected,
        items: folder.items.map((item) => ({ ...item, selected })),
      })),
    );
  };

  const totalItems = useMemo(() => {
    return folders.reduce((sum, f) => sum + f.items.length, 0);
  }, [folders]);

  const selectedCount = useMemo(() => {
    return folders.reduce((sum, f) => sum + f.items.filter((item) => item.selected).length, 0);
  }, [folders]);

  const selectedFolderCount = useMemo(() => {
    return folders.filter((f) => f.items.some((item) => item.selected)).length;
  }, [folders]);

  // Filtered view
  const visibleFolders = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return folders;
    return folders
      .map((folder) => {
        const folderMatch = folder.name.toLowerCase().includes(q);
        const matchedItems = folder.items.filter(
          (item) => item.title.toLowerCase().includes(q) || item.url.toLowerCase().includes(q),
        );
        if (folderMatch) return folder;
        if (matchedItems.length > 0) return { ...folder, items: matchedItems };
        return null;
      })
      .filter((f): f is ParsedBookmarkFolder => f !== null);
  }, [folders, filterQuery]);

  const handleSubmit = async () => {
    if (selectedCount === 0 || submitting) return;
    setSubmitting(true);
    try {
      const payloadFolders = folders
        .map((folder) => ({
          ...folder,
          items: folder.items.filter((item) => item.selected),
        }))
        .filter((folder) => folder.items.length > 0);

      await onImport(payloadFolders, mode);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-large pn-enter" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">导入浏览器收藏夹</h2>
            <p className="modal-subtitle">
              已解析 {folders.length} 个书签文件夹，共 {totalItems} 个网址。请勾选导入范围：
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="bm-toolbar">
          <div className="bm-search-wrap">
            <span className="bm-search-icon">⌕</span>
            <input
              type="text"
              className="bm-search-input"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="快速过滤书签或文件夹…"
            />
          </div>

          <div className="bm-actions-strip">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => selectAll(true)}>
              全选
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => selectAll(false)}>
              清空
            </button>
            <div className="spacer" />
            <div className="bm-mode-selector">
              <label htmlFor="bm-import-mode">导入策略：</label>
              <select
                id="bm-import-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as 'merge' | 'replace')}
              >
                <option value="merge">追加合并到现有分组</option>
                <option value="replace">清空并替换现有数据</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bm-folder-list">
          {visibleFolders.length === 0 && (
            <div className="bm-empty-hint">没有匹配「{filterQuery}」的书签</div>
          )}

          {visibleFolders.map((folder) => {
            const folderSelectedCount = folder.items.filter((item) => item.selected).length;
            const isAllSelected = folder.items.length > 0 && folderSelectedCount === folder.items.length;
            const isIndeterminate = folderSelectedCount > 0 && !isAllSelected;

            return (
              <div key={folder.id} className="bm-folder-card">
                <div className="bm-folder-header">
                  <label className="bm-checkbox-label">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isIndeterminate;
                      }}
                      onChange={() => toggleFolder(folder.id)}
                    />
                    <span className="bm-folder-icon">📁</span>
                    <span className="bm-folder-name">{folder.name}</span>
                    <span className="bm-folder-badge">
                      {folderSelectedCount} / {folder.items.length}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="bm-toggle-collapse"
                    onClick={() => toggleCollapse(folder.id)}
                    title={folder.collapsed ? '展开' : '折叠'}
                  >
                    <span className={`bm-arrow ${folder.collapsed ? 'is-collapsed' : ''}`}>▼</span>
                  </button>
                </div>

                {!folder.collapsed && (
                  <div className="bm-items-grid">
                    {folder.items.map((item) => (
                      <label key={item.id} className="bm-item-row" data-selected={item.selected}>
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => toggleItem(folder.id, item.id)}
                        />
                        <span className="bm-item-icon">
                          {item.icon ? (
                            <img src={item.icon} alt="" />
                          ) : (
                            <span>{item.title.trim().slice(0, 1).toUpperCase() || '·'}</span>
                          )}
                        </span>
                        <div className="bm-item-info">
                          <span className="bm-item-title" title={item.title}>
                            {item.title}
                          </span>
                          <span className="bm-item-host" title={item.url}>
                            {formatDisplayHost(item.url)}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-actions bm-modal-footer">
          <span className="bm-summary-count">
            已勾选 <strong>{selectedCount}</strong> 个书签（涵盖 {selectedFolderCount} 个分组）
          </span>
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={selectedCount === 0 || submitting}
          >
            {submitting ? '导入中…' : `导入选中的 ${selectedCount} 个书签`}
          </button>
        </div>
      </div>
    </div>
  );
}
