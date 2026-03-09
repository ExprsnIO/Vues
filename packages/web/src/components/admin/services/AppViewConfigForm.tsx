'use client';

import { FormField, Input, Toggle } from '@/components/admin/ui';

interface AppViewConfig {
  // Indexing
  indexingEnabled: boolean;
  indexerConcurrency: number;
  indexerBatchSize: number;
  reindexOnStartup: boolean;

  // Search
  searchEnabled: boolean;
  searchProvider: 'elasticsearch' | 'meilisearch' | 'typesense' | 'internal';
  searchEndpoint: string;
  searchIndexPrefix: string;

  // Feed Generation
  feedGenerationEnabled: boolean;
  feedAlgorithms: string[];
  feedCacheTTL: number;
  feedMaxItems: number;

  // Caching
  cachingEnabled: boolean;
  cacheProvider: 'redis' | 'memcached' | 'memory';
  cacheEndpoint: string;
  cacheTTL: number;

  // Media
  mediaProxyEnabled: boolean;
  mediaCDNUrl: string;
  imageResizeEnabled: boolean;
  maxImageWidth: number;
  maxImageHeight: number;

  // Rate Limits
  apiRateLimit: number;
  searchRateLimit: number;
  feedRateLimit: number;
}

interface AppViewConfigFormProps {
  config: Partial<AppViewConfig>;
  onChange: (config: Partial<AppViewConfig>) => void;
}

