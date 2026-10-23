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

  return (
    <label
      htmlFor={id}
      className={`switch-wrapper ${disabled ? 'is-disabled' : ''}`}
      onClick={(e) => {
        // Prevent double toggle if clicked directly on label
        if (e.target instanceof HTMLInputElement) return;
        if (!disabled) onChange(!checked);
      }}
    >
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
