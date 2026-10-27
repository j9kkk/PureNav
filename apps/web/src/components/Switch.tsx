import type { ChangeEvent } from 'react';

interface SwitchProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function Switch({ id, checked, onChange, label, description, disabled }: SwitchProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    onChange(e.target.checked);
  };

  // 外层 label 包裹了 input，点击标签/轨道时浏览器会原生激活它并触发 change。
  // 这里不能再用 onClick 手动切一次，否则每次点击都会连发两次保存。
  return (
    <label htmlFor={id} className={`switch-wrapper ${disabled ? 'is-disabled' : ''}`}>
      {(label || description) && (
        <div className="switch-text">
          {label && <span className="switch-label">{label}</span>}
          {description && <span className="switch-desc">{description}</span>}
        </div>
      )}
      <div className="switch-track" data-checked={checked ? 'true' : 'false'}>
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={handleChange}
          className="switch-input"
        />
        <span className="switch-thumb" />
      </div>
    </label>
  );
}
