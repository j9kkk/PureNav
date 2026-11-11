import { useEffect, useRef, useState } from 'react';
import { api, type AdminSettings, type SettingsPatch } from '../api';
import { Switch } from '../components/Switch';
import { BookmarkImportModal } from '../components/BookmarkImportModal';
import {
  parseBookmarksHtml,
  bookmarkFoldersToImportPayload,
  type ParsedBookmarkFolder,
} from '../lib/bookmarkParser';
import { clearThemeOverride, resolveTheme, writeThemeOverride } from '../lib/theme';
import { IconDownload, IconUpload } from '../components/icons';

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsPage({ onChanged }: { onChanged: () => void }) {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [pendingBookmarkFolders, setPendingBookmarkFolders] = useState<ParsedBookmarkFolder[] | null>(null);

  // Local inputs to safely isolate IME composition
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const data = await api.settings();
      setSettings(data);
      setTitle(data.identity.title);
      setDescription(data.identity.description ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2400);
  };

  const save = async (patch: SettingsPatch) => {
    setBusy(true);
    setError('');
    try {
      await api.updateSettings(patch);
      flash('设置已保存');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const handleModeChange = (mode: AdminSettings['theme']['mode']) => {
    setSettings((prev) => (prev ? { ...prev, theme: { ...prev.theme, mode } } : prev));
    if (mode === 'auto') {
      clearThemeOverride();
      document.documentElement.dataset.theme = resolveTheme(undefined);
    } else {
      writeThemeOverride(mode);
      document.documentElement.dataset.theme = mode;
    }
    void save({ theme: { mode } });
  };

  const handleDefaultViewChange = (defaultView: 'grid' | 'list') => {
    setSettings((prev) => (prev ? { ...prev, layout: { ...prev.layout, defaultView } } : prev));
    void save({ layout: { defaultView } });
  };

  const handleShowDescriptionChange = (showDescription: boolean) => {
    setSettings((prev) => (prev ? { ...prev, layout: { ...prev.layout, showDescription } } : prev));
    void save({ layout: { showDescription } });
  };

  const handleTitleBlur = () => {
    if (!settings || title === settings.identity.title) return;
    setSettings((prev) => (prev ? { ...prev, identity: { ...prev.identity, title } } : prev));
    void save({ identity: { title } });
  };

  const handleDescriptionBlur = () => {
    if (!settings || description === (settings.identity.description ?? '')) return;
    const nextDesc = description.trim() || null;
    setSettings((prev) => (prev ? { ...prev, identity: { ...prev.identity, description: nextDesc } } : prev));
    void save({ identity: { description: nextDesc } });
  };

  const importJsonFile = async (file: File, mode: 'merge' | 'replace') => {
    if (mode === 'replace' && !window.confirm('替换会清空现有全部分组与站点。确定继续？')) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      const result = await api.importConfig(payload, mode);
      flash(`导入完成，共 ${result.created} 条数据`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    }
  };

  const handleBookmarkFile = async (file: File) => {
    setError('');
    try {
      const text = await file.text();
      const folders = parseBookmarksHtml(text);
      if (folders.length === 0) {
        setError('未在文件中识别到有效的浏览器书签');
        return;
      }
      setPendingBookmarkFolders(folders);
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析书签文件失败');
    }
  };

  const handleImportSelectedBookmarks = async (
    selectedFolders: ParsedBookmarkFolder[],
    mode: 'merge' | 'replace',
  ) => {
    if (mode === 'replace' && !window.confirm('替换会清空现有全部分组与站点。确定继续？')) return;
    try {
      const payload = bookmarkFoldersToImportPayload(selectedFolders);
      const result = await api.importConfig(payload, mode);
      setPendingBookmarkFolders(null);
      flash(`书签导入成功，共创建 ${result.created} 条数据`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    }
  };

  if (!settings) {
    return (
      <div style={{ padding: 24 }}>
        {error && <div className="nx-alert-error">{error}</div>}
        <p style={{ color: 'var(--nx-text-2)', fontSize: 13 }}>加载中…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 920, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <div className="nx-alert-error" role="alert">
          {error}
        </div>
      )}

      {/* 1. 站点标识 */}
      <div className="nx-settings-card">
        <div className="nx-settings-head">
          <span className="nx-settings-title">站点标识</span>
          <span className="nx-settings-desc">
            站点的名称与副标题说明，显示在前台顶部标题与浏览器标签页上。
          </span>
        </div>
        <div className="nx-settings-body">
          <div className="nx-field">
            <label className="nx-label" htmlFor="s-title">
              站点标题
            </label>
            <input
              id="s-title"
              className="nx-input"
              value={title}
              maxLength={60}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              placeholder="PureNav"
            />
          </div>

          <div className="nx-field">
            <label className="nx-label" htmlFor="s-desc">
              站点描述
            </label>
            <input
              id="s-desc"
              className="nx-input"
              value={description}
              maxLength={300}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              placeholder="全能自托管收藏夹管理器"
            />
          </div>
        </div>
      </div>

      {/* 2. 外观与默认视图 */}
      <div className="nx-settings-card">
        <div className="nx-settings-head">
          <span className="nx-settings-title">外观与默认视图</span>
          <span className="nx-settings-desc">
            控制前台工作台的默认配色模式、卡片网格排列方式与描述信息展现。
          </span>
        </div>
        <div className="nx-settings-body">
          <div className="nx-dual">
            <div className="nx-field">
              <label className="nx-label" htmlFor="s-mode">
                默认配色模式
              </label>
              <select
                id="s-mode"
                className="nx-select"
                value={settings.theme.mode}
                onChange={(e) =>
                  handleModeChange(e.target.value as AdminSettings['theme']['mode'])
                }
              >
                <option value="auto">跟随系统 (Auto)</option>
                <option value="light">浅色模式 (Light)</option>
                <option value="dark">深色模式 (Dark)</option>
              </select>
            </div>

            <div className="nx-field">
              <label className="nx-label" htmlFor="s-view">
                默认排列视图
              </label>
              <select
                id="s-view"
                className="nx-select"
                value={settings.layout.defaultView}
                onChange={(e) =>
                  handleDefaultViewChange(e.target.value as 'grid' | 'list')
                }
              >
                <option value="grid">双列高密度卡片 (Grid)</option>
                <option value="list">单列紧凑列表 (List)</option>
              </select>
            </div>
          </div>

          <div style={{ paddingTop: 4 }}>
            <Switch
              id="s-show-description"
              checked={settings.layout.showDescription}
              onChange={handleShowDescriptionChange}
              label="在卡片上显示站点描述"
              description="关闭后卡片将仅显示图标与标题，界面信息更加紧凑"
            />
          </div>
        </div>
      </div>

      {/* 3. 数据备份与迁移 */}
      <div className="nx-settings-card">
        <div className="nx-settings-head">
          <span className="nx-settings-title">数据备份与迁移</span>
          <span className="nx-settings-desc">
            导出备份数据，或从浏览器书签文件 (HTML) / 完整 JSON 配置导入。
          </span>
        </div>
        <div className="nx-settings-body">
          {/* 导出 */}
          <div className="nx-field">
            <span className="nx-label">数据导出</span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="nx-btn-secondary"
                onClick={async () => {
                  try {
                    downloadBlob(await api.exportJson(), 'purenav-export.json');
                    flash('已导出 JSON 备份文件');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : '导出失败');
                  }
                }}
              >
                <IconDownload size={14} />
                <span>导出完整 JSON 备份</span>
              </button>
              <button
                type="button"
                className="nx-btn-secondary"
                onClick={async () => {
                  try {
                    downloadBlob(await api.exportBookmarks(), 'purenav-bookmarks.html');
                    flash('已导出浏览器 HTML 书签文件');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : '导出失败');
                  }
                }}
              >
                <IconDownload size={14} />
                <span>导出浏览器 HTML 书签</span>
              </button>
            </div>
          </div>

          <div className="nx-divider" style={{ height: 1, background: 'var(--nx-line-soft)', margin: '4px 0' }} />

          {/* 导入浏览器书签 */}
          <div className="nx-field">
            <span className="nx-label">导入浏览器收藏夹 (HTML)</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                className="nx-btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                <IconUpload size={14} />
                <span>选择 HTML 书签文件</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,text/html"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleBookmarkFile(file);
                  e.target.value = '';
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--nx-text-3)' }}>
                支持 Chrome、Edge、Safari、Firefox 导出的书签，导入前支持勾选范围。
              </span>
            </div>
          </div>

          <div className="nx-divider" style={{ height: 1, background: 'var(--nx-line-soft)', margin: '4px 0' }} />

          {/* 导入完整 JSON */}
          <div className="nx-field">
            <span className="nx-label">导入完整 JSON 配置</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <select
                className="nx-select nx-select-sm"
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}
                aria-label="JSON 导入模式"
              >
                <option value="merge">追加合并到现有数据</option>
                <option value="replace">清空并替换现有全部数据</option>
              </select>
              <button
                type="button"
                className="nx-btn-secondary"
                onClick={() => jsonInputRef.current?.click()}
              >
                <IconUpload size={14} />
                <span>选择 JSON 备份文件</span>
              </button>
              <input
                ref={jsonInputRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importJsonFile(file, importMode);
                  e.target.value = '';
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--nx-text-3)' }}>
                {importMode === 'merge' ? '保留现有数据并合入' : '危险：会清空现有全部分组与站点'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {notice && (
        <div className="nx-toast-wrap">
          <div className="nx-toast">{notice}</div>
        </div>
      )}

      {pendingBookmarkFolders && (
        <BookmarkImportModal
          initialFolders={pendingBookmarkFolders}
          onClose={() => setPendingBookmarkFolders(null)}
          onImport={handleImportSelectedBookmarks}
        />
      )}
    </div>
  );
}
