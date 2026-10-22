import { useEffect, useState } from 'react';
import { api, type AdminSettings, type SettingsPatch } from '../api';

const PRESET_COLORS = ['#5b8def', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#64748b'];

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsPage({ onChanged }: { onChanged: () => void }) {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');

  const load = async () => {
    try {
      setSettings(await api.settings());
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
      const next = await api.updateSettings(patch);
      setSettings(next);
      flash('已保存');
      // The front page caches its theme, so refresh the shell it reads from.
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File, mode: 'merge' | 'replace') => {
    if (mode === 'replace' && !window.confirm('替换会清空现有全部分组与站点。确定继续？')) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      const result = await api.importConfig(payload, mode);
      flash(`导入完成，共 ${result.created} 条`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    }
  };

  if (!settings) {
    return (
      <div>
        {error && <p className="error-text">{error}</p>}
        <p className="hint">加载中…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620 }}>
      {error && <p className="error-text">{error}</p>}

      <h3 className="group-title">站点信息</h3>
      <div className="field">
        <label htmlFor="s-title">标题</label>
        <input
          id="s-title"
          value={settings.identity.title}
          maxLength={60}
          onChange={(event) => setSettings({ ...settings, identity: { ...settings.identity, title: event.target.value } })}
          onBlur={() => void save({ identity: { title: settings.identity.title } })}
        />
      </div>
      <div className="field">
        <label htmlFor="s-desc">描述</label>
        <input
          id="s-desc"
          value={settings.identity.description ?? ''}
          maxLength={300}
          onChange={(event) =>
            setSettings({ ...settings, identity: { ...settings.identity, description: event.target.value } })
          }
          onBlur={() => void save({ identity: { description: settings.identity.description || null } })}
        />
      </div>

      <h3 className="group-title" style={{ marginTop: 26 }}>主题</h3>
      <div className="field-row">
        <div className="field">
          <label htmlFor="s-mode">配色模式</label>
          <select
            id="s-mode"
            value={settings.theme.mode}
            onChange={(event) => {
              const mode = event.target.value as AdminSettings['theme']['mode'];
              setSettings({ ...settings, theme: { ...settings.theme, mode } });
              void save({ theme: { mode } });
            }}
          >
            <option value="auto">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="s-shadow">阴影</label>
          <select
            id="s-shadow"
            value={settings.theme.shadow}
            onChange={(event) => {
              const shadow = event.target.value as AdminSettings['theme']['shadow'];
              setSettings({ ...settings, theme: { ...settings.theme, shadow } });
              void save({ theme: { shadow } });
            }}
          >
            <option value="soft">柔和</option>
            <option value="strong">明显</option>
            <option value="none">无</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label>主题色</label>
        <div className="swatches">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              className={settings.theme.accent.toLowerCase() === color ? 'swatch swatch-on' : 'swatch'}
              style={{ background: color }}
              aria-label={`主题色 ${color}`}
              onClick={() => {
                setSettings({ ...settings, theme: { ...settings.theme, accent: color } });
                void save({ theme: { accent: color } });
              }}
            />
          ))}
          <input
            type="color"
            className="swatch-picker"
            value={settings.theme.accent}
            onChange={(event) => {
              const accent = event.target.value;
              setSettings({ ...settings, theme: { ...settings.theme, accent } });
              void save({ theme: { accent } });
            }}
            aria-label="自定义主题色"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="s-radius">圆角：{settings.theme.radius}px</label>
        <input
          id="s-radius"
          type="range"
          min={0}
          max={32}
          step={2}
          value={settings.theme.radius}
          onChange={(event) => {
            const radius = Number(event.target.value);
            setSettings({ ...settings, theme: { ...settings.theme, radius } });
          }}
          // Commit on release; dragging should not write on every pixel.
          onMouseUp={() => void save({ theme: { radius: settings.theme.radius } })}
          onTouchEnd={() => void save({ theme: { radius: settings.theme.radius } })}
        />
      </div>

      <h3 className="group-title" style={{ marginTop: 26 }}>布局</h3>
      <div className="field-row">
        <div className="field">
          <label htmlFor="s-density">密度</label>
          <select
            id="s-density"
            value={settings.layout.density}
            onChange={(event) => {
              const density = event.target.value as AdminSettings['layout']['density'];
              setSettings({ ...settings, layout: { ...settings.layout, density } });
              void save({ layout: { density } });
            }}
          >
            <option value="comfortable">宽松</option>
            <option value="compact">紧凑</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="s-size">卡片尺寸</label>
          <select
            id="s-size"
            value={settings.layout.cardSize}
            onChange={(event) => {
              const cardSize = event.target.value as AdminSettings['layout']['cardSize'];
              setSettings({ ...settings, layout: { ...settings.layout, cardSize } });
              void save({ layout: { cardSize } });
            }}
          >
            <option value="sm">小</option>
            <option value="md">中</option>
            <option value="lg">大</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="s-view">默认视图</label>
        <select
          id="s-view"
          value={settings.layout.defaultView}
          onChange={(event) => {
            const defaultView = event.target.value as AdminSettings['layout']['defaultView'];
            setSettings({ ...settings, layout: { ...settings.layout, defaultView } });
            void save({ layout: { defaultView } });
          }}
        >
          <option value="grid">卡片网格</option>
          <option value="list">紧凑列表</option>
        </select>
      </div>

      <div className="field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={settings.layout.showDescription}
            onChange={(event) => {
              const showDescription = event.target.checked;
              setSettings({ ...settings, layout: { ...settings.layout, showDescription } });
              void save({ layout: { showDescription } });
            }}
          />
          在卡片上显示描述
        </label>
      </div>

      <h3 className="group-title" style={{ marginTop: 26 }}>数据</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <button
          className="btn btn-sm"
          onClick={async () => {
            try {
              downloadBlob(await api.exportJson(), 'purenav-export.json');
              flash('已导出 JSON');
            } catch (err) {
              setError(err instanceof Error ? err.message : '导出失败');
            }
          }}
        >
          导出 JSON
        </button>
        <button
          className="btn btn-sm"
          onClick={async () => {
            try {
              downloadBlob(await api.exportBookmarks(), 'purenav-bookmarks.html');
              flash('已导出书签');
            } catch (err) {
              setError(err instanceof Error ? err.message : '导出失败');
            }
          }}
        >
          导出浏览器书签
        </button>
      </div>

      <div className="field">
        <label htmlFor="s-import">导入 JSON</label>
        <div className="icon-upload">
          <select
            id="s-import-mode"
            value={importMode}
            onChange={(event) => setImportMode(event.target.value as 'merge' | 'replace')}
          >
            <option value="merge">合并到现有数据</option>
            <option value="replace">替换全部数据</option>
          </select>
          <input
            id="s-import"
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file, importMode);
              event.target.value = '';
            }}
          />
        </div>
        <span className="hint">
          {importMode === 'merge' ? '保留现有分组与站点，追加导入内容。' : '会清空现有全部分组与站点。'}
        </span>
      </div>

      {busy && <p className="hint">保存中…</p>}
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}
