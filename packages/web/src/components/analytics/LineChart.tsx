'use client';

import { Line } from 'react-chartjs-2';
import { ChartData, ChartOptions } from 'chart.js';
import '@/lib/chartjs';
import { chartColors, darkThemeOptions } from '@/lib/chartjs';

interface LineChartProps {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    color?: string;
    fill?: boolean;
  }[];
  title?: string;
  height?: number;
  showLegend?: boolean;
  yAxisLabel?: string;
  gradient?: boolean;
}

export function LineChart({
  labels,
  datasets,
  title,
  height = 300,
  showLegend = true,
  yAxisLabel,
  gradient = true,
}: LineChartProps) {
  const data: ChartData<'line'> = {
    labels,
    datasets: datasets.map((ds, i) => {
      const color = ds.color || chartColors.palette[i % chartColors.palette.length];
      return {
        label: ds.label,
        data: ds.data,
        borderColor: color,
        backgroundColor: ds.fill
          ? gradient
            ? `${color}20`
            : `${color}40`
          : 'transparent',
        fill: ds.fill ?? false,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: color,
        pointBorderColor: '#1f2937',
        pointBorderWidth: 2,
      };
    }),
  };

  const options: ChartOptions<'line'> = {
    ...(darkThemeOptions as ChartOptions<'line'>),
    plugins: {
      ...darkThemeOptions.plugins,
      title: title
        ? {
            display: true,
            text: title,
            color: '#f9fafb',
            font: {
              size: 16,
              weight: 'bold' as const,
            },
            padding: { bottom: 16 },
          }
        : undefined,
      legend: {
        ...darkThemeOptions.plugins?.legend,
        display: showLegend,
        position: 'bottom' as const,
      },
    },
    scales: {
      ...darkThemeOptions.scales,
      y: {
        ...darkThemeOptions.scales?.y,
        title: yAxisLabel
          ? {
              display: true,
              text: yAxisLabel,
              color: '#9ca3af',
            }
          : undefined,
        beginAtZero: true,
      },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
}

export default LineChart;
