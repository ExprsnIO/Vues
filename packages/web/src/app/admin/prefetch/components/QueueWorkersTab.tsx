'use client';

import { ConfigSlider } from './shared/ConfigSlider';
import { ConfigSelect } from './shared/ConfigSelect';

interface QueueWorkersTabProps {
  config: any;
  updateConfig: (updates: any) => void;
  disabled?: boolean;
}

export function QueueWorkersTab({ config, updateConfig, disabled }: QueueWorkersTabProps) {
  return (
    <div className="space-y-6">
      {/* Timeline Worker */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-text-secondary">Timeline Worker</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConfigSlider
            label="Concurrency"
            description="Max parallel timeline prefetch jobs"
            value={config.queue.timelineWorker.concurrency}
            min={1} max={500} step={5}
            onChange={(v) => updateConfig({ queue: { timelineWorker: { concurrency: v } } })}
            disabled={disabled}
          />
          <ConfigSlider
            label="Retries"
            description="Number of retry attempts on failure"
            value={config.queue.timelineWorker.retries}
            min={0} max={10}
            onChange={(v) => updateConfig({ queue: { timelineWorker: { retries: v } } })}
            disabled={disabled}
          />
          <ConfigSlider
            label="Timeout"
            description="Max time per job before timeout"
            value={config.queue.timelineWorker.timeoutMs}
            min={1000} max={300000} step={1000}
            formatValue={(v) => `${(v / 1000).toFixed(0)}s`}
            onChange={(v) => updateConfig({ queue: { timelineWorker: { timeoutMs: v } } })}
            disabled={disabled}
          />
          <ConfigSlider
            label="Base Delay"
            description="Initial backoff delay between retries"
            value={config.queue.timelineWorker.baseDelayMs}
            min={100} max={60000} step={100}
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`}
            onChange={(v) => updateConfig({ queue: { timelineWorker: { baseDelayMs: v } } })}
            disabled={disabled}
          />
        </div>
        <ConfigSelect
          label="Backoff Type"
          value={config.queue.timelineWorker.backoffType}
          options={[
            { value: 'exponential', label: 'Exponential' },
            { value: 'linear', label: 'Linear' },
          ]}
          onChange={(v) => updateConfig({ queue: { timelineWorker: { backoffType: v } } })}
          disabled={disabled}
        />
      </div>

      {/* Video Segment Worker */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-text-secondary">Video Segment Worker</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConfigSlider
            label="Concurrency"
            description="Max parallel video prefetch jobs"
            value={config.queue.videoWorker.concurrency}
            min={1} max={100} step={1}
            onChange={(v) => updateConfig({ queue: { videoWorker: { concurrency: v } } })}
            disabled={disabled}
          />
          <ConfigSlider
            label="Lookahead"
            description="Number of segments to prefetch ahead"
            value={config.queue.videoWorker.lookahead}
            min={1} max={20}
            onChange={(v) => updateConfig({ queue: { videoWorker: { lookahead: v } } })}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Throughput */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-text-secondary">Throughput</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConfigSlider
            label="Rate Limit"
            description="Max jobs per second"
            value={config.queue.rateLimit}
            min={1} max={10000} step={10}
            unit="/s"
            onChange={(v) => updateConfig({ queue: { rateLimit: v } })}
            disabled={disabled}
          />
          <ConfigSlider
            label="Batch Size"
            description="Number of jobs to process per batch"
            value={config.queue.batchSize}
            min={1} max={1000} step={5}
            onChange={(v) => updateConfig({ queue: { batchSize: v } })}
            disabled={disabled}
          />
        </div>
        <div className="bg-background rounded-lg p-3 text-center">
          <p className="text-xs text-text-muted">Estimated Throughput</p>
          <p className="text-lg font-mono text-accent">
            ~{Math.min(config.queue.rateLimit, config.queue.timelineWorker.concurrency * 10).toLocaleString()} jobs/sec
          </p>
        </div>
      </div>
    </div>
  );
}
