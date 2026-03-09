// @ts-nocheck
'use client';

import { useState } from 'react';
import { FormField, Input, Toggle, Badge } from '@/components/admin/ui';

interface LabelCategory {
  id: string;
  name: string;
  description: string;
  severity: 'info' | 'warn' | 'alert';
  defaultAction: 'none' | 'blur' | 'hide' | 'block';
  adultOnly: boolean;
}

interface LabelerConfig {
  // Basic Settings
  serviceDID: string;
  displayName: string;
  description: string;

  // Categories
  categories: LabelCategory[];

  // Auto-labeling
  autoLabelingEnabled: boolean;
  autoLabelRules: Array<{
    id: string;
    name: string;
    pattern: string;
    patternType: 'regex' | 'keyword' | 'ai';
    labelCategory: string;
    enabled: boolean;
  }>;

  // AI Integration
  aiEnabled: boolean;
  aiProvider: 'openai' | 'anthropic' | 'local' | 'custom';
  aiEndpoint?: string;
  aiApiKey?: string;
  aiModel?: string;
  aiConfidenceThreshold: number;

  // Rate Limits
  labelRateLimit: number;
  maxLabelsPerRecord: number;

  // Appeals
  appealsEnabled: boolean;
  appealsEmail: string;
  autoExpireDays: number;

  // Subscription
  subscriptionEnabled: boolean;
  subscriptionPrice: number;
}

interface LabelerConfigFormProps {
  config: Partial<LabelerConfig>;
  onChange: (config: Partial<LabelerConfig>) => void;
}

const DEFAULT_CATEGORIES: LabelCategory[] = [
  { id: 'spam', name: 'Spam', description: 'Unwanted commercial content', severity: 'warn', defaultAction: 'hide', adultOnly: false },
  { id: 'nsfw', name: 'NSFW', description: 'Adult content', severity: 'alert', defaultAction: 'blur', adultOnly: true },
  { id: 'hate', name: 'Hate Speech', description: 'Content promoting hatred', severity: 'alert', defaultAction: 'block', adultOnly: false },
  { id: 'violence', name: 'Violence', description: 'Violent or graphic content', severity: 'alert', defaultAction: 'blur', adultOnly: false },
];

