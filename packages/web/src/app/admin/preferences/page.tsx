'use client';

import { useState, useEffect } from 'react';

interface AdminPreferences {
  defaultTab: string;
  density: 'comfortable' | 'compact' | 'spacious';
  autoRefreshInterval: number; // seconds, 0 = disabled
  showQuickStats: boolean;
  sidebarDefaultCollapsed: boolean;
  tablePageSize: number;
  dateFormat: '12h' | '24h';
  showSystemNotifications: boolean;
  defaultDomainView: 'global' | 'last-selected';
}

const PREFS_KEY = 'admin-preferences';

const DEFAULT_PREFS: AdminPreferences = {
  defaultTab: 'overview',
  density: 'comfortable',
  autoRefreshInterval: 30,
  showQuickStats: true,
  sidebarDefaultCollapsed: false,
  tablePageSize: 25,
  dateFormat: '12h',
  showSystemNotifications: true,
  defaultDomainView: 'global',
};

function loadPrefs(): AdminPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    return stored ? { ...DEFAULT_PREFS, ...JSON.parse(stored) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: AdminPreferences) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export default function AdminPreferencesPage() {
  const [prefs, setPrefs] = useState<AdminPreferences>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  const update = (key: keyof AdminPreferences, value: any) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    savePrefs(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const resetAll = () => {
    setPrefs(DEFAULT_PREFS);
    savePrefs(DEFAULT_PREFS);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard Preferences</h1>
          <p className="text-sm text-text-muted mt-1">Customize your admin dashboard experience</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs text-success animate-in fade-in">Saved</span>
          )}
          <button
            onClick={resetAll}
            className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary border border-border rounded-lg transition-colors"
          >
            Reset Defaults
          </button>
        </div>
      </div>

      {/* Layout & Display */}
      <Section title="Layout & Display">
        <SelectRow
          label="Display Density"
          description="Controls spacing and padding throughout the dashboard"
          value={prefs.density}
          options={[
            { value: 'compact', label: 'Compact — Less whitespace, more data' },
            { value: 'comfortable', label: 'Comfortable — Balanced (default)' },
            { value: 'spacious', label: 'Spacious — More breathing room' },
          ]}
          onChange={(v) => update('density', v)}
        />
        <ToggleRow
          label="Sidebar Collapsed by Default"
          description="Start with the sidebar collapsed on page load"
          checked={prefs.sidebarDefaultCollapsed}
          onChange={(v) => update('sidebarDefaultCollapsed', v)}
        />
        <ToggleRow
          label="Show Quick Stats"
          description="Display live user/content stats in the sidebar"
          checked={prefs.showQuickStats}
          onChange={(v) => update('showQuickStats', v)}
        />
      </Section>

      {/* Data & Tables */}
      <Section title="Data & Tables">
        <SelectRow
          label="Table Page Size"
          description="Default number of rows per page in data tables"
          value={String(prefs.tablePageSize)}
          options={[
            { value: '10', label: '10 rows' },
            { value: '25', label: '25 rows (default)' },
            { value: '50', label: '50 rows' },
            { value: '100', label: '100 rows' },
          ]}
          onChange={(v) => update('tablePageSize', parseInt(v))}
        />
        <SelectRow
          label="Auto-Refresh Interval"
          description="How often dashboards poll for updated data"
          value={String(prefs.autoRefreshInterval)}
          options={[
            { value: '0', label: 'Disabled' },
            { value: '10', label: 'Every 10 seconds' },
            { value: '30', label: 'Every 30 seconds (default)' },
            { value: '60', label: 'Every minute' },
            { value: '300', label: 'Every 5 minutes' },
          ]}
          onChange={(v) => update('autoRefreshInterval', parseInt(v))}
        />
        <SelectRow
          label="Time Format"
          description="How timestamps are displayed"
          value={prefs.dateFormat}
          options={[
            { value: '12h', label: '12-hour (3:45 PM)' },
            { value: '24h', label: '24-hour (15:45)' },
          ]}
          onChange={(v) => update('dateFormat', v)}
        />
      </Section>

      {/* Navigation */}
      <Section title="Navigation">
        <SelectRow
          label="Default Domain View"
          description="What to show when opening the admin dashboard"
          value={prefs.defaultDomainView}
          options={[
            { value: 'global', label: 'Global View — Show all domains' },
            { value: 'last-selected', label: 'Last Selected — Resume where you left off' },
          ]}
          onChange={(v) => update('defaultDomainView', v)}
        />
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        <ToggleRow
          label="System Notifications"
          description="Show browser notifications for important admin events"
          checked={prefs.showSystemNotifications}
          onChange={(v) => update('showSystemNotifications', v)}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-medium text-text-primary">{title}</h2>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="text-sm text-text-primary">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-border'
        }`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`} />
      </button>
    </div>
  );
}

function SelectRow({ label, description, value, options, onChange }: {
  label: string; description: string; value: string;
  options: Array<{ value: string; label: string }>; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex-1 mr-4">
        <p className="text-sm text-text-primary">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent min-w-[200px]"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
