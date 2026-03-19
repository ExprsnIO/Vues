'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface RuleCondition {
  type: string;
  operator: string;
  value: string | number | boolean | string[] | number[];
}

interface RuleAction {
  type: string;
  params: Record<string, unknown>;
}

interface PrefetchRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  priority: number;
  logic: 'and' | 'or';
  conditions: RuleCondition[];
  actions: RuleAction[];
  createdAt: string;
  updatedAt: string;
}

interface RulesEngineTabProps {
  disabled?: boolean;
}

const CONDITION_TYPES = [
  'user_activity', 'time_since_last', 'follower_count', 'content_type',
  'geo_region', 'device_type', 'network_quality', 'engagement_rate',
  'time_of_day', 'feed_staleness', 'pds_instance', 'content_language',
  'user_tier', 'video_duration',
];

const ACTION_TYPES = [
  'prefetch_timeline', 'prefetch_video_segments', 'promote_cache_tier',
  'increase_ttl', 'skip_prefetch', 'prefetch_profile', 'prefetch_comments',
  'batch_prefetch', 'edge_replicate', 'warm_federation',
];

const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'between'];

export function RulesEngineTab({ disabled }: RulesEngineTabProps) {
  const queryClient = useQueryClient();
  const [editingRule, setEditingRule] = useState<Partial<PrefetchRule> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { data } = useQuery({
    queryKey: ['admin', 'prefetch', 'rules'],
    queryFn: () => api.get<{ rules: PrefetchRule[] }>('/xrpc/io.exprsn.admin.prefetch.rules'),
  });

  const rules = data?.rules || [];

  const createMutation = useMutation({
    mutationFn: (rule: any) => api.post('/xrpc/io.exprsn.admin.prefetch.rules', rule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'prefetch', 'rules'] });
      setIsCreating(false);
      setEditingRule(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.post(`/xrpc/io.exprsn.admin.prefetch.rules/${id}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'prefetch', 'rules'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.post(`/xrpc/io.exprsn.admin.prefetch.rules/${id}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'prefetch', 'rules'] }),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) =>
      api.post('/xrpc/io.exprsn.admin.prefetch.rules.reorder', { orderedIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'prefetch', 'rules'] }),
  });

  const moveRule = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= rules.length) return;
    const ids = rules.map((r) => r.id);
    [ids[index], ids[newIndex]] = [ids[newIndex], ids[index]];
    reorderMutation.mutate(ids);
  };

  const startCreate = () => {
    setIsCreating(true);
    setEditingRule({
      name: '',
      enabled: true,
      priority: rules.length,
      logic: 'and',
      conditions: [{ type: 'user_activity', operator: 'gte', value: 1 }],
      actions: [{ type: 'prefetch_timeline', params: { limit: 20, priority: 'medium' } }],
    });
  };

  const saveRule = () => {
    if (!editingRule) return;
    createMutation.mutate(editingRule);
  };

  return (
    <div className="space-y-6">
      {/* Rule list */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-secondary">Rules ({rules.length})</h3>
        <button
          onClick={startCreate}
          disabled={disabled}
          className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-text-primary rounded-lg transition-colors disabled:opacity-50"
        >
          Add Rule
        </button>
      </div>

      {rules.length === 0 && !isCreating && (
        <div className="text-center py-8 bg-surface border border-border rounded-lg">
          <p className="text-sm text-text-muted">No rules configured</p>
          <p className="text-xs text-text-muted mt-1">Rules allow fine-grained control over prefetch behavior</p>
        </div>
      )}

      <div className="space-y-2">
        {rules.map((rule, index) => (
          <div key={rule.id} className="bg-surface border border-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveRule(index, 'up')}
                    disabled={index === 0 || disabled}
                    className="text-text-muted hover:text-text-secondary disabled:opacity-30 text-xs"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveRule(index, 'down')}
                    disabled={index === rules.length - 1 || disabled}
                    className="text-text-muted hover:text-text-secondary disabled:opacity-30 text-xs"
                  >
                    ▼
                  </button>
                </div>
                {/* Toggle */}
                <button
                  onClick={() => toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
                  disabled={disabled}
                  className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
                    rule.enabled ? 'bg-success' : 'bg-border'
                  }`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    rule.enabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
                <div>
                  <span className="text-sm font-medium text-text-secondary">{rule.name}</span>
                  {rule.description && <p className="text-xs text-text-muted">{rule.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">
                  {rule.conditions.length} condition{rule.conditions.length !== 1 ? 's' : ''} ({rule.logic.toUpperCase()})
                </span>
                <span className="text-xs text-text-muted">→</span>
                <span className="text-xs text-text-muted">
                  {rule.actions.length} action{rule.actions.length !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => {
                    if (confirm('Delete this rule?')) {
                      deleteMutation.mutate(rule.id);
                    }
                  }}
                  disabled={disabled}
                  className="text-xs text-error hover:text-error ml-2 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create form */}
      {isCreating && editingRule && (
        <div className="bg-surface border border-accent/30 rounded-lg p-4 space-y-4">
          <h4 className="text-sm font-medium text-text-secondary">New Rule</h4>
          <input
            type="text"
            placeholder="Rule name"
            value={editingRule.name || ''}
            onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-text-secondary focus:outline-none focus:border-accent"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Logic:</span>
            {(['and', 'or'] as const).map((logic) => (
              <button
                key={logic}
                onClick={() => setEditingRule({ ...editingRule, logic })}
                className={`px-2 py-1 text-xs rounded ${
                  editingRule.logic === logic
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'bg-border text-text-muted'
                }`}
              >
                {logic.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            <span className="text-xs text-text-muted">Conditions</span>
            {editingRule.conditions?.map((cond, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={cond.type}
                  onChange={(e) => {
                    const conditions = [...(editingRule.conditions || [])];
                    conditions[i] = { ...conditions[i], type: e.target.value };
                    setEditingRule({ ...editingRule, conditions });
                  }}
                  className="bg-background border border-border rounded px-2 py-1 text-xs text-text-secondary"
                >
                  {CONDITION_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
                <select
                  value={cond.operator}
                  onChange={(e) => {
                    const conditions = [...(editingRule.conditions || [])];
                    conditions[i] = { ...conditions[i], operator: e.target.value };
                    setEditingRule({ ...editingRule, conditions });
                  }}
                  className="bg-background border border-border rounded px-2 py-1 text-xs text-text-secondary"
                >
                  {OPERATORS.map((op) => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={String(cond.value)}
                  onChange={(e) => {
                    const conditions = [...(editingRule.conditions || [])];
                    const numVal = Number(e.target.value);
                    conditions[i] = { ...conditions[i], value: isNaN(numVal) ? e.target.value : numVal };
                    setEditingRule({ ...editingRule, conditions });
                  }}
                  className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs text-text-secondary"
                  placeholder="value"
                />
              </div>
            ))}
            <button
              onClick={() => setEditingRule({
                ...editingRule,
                conditions: [...(editingRule.conditions || []), { type: 'user_activity', operator: 'gte', value: 1 }],
              })}
              className="text-xs text-accent hover:text-accent"
            >
              + Add Condition
            </button>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <span className="text-xs text-text-muted">Actions</span>
            {editingRule.actions?.map((action, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={action.type}
                  onChange={(e) => {
                    const actions = [...(editingRule.actions || [])];
                    actions[i] = { ...actions[i], type: e.target.value };
                    setEditingRule({ ...editingRule, actions });
                  }}
                  className="bg-background border border-border rounded px-2 py-1 text-xs text-text-secondary"
                >
                  {ACTION_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
            ))}
            <button
              onClick={() => setEditingRule({
                ...editingRule,
                actions: [...(editingRule.actions || []), { type: 'prefetch_timeline', params: {} }],
              })}
              className="text-xs text-accent hover:text-accent"
            >
              + Add Action
            </button>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setIsCreating(false); setEditingRule(null); }}
              className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary border border-border rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={saveRule}
              disabled={!editingRule.name}
              className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-text-primary rounded-lg disabled:opacity-50"
            >
              Create Rule
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