export function AppViewConfigForm({ config, onChange }: AppViewConfigFormProps) {
  const updateConfig = <K extends keyof AppViewConfig>(key: K, value: AppViewConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="space-y-6">
      {/* Indexing */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Content Indexing</h4>

        <Toggle
          checked={config.indexingEnabled ?? true}
          onChange={(v) => updateConfig('indexingEnabled', v)}
          label="Enable Indexing"
          description="Index content from the relay for fast retrieval"
        />

        {config.indexingEnabled && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Indexer Concurrency">
                <Input
                  type="number"
                  min={1}
                  value={config.indexerConcurrency || 10}
                  onChange={(e) => updateConfig('indexerConcurrency', parseInt(e.target.value))}
                />
              </FormField>

              <FormField label="Batch Size">
                <Input
                  type="number"
                  min={1}
                  value={config.indexerBatchSize || 100}
                  onChange={(e) => updateConfig('indexerBatchSize', parseInt(e.target.value))}
                />
              </FormField>
            </div>

            <Toggle
              checked={config.reindexOnStartup ?? false}
              onChange={(v) => updateConfig('reindexOnStartup', v)}
              label="Reindex on Startup"
              description="Rebuild indexes when the service starts"
            />
          </>
        )}
      </div>

      {/* Search */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Search Configuration</h4>

        <Toggle
          checked={config.searchEnabled ?? true}
          onChange={(v) => updateConfig('searchEnabled', v)}
          label="Enable Search"
          description="Allow users to search for content"
        />

        {config.searchEnabled && (
          <>
            <FormField label="Search Provider">
              <select
                value={config.searchProvider || 'internal'}
                onChange={(e) => updateConfig('searchProvider', e.target.value as any)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="internal">Internal (Built-in)</option>
                <option value="elasticsearch">Elasticsearch</option>
                <option value="meilisearch">Meilisearch</option>
                <option value="typesense">Typesense</option>
              </select>
            </FormField>

            {config.searchProvider !== 'internal' && (
              <>
                <FormField label="Search Endpoint">
                  <Input
                    value={config.searchEndpoint || ''}
                    onChange={(e) => updateConfig('searchEndpoint', e.target.value)}
                    placeholder="http://localhost:9200"
                  />
                </FormField>

                <FormField label="Index Prefix">
                  <Input
                    value={config.searchIndexPrefix || 'appview_'}
                    onChange={(e) => updateConfig('searchIndexPrefix', e.target.value)}
                    placeholder="appview_"
                  />
                </FormField>
              </>
            )}
          </>
        )}
      </div>

      {/* Feed Generation */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Feed Generation</h4>

        <Toggle
          checked={config.feedGenerationEnabled ?? true}
          onChange={(v) => updateConfig('feedGenerationEnabled', v)}
          label="Enable Feed Generation"
          description="Generate algorithmic feeds for users"
        />

        {config.feedGenerationEnabled && (
          <>
            <FormField label="Feed Algorithms" hint="Select which feed algorithms to enable">
              <div className="flex flex-wrap gap-2">
                {['chronological', 'popular', 'following', 'discover', 'trending'].map((algo) => (
                  <button
                    key={algo}
                    onClick={() => {
                      const current = config.feedAlgorithms || ['chronological', 'following'];
                      if (current.includes(algo)) {
                        updateConfig('feedAlgorithms', current.filter(a => a !== algo));
                      } else {
                        updateConfig('feedAlgorithms', [...current, algo]);
                      }
                    }}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      (config.feedAlgorithms || ['chronological', 'following']).includes(algo)
                        ? 'bg-accent text-text-inverse border-accent'
                        : 'bg-surface border-border hover:border-accent/50'
                    }`}
                  >
                    {algo.charAt(0).toUpperCase() + algo.slice(1)}
                  </button>
                ))}
              </div>
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Feed Cache TTL (seconds)">
                <Input
                  type="number"
                  min={1}
                  value={config.feedCacheTTL || 60}
                  onChange={(e) => updateConfig('feedCacheTTL', parseInt(e.target.value))}
                />
              </FormField>

              <FormField label="Max Feed Items">
                <Input
                  type="number"
                  min={1}
                  value={config.feedMaxItems || 100}
                  onChange={(e) => updateConfig('feedMaxItems', parseInt(e.target.value))}
                />
              </FormField>
            </div>
          </>
        )}
      </div>

      {/* Caching */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Caching</h4>

        <Toggle
          checked={config.cachingEnabled ?? true}
          onChange={(v) => updateConfig('cachingEnabled', v)}
          label="Enable Caching"
          description="Cache frequently accessed data"
        />

        {config.cachingEnabled && (
          <>
            <FormField label="Cache Provider">
              <select
                value={config.cacheProvider || 'memory'}
                onChange={(e) => updateConfig('cacheProvider', e.target.value as any)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="memory">In-Memory</option>
                <option value="redis">Redis</option>
                <option value="memcached">Memcached</option>
              </select>
            </FormField>

            {config.cacheProvider !== 'memory' && (
              <FormField label="Cache Endpoint">
                <Input
                  value={config.cacheEndpoint || ''}
                  onChange={(e) => updateConfig('cacheEndpoint', e.target.value)}
                  placeholder={config.cacheProvider === 'redis' ? 'redis://localhost:6379' : 'localhost:11211'}
                />
              </FormField>
            )}

            <FormField label="Default TTL (seconds)">
              <Input
                type="number"
                min={1}
                value={config.cacheTTL || 300}
                onChange={(e) => updateConfig('cacheTTL', parseInt(e.target.value))}
              />
            </FormField>
          </>
        )}
      </div>

      {/* Media */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Media Handling</h4>

        <Toggle
          checked={config.mediaProxyEnabled ?? true}
          onChange={(v) => updateConfig('mediaProxyEnabled', v)}
          label="Enable Media Proxy"
          description="Proxy media through AppView for privacy and caching"
        />

        {config.mediaProxyEnabled && (
          <>
            <FormField label="CDN URL" hint="Optional CDN base URL for media">
              <Input
                value={config.mediaCDNUrl || ''}
                onChange={(e) => updateConfig('mediaCDNUrl', e.target.value)}
                placeholder="https://cdn.example.com"
              />
            </FormField>

            <Toggle
              checked={config.imageResizeEnabled ?? true}
              onChange={(v) => updateConfig('imageResizeEnabled', v)}
              label="Enable Image Resizing"
              description="Resize images on the fly"
            />

            {config.imageResizeEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Max Width (px)">
                  <Input
                    type="number"
                    min={1}
                    value={config.maxImageWidth || 2000}
                    onChange={(e) => updateConfig('maxImageWidth', parseInt(e.target.value))}
                  />
                </FormField>

                <FormField label="Max Height (px)">
                  <Input
                    type="number"
                    min={1}
                    value={config.maxImageHeight || 2000}
                    onChange={(e) => updateConfig('maxImageHeight', parseInt(e.target.value))}
                  />
                </FormField>
              </div>
            )}
          </>
        )}
      </div>

      {/* Rate Limits */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">API Rate Limits</h4>

        <div className="grid grid-cols-3 gap-4">
          <FormField label="API Rate Limit (req/min)">
            <Input
              type="number"
              min={1}
              value={config.apiRateLimit || 300}
              onChange={(e) => updateConfig('apiRateLimit', parseInt(e.target.value))}
            />
          </FormField>

          <FormField label="Search Rate Limit">
            <Input
              type="number"
              min={1}
              value={config.searchRateLimit || 30}
              onChange={(e) => updateConfig('searchRateLimit', parseInt(e.target.value))}
            />
          </FormField>

          <FormField label="Feed Rate Limit">
            <Input
              type="number"
              min={1}
              value={config.feedRateLimit || 60}
              onChange={(e) => updateConfig('feedRateLimit', parseInt(e.target.value))}
            />
          </FormField>
        </div>
      </div>
    </div>
  );
}

export default AppViewConfigForm;