export function LabelerConfigForm({ config, onChange }: LabelerConfigFormProps) {
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<LabelCategory | null>(null);

  const updateConfig = <K extends keyof LabelerConfig>(key: K, value: LabelerConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const addCategory = (category: LabelCategory) => {
    updateConfig('categories', [...(config.categories || []), category]);
    setShowCategoryForm(false);
  };

  const removeCategory = (id: string) => {
    updateConfig('categories', (config.categories || []).filter(c => c.id !== id));
  };

  const categories = config.categories || DEFAULT_CATEGORIES;

  return (
    <div className="space-y-6">
      {/* Basic Settings */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Labeler Identity</h4>

        <FormField label="Service DID" hint="Decentralized identifier for this labeler">
          <Input
            value={config.serviceDID || ''}
            onChange={(e) => updateConfig('serviceDID', e.target.value)}
            placeholder="did:plc:..."
          />
        </FormField>

        <FormField label="Display Name">
          <Input
            value={config.displayName || ''}
            onChange={(e) => updateConfig('displayName', e.target.value)}
            placeholder="My Labeler Service"
          />
        </FormField>

        <FormField label="Description">
          <textarea
            value={config.description || ''}
            onChange={(e) => updateConfig('description', e.target.value)}
            placeholder="Describe what this labeler does..."
            rows={3}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </FormField>
      </div>

      {/* Label Categories */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-text-primary">Label Categories</h4>
            <p className="text-sm text-text-muted mt-1">Define label categories for content classification</p>
          </div>
          <button
            onClick={() => setShowCategoryForm(true)}
            className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            Add Category
          </button>
        </div>

        <div className="space-y-2">
          {categories.map((category) => (
            <div key={category.id} className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
              <div className="flex items-center gap-3">
                <Badge variant={
                  category.severity === 'info' ? 'info' :
                  category.severity === 'warn' ? 'warning' : 'danger'
                }>
                  {category.severity}
                </Badge>
                <div>
                  <p className="text-sm font-medium text-text-primary">{category.name}</p>
                  <p className="text-xs text-text-muted">{category.description}</p>
                </div>
                {category.adultOnly && (
                  <Badge variant="purple" size="sm">18+</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">
                  Action: {category.defaultAction}
                </span>
                <button
                  onClick={() => removeCategory(category.id)}
                  className="p-1 text-red-500 hover:bg-red-500/10 rounded"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Auto-labeling */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Auto-labeling Rules</h4>

        <Toggle
          checked={config.autoLabelingEnabled ?? false}
          onChange={(v) => updateConfig('autoLabelingEnabled', v)}
          label="Enable Auto-labeling"
          description="Automatically apply labels based on rules"
        />

        {config.autoLabelingEnabled && (
          <div className="space-y-2">
            {(config.autoLabelRules || []).length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">
                No auto-labeling rules configured
              </p>
            ) : (
              config.autoLabelRules?.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{rule.name}</p>
                    <p className="text-xs text-text-muted font-mono">{rule.pattern}</p>
                  </div>
                  <Badge variant={rule.enabled ? 'success' : 'default'}>
                    {rule.enabled ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
              ))
            )}
            <button className="w-full p-3 border border-dashed border-border rounded-lg text-sm text-text-muted hover:border-accent hover:text-accent transition-colors">
              + Add Auto-labeling Rule
            </button>
          </div>
        )}
      </div>

      {/* AI Integration */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">AI-Powered Labeling</h4>

        <Toggle
          checked={config.aiEnabled ?? false}
          onChange={(v) => updateConfig('aiEnabled', v)}
          label="Enable AI Labeling"
          description="Use AI to detect and label content"
        />

        {config.aiEnabled && (
          <>
            <FormField label="AI Provider">
              <select
                value={config.aiProvider || 'openai'}
                onChange={(e) => updateConfig('aiProvider', e.target.value as any)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="local">Local Model</option>
                <option value="custom">Custom Endpoint</option>
              </select>
            </FormField>

            {config.aiProvider === 'custom' && (
              <FormField label="Custom Endpoint">
                <Input
                  value={config.aiEndpoint || ''}
                  onChange={(e) => updateConfig('aiEndpoint', e.target.value)}
                  placeholder="https://api.example.com/v1/classify"
                />
              </FormField>
            )}

            {(config.aiProvider === 'openai' || config.aiProvider === 'anthropic') && (
              <FormField label="API Key">
                <Input
                  type="password"
                  value={config.aiApiKey || ''}
                  onChange={(e) => updateConfig('aiApiKey', e.target.value)}
                  placeholder="sk-..."
                />
              </FormField>
            )}

            <FormField label="Model">
              <Input
                value={config.aiModel || ''}
                onChange={(e) => updateConfig('aiModel', e.target.value)}
                placeholder={config.aiProvider === 'openai' ? 'gpt-4' : 'claude-3-sonnet'}
              />
            </FormField>

            <FormField label="Confidence Threshold" hint="Minimum confidence (0-1) to apply label">
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={config.aiConfidenceThreshold || 0.8}
                onChange={(e) => updateConfig('aiConfidenceThreshold', parseFloat(e.target.value))}
              />
            </FormField>
          </>
        )}
      </div>

      {/* Rate Limits */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Rate Limits</h4>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Labels per Minute">
            <Input
              type="number"
              min={1}
              value={config.labelRateLimit || 100}
              onChange={(e) => updateConfig('labelRateLimit', parseInt(e.target.value))}
            />
          </FormField>

          <FormField label="Max Labels per Record">
            <Input
              type="number"
              min={1}
              value={config.maxLabelsPerRecord || 10}
              onChange={(e) => updateConfig('maxLabelsPerRecord', parseInt(e.target.value))}
            />
          </FormField>
        </div>
      </div>

      {/* Appeals */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Label Appeals</h4>

        <Toggle
          checked={config.appealsEnabled ?? true}
          onChange={(v) => updateConfig('appealsEnabled', v)}
          label="Enable Appeals"
          description="Allow users to appeal labels"
        />

        {config.appealsEnabled && (
          <>
            <FormField label="Appeals Email">
              <Input
                type="email"
                value={config.appealsEmail || ''}
                onChange={(e) => updateConfig('appealsEmail', e.target.value)}
                placeholder="appeals@example.com"
              />
            </FormField>

            <FormField label="Auto-expire Labels (days)" hint="0 to disable auto-expiry">
              <Input
                type="number"
                min={0}
                value={config.autoExpireDays || 0}
                onChange={(e) => updateConfig('autoExpireDays', parseInt(e.target.value))}
              />
            </FormField>
          </>
        )}
      </div>

      {/* Subscription */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Subscription Settings</h4>

        <Toggle
          checked={config.subscriptionEnabled ?? false}
          onChange={(v) => updateConfig('subscriptionEnabled', v)}
          label="Enable Paid Subscription"
          description="Charge users for access to this labeler"
        />

        {config.subscriptionEnabled && (
          <FormField label="Monthly Price (USD)">
            <Input
              type="number"
              min={0}
              step={0.01}
              value={config.subscriptionPrice || 0}
              onChange={(e) => updateConfig('subscriptionPrice', parseFloat(e.target.value))}
            />
          </FormField>
        )}
      </div>
    </div>
  );
}

export default LabelerConfigForm;
