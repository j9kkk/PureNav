import { useState, useMemo } from 'react';
import type { ParsedBookmarkFolder } from '../lib/bookmarkParser';
import {
  IconBookmark,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconFolder,
  IconSearch,
} from './icons';

interface Props {
  initialFolders: ParsedBookmarkFolder[];
  /** 关闭后保留的退出周期：父层 useDelayedUnmount 控制，true 期间播退场动画 */
  exiting?: boolean;
  onClose: () => void;
  onImport: (selectedFolders: ParsedBookmarkFolder[], mode: 'merge' | 'replace') => Promise<void>;
}

export function BookmarkImportModal({ initialFolders, exiting, onClose, onImport }: Props) {
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
    <div
      className="nx-backdrop"
      data-exit={exiting || undefined}
      onClick={onClose}
    >
      <div
        className="nx-dialog nx-dialog-wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="导入浏览器收藏夹"
      >
        {/* Head */}
        <div className="nx-dialog-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ color: 'var(--nx-accent-ink)', display: 'inline-flex', flex: 'none' }}>
              <IconBookmark size={18} />
            </span>
            <span className="nx-dialog-title">导入浏览器收藏夹</span>
            <span className="nx-badge">
              已解析 {folders.length} 个文件夹 · {totalItems} 条书签
            </span>
          </div>
          <button className="nx-dialog-close" onClick={onClose} title="关闭" aria-label="关闭">
            <IconClose size={15} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="nx-bm-toolbar">
          <div className="nx-search" style={{ width: 280, height: 30 }}>
            <IconSearch size={14} />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="搜索书签标题、域名或文件夹…"
              aria-label="搜索书签"
            />
            {filterQuery && (
              <button className="nx-search-clear" onClick={() => setFilterQuery('')} title="清空搜索">
                <IconClose size={12} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="nx-btn-secondary nx-btn-sm" onClick={() => selectAll(true)}>
              全选
            </button>
            <button type="button" className="nx-btn-secondary nx-btn-sm" onClick={() => selectAll(false)}>
              清空
            </button>
          </div>

          <div className="nx-toggle">
            <button
              type="button"
              data-active={viewLayout === 'split' || undefined}
              onClick={() => setViewLayout('split')}
              title="两栏分类视图：左侧文件夹目录，右侧书签列表"
            >
              分栏视图
            </button>
            <button
              type="button"
              data-active={viewLayout === 'accordion' || undefined}
              onClick={() => setViewLayout('accordion')}
              title="展开折叠流式视图"
            >
              折叠列表
            </button>
          </div>

          {viewLayout === 'accordion' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="nx-btn-secondary nx-btn-sm" onClick={() => setAllCollapse(false)}>
                全部展开
              </button>
              <button type="button" className="nx-btn-secondary nx-btn-sm" onClick={() => setAllCollapse(true)}>
                全部收起
              </button>
            </div>
          )}

          <div style={{ flex: 1 }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--nx-text-2)' }}>模式：</span>
            <select
              className="nx-select nx-select-sm"
              value={mode}
              onChange={(e) => setMode(e.target.value as 'merge' | 'replace')}
              aria-label="导入模式"
            >
              <option value="merge">追加合并到现有数据</option>
              <option value="replace">清空并替换全部现有数据</option>
            </select>
          </div>
        </div>

        {/* Body */}
        <div className="nx-dialog-body">
          {visibleFolders.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--nx-text-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <IconSearch size={28} />
              <p>没有匹配「{filterQuery}」的书签或文件夹</p>
              <button className="nx-btn-secondary nx-btn-sm" onClick={() => setFilterQuery('')}>
                清空搜索条件
              </button>
            </div>
          ) : viewLayout === 'split' ? (
            <div className="nx-bm-split">
              {/* Left Folder Nav */}
              <div className="nx-bm-sidebar">
                <div className="nx-bm-sidebar-head">文件夹列表 ({visibleFolders.length})</div>
                <div className="nx-bm-sidebar-list">
                  {visibleFolders.map((folder) => {
                    const selCount = folder.items.filter((it) => it.selected).length;
                    const isAll = folder.items.length > 0 && selCount === folder.items.length;
                    const isPart = selCount > 0 && !isAll;
                    const isCurrent = currentActiveFolder?.id === folder.id;

                    return (
                      <div
                        key={folder.id}
                        className={`nx-bm-folder-item ${isCurrent ? 'is-active' : ''}`}
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
                          aria-label={`选择文件夹 ${folder.name}`}
                        />
                        <span className="nx-bm-folder-name" title={folder.fullPath || folder.name}>
                          {folder.name}
                        </span>
                        <span className="nx-bm-folder-count">
                          {selCount}/{folder.items.length}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Bookmarks Table */}
              <div className="nx-bm-main">
                {currentActiveFolder && (
                  <>
                    <div className="nx-bm-main-head">
                      <span className="nx-bm-main-title">
                        <IconFolder size={14} />
                        <span>{currentActiveFolder.fullPath || currentActiveFolder.name}</span>
                      </span>
                      <button
                        type="button"
                        className="nx-btn-secondary nx-btn-sm"
                        onClick={() => toggleFolder(currentActiveFolder.id)}
                      >
                        {currentActiveFolder.items.every((i) => i.selected) ? '全取消' : '全选本组'}
                      </button>
                    </div>

                    <div className="nx-bm-items-list">
                      {currentActiveFolder.items.map((item) => (
                        <div
                          key={item.id}
                          className={`nx-bm-item-row ${item.selected ? 'is-selected' : ''}`}
                          onClick={() => toggleItem(currentActiveFolder.id, item.id)}
                        >
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => toggleItem(currentActiveFolder.id, item.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`选择书签 ${item.title}`}
                          />
                          <span className="nx-bm-item-icon">
                            {item.icon ? (
                              <img src={item.icon} alt="" />
                            ) : (
                              <span>{item.title.trim().slice(0, 1).toUpperCase() || '·'}</span>
                            )}
                          </span>
                          <div className="nx-bm-item-info">
                            <span className="nx-bm-item-title" title={item.title}>
                              {item.title}
                            </span>
                            <span className="nx-bm-item-url" title={item.url}>
                              {item.url}
                            </span>
                          </div>
                          <a
                            className="nx-bm-item-link"
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
            <div className="nx-bm-accordion-list">
              {visibleFolders.map((folder) => {
                const folderSelectedCount = folder.items.filter((item) => item.selected).length;
                const isAllSelected = folder.items.length > 0 && folderSelectedCount === folder.items.length;
                const isIndeterminate = folderSelectedCount > 0 && !isAllSelected;

                return (
                  <div key={folder.id} className="nx-bm-accordion-card">
                    <div className="nx-bm-accordion-head" onClick={() => toggleCollapse(folder.id)}>
                      <label
                        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minWidth: 0, flex: 1 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = isIndeterminate;
                          }}
                          onChange={() => toggleFolder(folder.id)}
                          aria-label={`选择文件夹 ${folder.name}`}
                        />
                        <IconFolder size={14} />
                        <span className="nx-bm-folder-name" title={folder.fullPath || folder.name}>
                          {folder.fullPath || folder.name}
                        </span>
                        <span className="nx-badge">
                          {folderSelectedCount} / {folder.items.length}
                        </span>
                      </label>
                      <button
                        type="button"
                        className="nx-icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapse(folder.id);
                        }}
                        title={folder.collapsed ? '展开' : '折叠'}
                        aria-label={folder.collapsed ? '展开' : '折叠'}
                      >
                        {folder.collapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
                      </button>
                    </div>

                    {!folder.collapsed && (
                      <div className="nx-bm-items-list" style={{ background: 'var(--nx-canvas)' }}>
                        {folder.items.map((item) => (
                          <div
                            key={item.id}
                            className={`nx-bm-item-row ${item.selected ? 'is-selected' : ''}`}
                            onClick={() => toggleItem(folder.id, item.id)}
                          >
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={() => toggleItem(folder.id, item.id)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`选择书签 ${item.title}`}
                            />
                            <span className="nx-bm-item-icon">
                              {item.icon ? (
                                <img src={item.icon} alt="" />
                              ) : (
                                <span>{item.title.trim().slice(0, 1).toUpperCase() || '·'}</span>
                              )}
                            </span>
                            <div className="nx-bm-item-info">
                              <span className="nx-bm-item-title" title={item.title}>
                                {item.title}
                              </span>
                              <span className="nx-bm-item-url" title={item.url}>
                                {item.url}
                              </span>
                            </div>
                            <a
                              className="nx-bm-item-link"
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
        </div>

        {/* Foot */}
        <div className="nx-dialog-foot" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="nx-badge"
              style={{
                background: 'var(--nx-accent-bg)',
                color: 'var(--nx-accent-ink)',
                borderColor: 'var(--nx-accent-line)',
                fontWeight: 600,
              }}
            >
              已选 {selectedCount} / {totalItems} 项网址
            </span>
            <span style={{ fontSize: 12, color: 'var(--nx-text-2)' }}>
              （跨 {selectedFolderCount} 个文件夹）
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="nx-btn-secondary" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button
              type="button"
              className="nx-btn-primary"
              onClick={handleSubmit}
              disabled={selectedCount === 0 || submitting}
            >
              {submitting ? '正在导入中…' : `确认导入选中的 ${selectedCount} 个网址`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
