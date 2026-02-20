'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type Tab = 'system' | 'environment';
type Environment = 'development' | 'staging' | 'production';
type EnvView = 'variables' | 'archives' | 'compare';

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

interface EnvVariable {
  key: string;
  value: string;
  isSecret: boolean;
  description?: string;
  category?: string;
  hasValue?: boolean;
}

interface EnvConfig {
  environment: Environment;
  variables: EnvVariable[];
  lastModified: string;
  version: number;
  variableCount: number;
  secretCount: number;
}

interface EnvArchive {
  id: string;
  environment: Environment;
  version: number;
  archivedAt: string;
  archivedBy?: string;
  reason?: string;
  gitCommit?: string;
  variableCount: number;
}

interface ConfigDiff {
  added: { key: string; category?: string; isSecret?: boolean }[];
  removed: { key: string; category?: string; isSecret?: boolean }[];
  modified: { key: string }[];
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

const ENV_CATEGORIES = [
  { id: 'database', label: 'Database', icon: DatabaseIcon },
  { id: 'auth', label: 'Authentication', icon: KeyIcon },
  { id: 'api', label: 'API & Services', icon: ServerIcon },
  { id: 'storage', label: 'Storage', icon: CloudIcon },
  { id: 'email', label: 'Email', icon: MailIcon },
  { id: 'monitoring', label: 'Monitoring', icon: ChartIcon },
  { id: 'feature', label: 'Feature Flags', icon: FlagIcon },
  { id: 'external', label: 'External APIs', icon: LinkIcon },
  { id: 'general', label: 'General', icon: SettingsIcon },
];

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('system');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">System Settings</h1>
        <p className="text-text-muted text-sm mt-1">
          Configure system settings, feature flags, and environment variables
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-border pb-px">
        <button
          onClick={() => setActiveTab('system')}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === 'system'
              ? 'text-accent'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          System Config
          {activeTab === 'system' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('environment')}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === 'environment'
              ? 'text-accent'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          Environment Variables
          {activeTab === 'environment' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
          )}
        </button>
      </div>

      {activeTab === 'system' ? <SystemConfigTab /> : <EnvironmentConfigTab />}
    </div>
  );
}

// ============================================================================
// System Config Tab
// ============================================================================

