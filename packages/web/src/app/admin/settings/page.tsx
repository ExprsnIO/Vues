'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface ConfigItem {
  id: string;
  key: string;
  value: any;
  description?: string;
  updatedAt: string;
  updatedBy?: {
    handle: string;
    avatar?: string;
  };
}

const CONFIG_CATEGORIES: Record<string, string[]> = {
  'Content Moderation': [
    'moderation.autoFlag.enabled',
    'moderation.autoFlag.threshold',
    'moderation.requireApproval',
    'moderation.bannedWords',
  ],
  'User Limits': [
    'limits.upload.maxSize',
    'limits.upload.dailyLimit',
    'limits.comments.maxLength',
    'limits.bio.maxLength',
  ],
  Features: [
    'features.comments.enabled',
    'features.reactions.enabled',
    'features.directMessages.enabled',
    'features.liveStreaming.enabled',
  ],
  'Recommendation Algorithm': [
    'algorithm.recency.weight',
    'algorithm.engagement.weight',
    'algorithm.following.boost',
    'algorithm.newCreator.boost',
  ],
};

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const [editingConfig, setEditingConfig] = useState<ConfigItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'config'],
    queryFn: () => api.getSystemConfig(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) =>
      api.updateSystemConfig({ key, value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'config'] });
      setEditingConfig(null);
      toast.success('Configuration updated');
    },
    onError: () => toast.error('Failed to update configuration'),
  });

  const configs = data?.configs || [];
  const configMap = new Map(configs.map((c: ConfigItem) => [c.key, c]));

  const getConfigItem = (key: string): ConfigItem | undefined => {
    return configMap.get(key);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">System Settings</h1>
        <p className="text-text-muted text-sm mt-1">
          Configure system-wide settings and feature flags
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-surface rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(CONFIG_CATEGORIES).map(([category, keys]) => (
            <div key={category} className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-4 bg-surface-hover border-b border-border">
                <h3 className="font-semibold text-text-primary">{category}</h3>
              </div>
              <div className="divide-y divide-border">
                {keys.map((key) => {
                  const config = getConfigItem(key);
                  const value = config?.value;
                  const displayKey = key.split('.').pop() || key;

                  return (
                    <div
                      key={key}
                      className="px-6 py-4 flex items-center justify-between hover:bg-surface-hover/50 transition-colors"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-text-primary capitalize">
                          {displayKey.replace(/([A-Z])/g, ' $1').trim()}
                        </p>
                        <p className="text-sm text-text-muted font-mono">{key}</p>
                        {config?.description && (
                          <p className="text-sm text-text-secondary mt-1">{config.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <ConfigValueDisplay value={value} configKey={key} />
                        <button
                          onClick={() =>
                            setEditingConfig(config || { id: '', key, value: null, updatedAt: '' })
                          }
                          className="px-3 py-1 text-sm bg-surface-hover hover:bg-border text-text-primary rounded transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Raw Config View */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 bg-surface-hover border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-text-primary">All Configuration Values</h3>
              <span className="text-xs text-text-muted">{configs.length} total</span>
            </div>
            <div className="p-4 overflow-x-auto">
              {configs.length === 0 ? (
                <p className="text-text-muted text-sm text-center py-4">
                  No configuration values set yet
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-text-muted">
                      <th className="pb-2 pr-4">Key</th>
                      <th className="pb-2 pr-4">Value</th>
                      <th className="pb-2 pr-4">Last Updated</th>
                      <th className="pb-2">Updated By</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs">
                    {configs.map((config: ConfigItem) => (
                      <tr key={config.id} className="border-t border-border">
                        <td className="py-2 pr-4 text-text-primary">{config.key}</td>
                        <td className="py-2 pr-4 text-accent">
                          {typeof config.value === 'object'
                            ? JSON.stringify(config.value)
                            : String(config.value)}
                        </td>
                        <td className="py-2 pr-4 text-text-muted">
                          {new Date(config.updatedAt).toLocaleString()}
                        </td>
                        <td className="py-2 text-text-muted">
                          {config.updatedBy?.handle ? `@${config.updatedBy.handle}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingConfig && (
        <EditConfigModal
          config={editingConfig}
          onClose={() => setEditingConfig(null)}
          onSave={(value) => updateMutation.mutate({ key: editingConfig.key, value })}
          isLoading={updateMutation.isPending}
        />
      )}
    </div>
  );
}

function ConfigValueDisplay({ value, configKey }: { value: any; configKey: string }) {
  if (value === undefined || value === null) {
    return <span className="text-text-muted italic">Not set</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <span
        className={`px-2 py-1 text-xs font-medium rounded-full ${
          value ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
        }`}
      >
        {value ? 'Enabled' : 'Disabled'}
      </span>
    );
  }

  if (typeof value === 'number') {
    if (configKey.includes('maxSize')) {
      return (
        <span className="text-text-primary font-mono text-sm">
          {(value / 1024 / 1024).toFixed(0)} MB
        </span>
      );
    }
    if (configKey.includes('weight') || configKey.includes('boost')) {
      return <span className="text-text-primary font-mono text-sm">{(value * 100).toFixed(0)}%</span>;
    }
    return <span className="text-text-primary font-mono text-sm">{value}</span>;
  }

  if (Array.isArray(value)) {
    return <span className="text-text-primary text-sm">{value.length} items</span>;
  }

  return (
    <span className="text-text-primary text-sm truncate max-w-[200px]">{String(value)}</span>
  );
}

function EditConfigModal({
  config,
  onClose,
  onSave,
  isLoading,
}: {
  config: ConfigItem;
  onClose: () => void;
  onSave: (value: any) => void;
  isLoading: boolean;
}) {
  const [valueType, setValueType] = useState<'string' | 'number' | 'boolean' | 'json'>(() => {
    if (config.value === null || config.value === undefined) return 'string';
    if (typeof config.value === 'boolean') return 'boolean';
    if (typeof config.value === 'number') return 'number';
    if (typeof config.value === 'object') return 'json';
    return 'string';
  });

  const [stringValue, setStringValue] = useState(
    typeof config.value === 'object' ? JSON.stringify(config.value, null, 2) : String(config.value ?? '')
  );
  const [numberValue, setNumberValue] = useState(
    typeof config.value === 'number' ? config.value : 0
  );
  const [boolValue, setBoolValue] = useState(
    typeof config.value === 'boolean' ? config.value : false
  );
  const [error, setError] = useState('');

  const handleSave = () => {
    setError('');
    let finalValue: any;

    try {
      switch (valueType) {
        case 'boolean':
          finalValue = boolValue;
          break;
        case 'number':
          finalValue = numberValue;
          break;
        case 'json':
          finalValue = JSON.parse(stringValue);
          break;
        default:
          finalValue = stringValue;
      }
      onSave(finalValue);
    } catch (e) {
      setError('Invalid JSON format');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold text-text-primary mb-2">Edit Configuration</h2>
        <p className="text-sm text-text-muted font-mono mb-4">{config.key}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Value Type</label>
            <div className="flex gap-2">
              {(['string', 'number', 'boolean', 'json'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setValueType(type)}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors capitalize ${
                    valueType === type
                      ? 'bg-accent text-text-inverse'
                      : 'bg-surface-hover text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Value</label>
            {valueType === 'boolean' ? (
              <div className="flex gap-4">
                <button
                  onClick={() => setBoolValue(true)}
                  className={`flex-1 py-3 rounded-lg transition-colors ${
                    boolValue
                      ? 'bg-green-500/20 text-green-500 border border-green-500'
                      : 'bg-surface-hover text-text-secondary'
                  }`}
                >
                  True (Enabled)
                </button>
                <button
                  onClick={() => setBoolValue(false)}
                  className={`flex-1 py-3 rounded-lg transition-colors ${
                    !boolValue
                      ? 'bg-red-500/20 text-red-500 border border-red-500'
                      : 'bg-surface-hover text-text-secondary'
                  }`}
                >
                  False (Disabled)
                </button>
              </div>
            ) : valueType === 'number' ? (
              <input
                type="number"
                value={numberValue}
                onChange={(e) => setNumberValue(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent font-mono"
              />
            ) : valueType === 'json' ? (
              <textarea
                value={stringValue}
                onChange={(e) => setStringValue(e.target.value)}
                rows={8}
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm resize-none"
              />
            ) : (
              <input
                type="text"
                value={stringValue}
                onChange={(e) => setStringValue(e.target.value)}
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              />
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-sm text-yellow-500">
              Changes to system configuration take effect immediately. Please ensure values are correct before saving.
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="flex-1 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
