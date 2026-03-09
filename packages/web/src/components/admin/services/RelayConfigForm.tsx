// @ts-nocheck
'use client';

import { FormField, Input, Toggle } from '@/components/admin/ui';

interface RelayConfig {
  // Firehose Settings
  firehoseEnabled: boolean;
  firehosePort: number;
  maxSubscriptions: number;
  maxConcurrentConnections: number;

  // Event Filtering
  eventFilters: {
    collections: string[];
    excludeCollections: string[];
    includePDS: string[];
    excludePDS: string[];
  };

  // Subscription Limits
  subscriptionRateLimit: number;
  subscriptionBurstLimit: number;
  maxEventsPerSecond: number;

  // Crawling
  crawlEnabled: boolean;
  crawlInterval: number;
  crawlConcurrency: number;
  crawlPDSList: string[];

  // Persistence
  persistEvents: boolean;
  eventRetentionDays: number;
  sequenceFile: string;

  // Network
  allowedOrigins: string[];
  requireAuth: boolean;
  authTokens: string[];
}

interface RelayConfigFormProps {
  config: Partial<RelayConfig>;
  onChange: (config: Partial<RelayConfig>) => void;
}

export function RelayConfigForm({ config, onChange }: RelayConfigFormProps) {
  const updateConfig = <K extends keyof RelayConfig>(key: K, value: RelayConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const updateEventFilter = <K extends keyof RelayConfig['eventFilters']>(
    key: K,
    value: RelayConfig['eventFilters'][K]
  ) => {
    onChange({
      ...config,
      eventFilters: { ...config.eventFilters, [key]: value },
    });
  };

  return (
    <div className="space-y-6">
      {/* Firehose Settings */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Firehose Settings</h4>

        <Toggle
          checked={config.firehoseEnabled ?? true}
          onChange={(v) => updateConfig('firehoseEnabled', v)}
          label="Enable Firehose"
          description="Stream real-time events to subscribers"
        />

        {config.firehoseEnabled && (
          <div className="grid grid-cols-3 gap-4">
            <FormField label="WebSocket Port">
              <Input
                type="number"
                min={1}
                max={65535}
                value={config.firehosePort || 2470}
                onChange={(e) => updateConfig('firehosePort', parseInt(e.target.value))}
              />
            </FormField>

            <FormField label="Max Subscriptions">
              <Input
                type="number"
                min={1}
                value={config.maxSubscriptions || 1000}
                onChange={(e) => updateConfig('maxSubscriptions', parseInt(e.target.value))}
              />
            </FormField>

            <FormField label="Max Concurrent Connections">
              <Input
                type="number"
                min={1}
                value={config.maxConcurrentConnections || 100}
                onChange={(e) => updateConfig('maxConcurrentConnections', parseInt(e.target.value))}
              />
            </FormField>
          </div>
        )}
      </div>

      {/* Event Filtering */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Event Filtering</h4>
        <p className="text-sm text-text-muted">Filter which events are relayed to subscribers</p>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Include Collections" hint="Leave empty to include all">
            <textarea
              value={(config.eventFilters?.collections || []).join('\n')}
              onChange={(e) => updateEventFilter('collections', e.target.value.split('\n').filter(Boolean))}
              placeholder="app.bsky.feed.post&#10;app.bsky.feed.like"
              rows={4}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </FormField>

          <FormField label="Exclude Collections">
            <textarea
              value={(config.eventFilters?.excludeCollections || []).join('\n')}
              onChange={(e) => updateEventFilter('excludeCollections', e.target.value.split('\n').filter(Boolean))}
              placeholder="app.bsky.graph.block"
              rows={4}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Include PDS Hosts" hint="Leave empty to include all">
            <textarea
              value={(config.eventFilters?.includePDS || []).join('\n')}
              onChange={(e) => updateEventFilter('includePDS', e.target.value.split('\n').filter(Boolean))}
              placeholder="pds.example.com"
              rows={3}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </FormField>

          <FormField label="Exclude PDS Hosts">
            <textarea
              value={(config.eventFilters?.excludePDS || []).join('\n')}
              onChange={(e) => updateEventFilter('excludePDS', e.target.value.split('\n').filter(Boolean))}
              placeholder="blocked-pds.example.com"
              rows={3}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </FormField>
        </div>
      </div>

      {/* Subscription Limits */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Subscription Rate Limits</h4>

        <div className="grid grid-cols-3 gap-4">
          <FormField label="Rate Limit (req/min)">
            <Input
              type="number"
              min={1}
              value={config.subscriptionRateLimit || 60}
              onChange={(e) => updateConfig('subscriptionRateLimit', parseInt(e.target.value))}
            />
          </FormField>

          <FormField label="Burst Limit">
            <Input
              type="number"
              min={1}
              value={config.subscriptionBurstLimit || 10}
              onChange={(e) => updateConfig('subscriptionBurstLimit', parseInt(e.target.value))}
            />
          </FormField>

          <FormField label="Max Events/sec">
            <Input
              type="number"
              min={1}
              value={config.maxEventsPerSecond || 10000}
              onChange={(e) => updateConfig('maxEventsPerSecond', parseInt(e.target.value))}
            />
          </FormField>
        </div>
      </div>

      {/* Crawling */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">PDS Crawling</h4>

        <Toggle
          checked={config.crawlEnabled ?? true}
          onChange={(v) => updateConfig('crawlEnabled', v)}
          label="Enable Crawling"
          description="Actively crawl PDS instances for new events"
        />

        {config.crawlEnabled && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Crawl Interval (seconds)">
                <Input
                  type="number"
                  min={1}
                  value={config.crawlInterval || 30}
                  onChange={(e) => updateConfig('crawlInterval', parseInt(e.target.value))}
                />
              </FormField>

              <FormField label="Crawl Concurrency">
                <Input
                  type="number"
                  min={1}
                  value={config.crawlConcurrency || 10}
                  onChange={(e) => updateConfig('crawlConcurrency', parseInt(e.target.value))}
                />
              </FormField>
            </div>

            <FormField label="PDS List to Crawl" hint="One PDS URL per line">
              <textarea
                value={(config.crawlPDSList || []).join('\n')}
                onChange={(e) => updateConfig('crawlPDSList', e.target.value.split('\n').filter(Boolean))}
                placeholder="https://pds.example.com"
                rows={4}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </FormField>
          </>
        )}
      </div>

      {/* Persistence */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Event Persistence</h4>

        <Toggle
          checked={config.persistEvents ?? true}
          onChange={(v) => updateConfig('persistEvents', v)}
          label="Persist Events"
          description="Store events for replay and historical queries"
        />

        {config.persistEvents && (
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Retention (days)">
              <Input
                type="number"
                min={1}
                value={config.eventRetentionDays || 7}
                onChange={(e) => updateConfig('eventRetentionDays', parseInt(e.target.value))}
              />
            </FormField>

            <FormField label="Sequence File Path">
              <Input
                value={config.sequenceFile || '/data/relay/sequence.db'}
                onChange={(e) => updateConfig('sequenceFile', e.target.value)}
                placeholder="/data/relay/sequence.db"
              />
            </FormField>
          </div>
        )}
      </div>

      {/* Network Security */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Network Security</h4>

        <Toggle
          checked={config.requireAuth ?? false}
          onChange={(v) => updateConfig('requireAuth', v)}
          label="Require Authentication"
          description="Require auth tokens for firehose subscriptions"
        />

        <FormField label="Allowed Origins" hint="CORS allowed origins (one per line)">
          <textarea
            value={(config.allowedOrigins || ['*']).join('\n')}
            onChange={(e) => updateConfig('allowedOrigins', e.target.value.split('\n').filter(Boolean))}
            placeholder="*"
            rows={3}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </FormField>

        {config.requireAuth && (
          <FormField label="Auth Tokens" hint="One token per line">
            <textarea
              value={(config.authTokens || []).join('\n')}
              onChange={(e) => updateConfig('authTokens', e.target.value.split('\n').filter(Boolean))}
              placeholder="token_abc123..."
              rows={3}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </FormField>
        )}
      </div>
    </div>
  );
}

export default RelayConfigForm;
