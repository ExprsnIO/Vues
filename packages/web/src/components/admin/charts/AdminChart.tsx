'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart } from '@/components/analytics/LineChart';
import { BarChart } from '@/components/analytics/BarChart';
import { api } from '@/lib/api';

type ChartType = 'line' | 'bar';
type Period = '7d' | '30d' | '90d';
type Metric = 'users' | 'videos' | 'views' | 'likes' | 'reports' | 'renders';

interface AdminChartProps {
  title: string;
  metric: Metric;
  domainId?: string;
  type?: ChartType;
  height?: number;
  showPeriodSelector?: boolean;
  defaultPeriod?: Period;
  fill?: boolean;
  color?: string;
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
];

export function AdminChart({
  title,
  metric,
  domainId,
  type = 'line',
  height = 250,
  showPeriodSelector = true,
  defaultPeriod = '7d',
  fill = true,
  color,
}: AdminChartProps) {
  const [period, setPeriod] = useState<Period>(defaultPeriod);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'stats', 'timeSeries', metric, period, domainId],
    queryFn: () => api.getAdminTimeSeries({ metric, period, domainId }),
    staleTime: 60000, // 1 minute
  });

  if (error) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-sm font-medium text-text-primary mb-4">{title}</h3>
        <div className="flex items-center justify-center h-[200px] text-text-muted text-sm">
          Failed to load chart data
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        {showPeriodSelector && (
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  period === opt.value
                    ? 'bg-accent text-text-inverse'
                    : 'bg-surface-hover text-text-muted hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {type === 'line' ? (
            <LineChart
              labels={data?.labels || []}
              datasets={
                data?.datasets?.map((ds) => ({
                  label: ds.label,
                  data: ds.data,
                  color: color || ds.color,
                  fill,
                })) || []
              }
              height={height}
              showLegend={false}
            />
          ) : (
            <BarChart
              labels={data?.labels || []}
              datasets={
                data?.datasets?.map((ds) => ({
                  label: ds.label,
                  data: ds.data,
                  color: color || ds.color,
                })) || []
              }
              height={height}
              showLegend={false}
            />
          )}
        </>
      )}
    </div>
  );
}

interface MultiMetricChartProps {
  title: string;
  metrics: { metric: Metric; label: string; color?: string }[];
  domainId?: string;
  type?: ChartType;
  height?: number;
  showPeriodSelector?: boolean;
  defaultPeriod?: Period;
}

export function MultiMetricChart({
  title,
  metrics,
  domainId,
  type = 'line',
  height = 250,
  showPeriodSelector = true,
  defaultPeriod = '7d',
}: MultiMetricChartProps) {
  const [period, setPeriod] = useState<Period>(defaultPeriod);

  const queries = metrics.map((m) =>
    useQuery({
      queryKey: ['admin', 'stats', 'timeSeries', m.metric, period, domainId],
      queryFn: () => api.getAdminTimeSeries({ metric: m.metric, period, domainId }),
      staleTime: 60000,
    })
  );

  const isLoading = queries.some((q) => q.isLoading);
  const error = queries.some((q) => q.error);

  // Merge datasets
  const labels = queries[0]?.data?.labels || [];
  const datasets = metrics.map((m, i) => ({
    label: m.label,
    data: queries[i]?.data?.datasets?.[0]?.data || [],
    color: m.color,
    fill: false,
  }));

  if (error) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-sm font-medium text-text-primary mb-4">{title}</h3>
        <div className="flex items-center justify-center h-[200px] text-text-muted text-sm">
          Failed to load chart data
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        {showPeriodSelector && (
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  period === opt.value
                    ? 'bg-accent text-text-inverse'
                    : 'bg-surface-hover text-text-muted hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {type === 'line' ? (
            <LineChart
              labels={labels}
              datasets={datasets}
              height={height}
              showLegend={true}
            />
          ) : (
            <BarChart
              labels={labels}
              datasets={datasets}
              height={height}
              showLegend={true}
            />
          )}
        </>
      )}
    </div>
  );
}

export default AdminChart;