function SystemConfigTab() {
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 bg-surface rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
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

// ============================================================================
// Environment Config Tab
// ============================================================================

function EnvironmentConfigTab() {
  const queryClient = useQueryClient();
  const [selectedEnv, setSelectedEnv] = useState<Environment>('development');
  const [envView, setEnvView] = useState<EnvView>('variables');
  const [compareEnv, setCompareEnv] = useState<Environment>('staging');
  const [editingVariable, setEditingVariable] = useState<EnvVariable | null>(null);
  const [isAddingVariable, setIsAddingVariable] = useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);

  // Fetch current environment
  const { data: currentEnvData } = useQuery({
    queryKey: ['admin', 'config', 'currentEnv'],
    queryFn: async () => {
      const res = await fetch('/api/io.exprsn.config.getCurrentEnvironment');
      return res.json();
    },
  });

  // Fetch all configs
  const { data: configsData, isLoading } = useQuery({
    queryKey: ['admin', 'envConfig', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/io.exprsn.config.getAllConfigs');
      return res.json();
    },
  });

  // Fetch archives
  const { data: archivesData } = useQuery({
    queryKey: ['admin', 'envConfig', 'archives', selectedEnv],
    queryFn: async () => {
      const res = await fetch(`/api/io.exprsn.config.listArchives?environment=${selectedEnv}`);
      return res.json();
    },
    enabled: envView === 'archives',
  });

  // Fetch comparison
  const { data: compareData } = useQuery({
    queryKey: ['admin', 'envConfig', 'compare', selectedEnv, compareEnv],
    queryFn: async () => {
      const res = await fetch(`/api/io.exprsn.config.compare?env1=${selectedEnv}&env2=${compareEnv}`);
      return res.json();
    },
    enabled: envView === 'compare',
  });

  // Fetch validation
  const { data: validationData } = useQuery({
    queryKey: ['admin', 'envConfig', 'validate', selectedEnv],
    queryFn: async () => {
      const res = await fetch(`/api/io.exprsn.config.validate?environment=${selectedEnv}`);
      return res.json();
    },
  });

  // Update config mutation
  const updateConfigMutation = useMutation({
    mutationFn: async ({ environment, variables }: { environment: Environment; variables: EnvVariable[] }) => {
      const res = await fetch('/api/io.exprsn.config.updateConfig', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment, variables }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'envConfig'] });
      toast.success('Configuration updated');
    },
    onError: () => toast.error('Failed to update configuration'),
  });

  // Set variable mutation
  const setVariableMutation = useMutation({
    mutationFn: async (data: { environment: Environment; key: string; value: string; description?: string }) => {
      const res = await fetch('/api/io.exprsn.config.setVariable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'envConfig'] });
      setEditingVariable(null);
      setIsAddingVariable(false);
      toast.success('Variable saved');
    },
    onError: () => toast.error('Failed to save variable'),
  });

  // Delete variable mutation
  const deleteVariableMutation = useMutation({
    mutationFn: async ({ environment, key }: { environment: Environment; key: string }) => {
      const res = await fetch('/api/io.exprsn.config.deleteVariable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment, key }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'envConfig'] });
      toast.success('Variable deleted');
    },
    onError: () => toast.error('Failed to delete variable'),
  });

  // Rollback mutation
  const rollbackMutation = useMutation({
    mutationFn: async (archiveId: string) => {
      const res = await fetch('/api/io.exprsn.config.rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archiveId }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'envConfig'] });
      toast.success('Configuration rolled back');
    },
    onError: () => toast.error('Failed to rollback configuration'),
  });

  // Promote mutation
  const promoteMutation = useMutation({
    mutationFn: async ({ fromEnvironment, toEnvironment, excludeKeys }: { fromEnvironment: Environment; toEnvironment: Environment; excludeKeys?: string[] }) => {
      const res = await fetch('/api/io.exprsn.config.promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromEnvironment, toEnvironment, excludeKeys }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'envConfig'] });
      setShowPromoteModal(false);
      toast.success(`Configuration promoted. ${data.diff?.addedCount || 0} added, ${data.diff?.modifiedCount || 0} modified.`);
    },
    onError: () => toast.error('Failed to promote configuration'),
  });

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: async ({ environment, message }: { environment: Environment; message: string }) => {
      const res = await fetch('/api/io.exprsn.config.commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment, message }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'envConfig'] });
      toast.success(`Changes committed: ${data.commit}`);
    },
    onError: () => toast.error('Failed to commit changes'),
  });

  // Switch environment mutation
  const switchEnvMutation = useMutation({
    mutationFn: async (environment: Environment) => {
      const res = await fetch('/api/io.exprsn.config.switchEnvironment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment }),
      });
      return res.json();
    },
    onSuccess: (_, environment) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'config', 'currentEnv'] });
      toast.success(`Switched to ${environment}`);
    },
    onError: () => toast.error('Failed to switch environment'),
  });

  const configs = configsData?.configs || {};
  const currentConfig: EnvConfig | undefined = configs[selectedEnv];
  const archives: EnvArchive[] = archivesData?.archives || [];
  const validation = validationData;
  const comparison: { diff: ConfigDiff; summary: { totalDifferences: number } } | undefined = compareData;

  const envs: { id: Environment; label: string; color: string }[] = [
    { id: 'development', label: 'Development', color: 'blue' },
    { id: 'staging', label: 'Staging', color: 'yellow' },
    { id: 'production', label: 'Production', color: 'red' },
  ];

  // Group variables by category
  const groupedVariables = currentConfig?.variables.reduce((acc, v) => {
    const cat = v.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(v);
    return acc;
  }, {} as Record<string, EnvVariable[]>) || {};

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-surface rounded-xl animate-pulse" />
        <div className="h-64 bg-surface rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Environment Selector */}
      <div className="grid grid-cols-3 gap-4">
        {envs.map((env) => {
          const config = configs[env.id];
          const isActive = currentEnvData?.environment === env.id;
          const isSelected = selectedEnv === env.id;

          return (
            <button
              key={env.id}
              onClick={() => setSelectedEnv(env.id)}
              className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                isSelected
                  ? `border-${env.color}-500 bg-${env.color}-500/10`
                  : 'border-border bg-surface hover:border-text-muted'
              }`}
            >
              {isActive && (
                <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-500 rounded-full">
                  Active
                </span>
              )}
              <h4 className="font-semibold text-text-primary">{env.label}</h4>
              {config && (
                <div className="mt-2 space-y-1 text-sm text-text-muted">
                  <p>{config.variableCount} variables</p>
                  <p>{config.secretCount} secrets</p>
                  <p className="text-xs">v{config.version}</p>
                </div>
              )}
              {!config && (
                <p className="mt-2 text-sm text-text-muted italic">Not configured</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Validation Status */}
      {validation && (
        <div className={`p-4 rounded-xl border ${
          validation.valid
            ? 'bg-green-500/10 border-green-500/20'
            : 'bg-red-500/10 border-red-500/20'
        }`}>
          <div className="flex items-center gap-2">
            {validation.valid ? (
              <CheckIcon className="w-5 h-5 text-green-500" />
            ) : (
              <AlertIcon className="w-5 h-5 text-red-500" />
            )}
            <span className={validation.valid ? 'text-green-500' : 'text-red-500'}>
              {validation.valid ? 'Configuration is valid' : `${validation.errors?.length || 0} validation errors`}
            </span>
          </div>
          {validation.errors?.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-red-400">
              {validation.errors.map((err: string, i: number) => (
                <li key={i}>- {err}</li>
              ))}
            </ul>
          )}
          {validation.warnings?.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-yellow-400">
              {validation.warnings.map((warn: string, i: number) => (
                <li key={i}>- {warn}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['variables', 'archives', 'compare'] as EnvView[]).map((view) => (
            <button
              key={view}
              onClick={() => setEnvView(view)}
              className={`px-4 py-2 text-sm rounded-lg transition-colors capitalize ${
                envView === view
                  ? 'bg-accent text-text-inverse'
                  : 'bg-surface-hover text-text-secondary hover:text-text-primary'
              }`}
            >
              {view}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {selectedEnv !== 'production' && (
            <button
              onClick={() => setShowPromoteModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg transition-colors"
            >
              <PromoteIcon className="w-4 h-4" />
              Promote to {selectedEnv === 'development' ? 'Staging' : 'Production'}
            </button>
          )}
          {currentEnvData?.environment !== selectedEnv && (
            <button
              onClick={() => switchEnvMutation.mutate(selectedEnv)}
              disabled={switchEnvMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg transition-colors disabled:opacity-50"
            >
              <SwitchIcon className="w-4 h-4" />
              Make Active
            </button>
          )}
          <button
            onClick={() => setIsAddingVariable(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add Variable
          </button>
        </div>
      </div>

      {/* Variables View */}
      {envView === 'variables' && currentConfig && (
        <div className="space-y-4">
          {ENV_CATEGORIES.map((category) => {
            const variables = groupedVariables[category.id];
            if (!variables?.length) return null;
            const Icon = category.icon;

            return (
              <div key={category.id} className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="px-6 py-4 bg-surface-hover border-b border-border flex items-center gap-3">
                  <Icon className="w-5 h-5 text-text-muted" />
                  <h3 className="font-semibold text-text-primary">{category.label}</h3>
                  <span className="text-xs text-text-muted">({variables.length})</span>
                </div>
                <div className="divide-y divide-border">
                  {variables.map((variable) => (
                    <div
                      key={variable.key}
                      className="px-6 py-4 flex items-center justify-between hover:bg-surface-hover/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm text-text-primary truncate">
                            {variable.key}
                          </p>
                          {variable.isSecret && (
                            <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-500 rounded">
                              Secret
                            </span>
                          )}
                        </div>
                        {variable.description && (
                          <p className="text-sm text-text-muted mt-1 truncate">
                            {variable.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4 ml-4">
                        <span className="font-mono text-sm text-accent max-w-[200px] truncate">
                          {variable.isSecret ? '••••••••' : variable.value || <span className="italic text-text-muted">empty</span>}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setEditingVariable(variable)}
                            className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded transition-colors"
                          >
                            <EditIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete ${variable.key}?`)) {
                                deleteVariableMutation.mutate({ environment: selectedEnv, key: variable.key });
                              }
                            }}
                            className="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Archives View */}
      {envView === 'archives' && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 bg-surface-hover border-b border-border">
            <h3 className="font-semibold text-text-primary">Configuration Archives</h3>
            <p className="text-sm text-text-muted mt-1">
              Previous versions are automatically archived before changes
            </p>
          </div>
          {archives.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              No archives yet. Archives are created automatically when configuration changes.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {archives.map((archive) => (
                <div
                  key={archive.id}
                  className="px-6 py-4 flex items-center justify-between hover:bg-surface-hover/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-text-primary">
                        v{archive.version}
                      </span>
                      <span className="text-sm text-text-muted">
                        {new Date(archive.archivedAt).toLocaleString()}
                      </span>
                      {archive.gitCommit && (
                        <span className="font-mono text-xs text-accent">
                          {archive.gitCommit.slice(0, 7)}
                        </span>
                      )}
                    </div>
                    {archive.reason && (
                      <p className="text-sm text-text-muted mt-1">{archive.reason}</p>
                    )}
                    <p className="text-xs text-text-muted mt-1">
                      {archive.variableCount} variables
                      {archive.archivedBy && ` • Archived by ${archive.archivedBy}`}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Rollback to v${archive.version}? Current configuration will be archived.`)) {
                        rollbackMutation.mutate(archive.id);
                      }
                    }}
                    disabled={rollbackMutation.isPending}
                    className="px-4 py-2 text-sm bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Rollback
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Compare View */}
      {envView === 'compare' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-text-primary font-medium">{selectedEnv}</span>
            <span className="text-text-muted">vs</span>
            <select
              value={compareEnv}
              onChange={(e) => setCompareEnv(e.target.value as Environment)}
              className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            >
              {envs.filter((e) => e.id !== selectedEnv).map((env) => (
                <option key={env.id} value={env.id}>
                  {env.label}
                </option>
              ))}
            </select>
          </div>

          {comparison && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-4 bg-surface-hover border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-text-primary">Comparison Results</h3>
                <span className="text-sm text-text-muted">
                  {comparison.summary.totalDifferences} differences
                </span>
              </div>
              <div className="p-6 space-y-6">
                {comparison.diff.added.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-green-500 mb-2 flex items-center gap-2">
                      <PlusIcon className="w-4 h-4" />
                      Added in {compareEnv} ({comparison.diff.added.length})
                    </h4>
                    <div className="space-y-1">
                      {comparison.diff.added.map((v) => (
                        <div key={v.key} className="flex items-center gap-2 text-sm">
                          <span className="font-mono text-text-primary">{v.key}</span>
                          {v.isSecret && (
                            <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-500 rounded">secret</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {comparison.diff.removed.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-red-500 mb-2 flex items-center gap-2">
                      <MinusIcon className="w-4 h-4" />
                      Missing in {compareEnv} ({comparison.diff.removed.length})
                    </h4>
                    <div className="space-y-1">
                      {comparison.diff.removed.map((v) => (
                        <div key={v.key} className="flex items-center gap-2 text-sm">
                          <span className="font-mono text-text-primary">{v.key}</span>
                          {v.isSecret && (
                            <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-500 rounded">secret</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {comparison.diff.modified.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-blue-500 mb-2 flex items-center gap-2">
                      <EditIcon className="w-4 h-4" />
                      Modified ({comparison.diff.modified.length})
                    </h4>
                    <div className="space-y-1">
                      {comparison.diff.modified.map((v) => (
                        <div key={v.key} className="text-sm font-mono text-text-primary">
                          {v.key}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {comparison.summary.totalDifferences === 0 && (
                  <p className="text-text-muted text-center py-4">
                    Configurations are identical
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Variable Modal */}
      {(editingVariable || isAddingVariable) && (
        <VariableModal
          variable={editingVariable}
          environment={selectedEnv}
          onClose={() => {
            setEditingVariable(null);
            setIsAddingVariable(false);
          }}
          onSave={(data) => setVariableMutation.mutate(data)}
          isLoading={setVariableMutation.isPending}
        />
      )}

      {/* Promote Modal */}
      {showPromoteModal && (
        <PromoteModal
          fromEnv={selectedEnv}
          toEnv={selectedEnv === 'development' ? 'staging' : 'production'}
          onClose={() => setShowPromoteModal(false)}
          onPromote={(excludeKeys) => promoteMutation.mutate({
            fromEnvironment: selectedEnv,
            toEnvironment: selectedEnv === 'development' ? 'staging' : 'production',
            excludeKeys,
          })}
          isLoading={promoteMutation.isPending}
        />
      )}
    </div>
  );
}

// ============================================================================
// Modals
// ============================================================================

function VariableModal({
  variable,
  environment,
  onClose,
  onSave,
  isLoading,
}: {
  variable: EnvVariable | null;
  environment: Environment;
  onClose: () => void;
  onSave: (data: { environment: Environment; key: string; value: string; description?: string }) => void;
  isLoading: boolean;
}) {
  const [key, setKey] = useState(variable?.key || '');
  const [value, setValue] = useState(variable?.value || '');
  const [description, setDescription] = useState(variable?.description || '');
  const [showValue, setShowValue] = useState(!variable?.isSecret);
  const isEditing = !!variable;

  const handleSubmit = () => {
    if (!key.trim()) {
      toast.error('Key is required');
      return;
    }
    onSave({ environment, key: key.trim(), value, description: description.trim() || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold text-text-primary mb-4">
          {isEditing ? 'Edit Variable' : 'Add Variable'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Key</label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
              disabled={isEditing}
              placeholder="DATABASE_URL"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Value</label>
            <div className="relative">
              <input
                type={showValue ? 'text' : 'password'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Enter value..."
                className="w-full px-4 py-2 pr-12 bg-surface border border-border rounded-lg text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => setShowValue(!showValue)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-text-muted hover:text-text-primary"
              >
                {showValue ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this variable for?"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-400">
              Environment: <strong>{environment}</strong>. Changes will be archived automatically.
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
            onClick={handleSubmit}
            disabled={isLoading}
            className="flex-1 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : isEditing ? 'Update' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PromoteModal({
  fromEnv,
  toEnv,
  onClose,
  onPromote,
  isLoading,
}: {
  fromEnv: Environment;
  toEnv: Environment;
  onClose: () => void;
  onPromote: (excludeKeys: string[]) => void;
  isLoading: boolean;
}) {
  const [excludeKeys, setExcludeKeys] = useState<string[]>([]);
  const [newExcludeKey, setNewExcludeKey] = useState('');

  const addExcludeKey = () => {
    if (newExcludeKey.trim() && !excludeKeys.includes(newExcludeKey.trim())) {
      setExcludeKeys([...excludeKeys, newExcludeKey.trim()]);
      setNewExcludeKey('');
    }
  };

  const removeExcludeKey = (key: string) => {
    setExcludeKeys(excludeKeys.filter((k) => k !== key));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold text-text-primary mb-2">Promote Configuration</h2>
        <p className="text-text-muted mb-4">
          Copy configuration from <strong>{fromEnv}</strong> to <strong>{toEnv}</strong>
        </p>

        <div className="space-y-4">
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-sm text-yellow-500">
              The target environment's current configuration will be archived before promotion.
              You can exclude specific keys from being copied.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Exclude Keys (optional)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newExcludeKey}
                onChange={(e) => setNewExcludeKey(e.target.value)}
                placeholder="DATABASE_URL"
                className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                onClick={addExcludeKey}
                className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
              >
                Add
              </button>
            </div>
            {excludeKeys.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {excludeKeys.map((key) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-surface-hover rounded text-sm font-mono"
                  >
                    {key}
                    <button
                      onClick={() => removeExcludeKey(key)}
                      className="text-text-muted hover:text-red-500"
                    >
                      <CloseIcon className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
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
            onClick={() => onPromote(excludeKeys)}
            disabled={isLoading}
            className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Promoting...' : `Promote to ${toEnv}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

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

// ============================================================================
// Icons
// ============================================================================

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
    </svg>
  );
}

function CloudIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.303-3.558a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function PromoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
    </svg>
  );
}

function SwitchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function MinusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}
