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
  const [activeFolderId, setActiveFolderId] = useState<string>(() => initialFolders[0]?.id || '');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [submitting, setSubmitting] = useState(false);
  const [viewLayout, setViewLayout] = useState<'split' | 'accordion'>('split');

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

  const setAllCollapse = (collapsed: boolean) => {
    setFolders((prev) => prev.map((folder) => ({ ...folder, collapsed })));
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
        const folderMatch =
          folder.name.toLowerCase().includes(q) || (folder.fullPath && folder.fullPath.toLowerCase().includes(q));
        const matchedItems = folder.items.filter(
          (item) => item.title.toLowerCase().includes(q) || item.url.toLowerCase().includes(q),
        );
        if (folderMatch) return folder;
        if (matchedItems.length > 0) return { ...folder, items: matchedItems };
        return null;
      })
      .filter((f): f is ParsedBookmarkFolder => f !== null);
  }, [folders, filterQuery]);

  // For split view: the active folder
  const currentActiveFolder = useMemo(() => {
    return visibleFolders.find((f) => f.id === activeFolderId) || visibleFolders[0] || null;
  }, [visibleFolders, activeFolderId]);

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
      <div className="modal modal-wide-stage pn-enter" onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <div className="bm-stage-header">
          <div className="bm-stage-header-info">
            <div className="bm-stage-title-row">
              <span className="bm-stage-icon">🔖</span>
              <h2 className="bm-stage-title">导入浏览器收藏夹</h2>
              <span className="bm-stage-badge">已解析 {folders.length} 个文件夹 / {totalItems} 条书签</span>
            </div>
            <p className="bm-stage-desc">
              支持按文件夹自由勾选导入范围，所有导入的网址均清晰可预览并支持一键外跳验证。
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        {/* Toolbar Controls */}
        <div className="bm-stage-toolbar">
          <div className="bm-search-wrap">
            <span className="bm-search-icon">⌕</span>
            <input
              type="text"
              className="bm-search-input"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="快速搜索书签标题、域名或文件夹…"
            />
            {filterQuery && (
              <button className="bm-search-clear" onClick={() => setFilterQuery('')} title="清空搜索">
                ×
              </button>
            )}
          </div>

          <div className="bm-stage-actions">
            <div className="btn-group">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => selectAll(true)}>
                ✓ 全选
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => selectAll(false)}>
                ✕ 清空
              </button>
            </div>

            <div className="bm-view-switch">
              <button
                type="button"
                className={`bm-view-btn ${viewLayout === 'split' ? 'is-active' : ''}`}
                onClick={() => setViewLayout('split')}
                title="两栏分类视图：左侧文件夹目录，右侧书签列表"
              >
                ⊞ 分栏视图
              </button>
              <button
                type="button"
                className={`bm-view-btn ${viewLayout === 'accordion' ? 'is-active' : ''}`}
                onClick={() => setViewLayout('accordion')}
                title="展开折叠流式视图"
              >
                ☰ 折叠列表
              </button>
            </div>

            {viewLayout === 'accordion' && (
              <div className="btn-group">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAllCollapse(false)}>
                  全部展开
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAllCollapse(true)}>
                  全部收起
                </button>
              </div>
            )}

            <div className="spacer" />

            <div className="bm-mode-selector">
              <span className="bm-mode-label">导入模式：</span>
              <select
                id="bm-import-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as 'merge' | 'replace')}
              >
                <option value="merge">追加合并到现有分组（安全）</option>
                <option value="replace">清空并替换现有全部数据</option>
              </select>
            </div>
          </div>
        </div>

        {/* Main Body */}
        {visibleFolders.length === 0 ? (
          <div className="bm-empty-stage">
            <span className="bm-empty-icon">🔍</span>
            <p>没有匹配「{filterQuery}」的书签或文件夹</p>
            <button className="btn btn-sm" onClick={() => setFilterQuery('')}>
              清空搜索条件
            </button>
          </div>
        ) : viewLayout === 'split' ? (
          /* Two-column Split View: left folder sidebar, right bookmark item list */
          <div className="bm-split-container">
            {/* Left Folders Sidebar */}
            <div className="bm-split-sidebar">
              <div className="bm-sidebar-header">
                <span>文件夹列表 ({visibleFolders.length})</span>
              </div>
              <div className="bm-sidebar-list">
                {visibleFolders.map((folder) => {
                  const selCount = folder.items.filter((it) => it.selected).length;
                  const isAll = folder.items.length > 0 && selCount === folder.items.length;
                  const isPart = selCount > 0 && !isAll;
                  const isCurrent = currentActiveFolder?.id === folder.id;

                  return (
                    <div
                      key={folder.id}
                      className={`bm-folder-nav-item ${isCurrent ? 'is-active' : ''}`}
                      onClick={() => setActiveFolderId(folder.id)}
                    >
                      <input
                        type="checkbox"
                        checked={isAll}
                        ref={(el) => {
                          if (el) el.indeterminate = isPart;
                        }}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleFolder(folder.id);
                        }}
                      />
                      <span className="bm-folder-nav-name" title={folder.fullPath || folder.name}>
                        {folder.name}
                      </span>
                      <span className={`bm-folder-nav-count ${selCount > 0 ? 'has-selected' : ''}`}>
                        {selCount}/{folder.items.length}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Bookmarks Table Panel */}
            <div className="bm-split-main">
              {currentActiveFolder && (
                <>
                  <div className="bm-main-header">
                    <div className="bm-main-folder-title">
                      <span className="bm-main-icon">📁</span>
                      <span className="bm-main-name">{currentActiveFolder.fullPath || currentActiveFolder.name}</span>
                    </div>
                    <div className="bm-main-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => toggleFolder(currentActiveFolder.id)}
                      >
                        {currentActiveFolder.items.every((i) => i.selected) ? '本组全取消' : '本组全选'}
                      </button>
                    </div>
                  </div>

                  <div className="bm-items-table">
                    {currentActiveFolder.items.map((item) => (
                      <div
                        key={item.id}
                        className={`bm-table-row ${item.selected ? 'is-selected' : ''}`}
                        onClick={() => toggleItem(currentActiveFolder.id, item.id)}
                      >
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => toggleItem(currentActiveFolder.id, item.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="bm-row-icon">
                          {item.icon ? (
                            <img src={item.icon} alt="" />
                          ) : (
                            <span>{item.title.trim().slice(0, 1).toUpperCase() || '·'}</span>
                          )}
                        </span>
                        <div className="bm-row-content">
                          <span className="bm-row-title" title={item.title}>
                            {item.title}
                          </span>
                          <span className="bm-row-url" title={item.url}>
                            {item.url}
                          </span>
                        </div>
                        <a
                          className="bm-row-external-link"
                          href={item.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          onClick={(e) => e.stopPropagation()}
                          title="在浏览器新窗口打开此网址测试预览"
                        >
                          ↗ 预览
                        </a>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          /* Accordion Streaming View */
          <div className="bm-folder-list">
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
                      <span className="bm-folder-name" title={folder.fullPath || folder.name}>
                        {folder.fullPath || folder.name}
                      </span>
                      <span className={`bm-folder-badge ${folderSelectedCount > 0 ? 'has-selected' : ''}`}>
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
                    <div className="bm-items-table">
                      {folder.items.map((item) => (
                        <div
                          key={item.id}
                          className={`bm-table-row ${item.selected ? 'is-selected' : ''}`}
                          onClick={() => toggleItem(folder.id, item.id)}
                        >
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => toggleItem(folder.id, item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="bm-row-icon">
                            {item.icon ? (
                              <img src={item.icon} alt="" />
                            ) : (
                              <span>{item.title.trim().slice(0, 1).toUpperCase() || '·'}</span>
                            )}
                          </span>
                          <div className="bm-row-content">
                            <span className="bm-row-title" title={item.title}>
                              {item.title}
                            </span>
                            <span className="bm-row-url" title={item.url}>
                              {item.url}
                            </span>
                          </div>
                          <a
                            className="bm-row-external-link"
                            href={item.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            onClick={(e) => e.stopPropagation()}
                            title="在浏览器新窗口打开此网址测试预览"
                          >
                            ↗ 预览
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Modal Footer Actions */}
        <div className="bm-stage-footer">
          <div className="bm-summary-wrap">
            <span className="bm-summary-pill">
              已选 <strong>{selectedCount}</strong> / {totalItems} 项网址
            </span>
            <span className="bm-summary-folders">
              （跨 {selectedFolderCount} 个文件夹）
            </span>
          </div>
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary btn-import-submit"
            onClick={handleSubmit}
            disabled={selectedCount === 0 || submitting}
          >
            {submitting ? '正在导入中…' : `确认导入选中的 ${selectedCount} 个网址`}
          </button>
        </div>
      </div>
    </div>
  );
}
