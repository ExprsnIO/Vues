'use client';

import { FormField, Input } from '@/components/admin/ui';

interface RateLimitConfigProps {
  config: {
    requests: number;
    window: number;
  };
  onChange: (config: { requests: number; window: number }) => void;
  disabled?: boolean;
}

const PRESETS = [
  { name: 'Low', requests: 100, window: 60, description: 'Light usage' },
  { name: 'Standard', requests: 1000, window: 60, description: 'Normal usage' },
  { name: 'High', requests: 5000, window: 60, description: 'Heavy usage' },
  { name: 'Enterprise', requests: 10000, window: 60, description: 'Enterprise tier' },
];

export function RateLimitConfig({ config, onChange, disabled = false }: RateLimitConfigProps) {
  const applyPreset = (preset: typeof PRESETS[0]) => {
    if (disabled) return;
    onChange({ requests: preset.requests, window: preset.window });
  };

  const matchedPreset = PRESETS.find(
    p => p.requests === config.requests && p.window === config.window
  );

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-text-primary">Quick Presets</p>
        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyPreset(preset)}
              disabled={disabled}
              className={`p-3 rounded-lg border text-left transition-colors ${
                matchedPreset?.name === preset.name
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-accent/50 bg-surface-hover'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <p className={`text-sm font-medium ${
                matchedPreset?.name === preset.name ? 'text-accent' : 'text-text-primary'
              }`}>
                {preset.name}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{preset.requests}/min</p>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Config */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Requests" hint="Number of allowed requests">
          <Input
            type="number"
            min={1}
            value={config.requests}
            onChange={(e) => onChange({ ...config, requests: parseInt(e.target.value) || 1 })}
            disabled={disabled}
          />
        </FormField>

        <FormField label="Window (seconds)" hint="Time window for rate limit">
          <select
            value={config.window}
            onChange={(e) => onChange({ ...config, window: parseInt(e.target.value) })}
            disabled={disabled}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          >
            <option value={1}>1 second</option>
            <option value={10}>10 seconds</option>
            <option value={60}>1 minute</option>
            <option value={300}>5 minutes</option>
            <option value={900}>15 minutes</option>
            <option value={3600}>1 hour</option>
          </select>
        </FormField>
      </div>

      {/* Summary */}
      <div className="p-3 bg-surface-hover rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-muted">Effective Rate:</span>
          <span className="text-sm font-medium text-text-primary">
            {config.requests} requests per {config.window >= 60 ? `${config.window / 60} minute${config.window > 60 ? 's' : ''}` : `${config.window} second${config.window > 1 ? 's' : ''}`}
          </span>
        </div>
        {config.window === 60 && (
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-text-muted">Per Hour:</span>
            <span className="text-xs text-text-muted">~{(config.requests * 60).toLocaleString()} requests</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default RateLimitConfig;
