'use client';

interface ConfigSliderProps {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  formatValue?: (value: number) => string;
}

export function ConfigSlider({
  label,
  description,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  disabled,
  formatValue,
}: ConfigSliderProps) {
  const displayValue = formatValue ? formatValue(value) : `${value}${unit || ''}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-text-secondary">{label}</label>
          {description && <p className="text-xs text-text-muted">{description}</p>}
        </div>
        <span className="text-sm font-mono text-accent">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer accent-accent disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <div className="flex justify-between text-xs text-text-muted">
        <span>{formatValue ? formatValue(min) : `${min}${unit || ''}`}</span>
        <span>{formatValue ? formatValue(max) : `${max}${unit || ''}`}</span>
      </div>
    </div>
  );
}
