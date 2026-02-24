'use client';

import { Bar } from 'react-chartjs-2';
import { ChartData, ChartOptions } from 'chart.js';
import '@/lib/chartjs';
import { chartColors } from '@/lib/chartjs';

interface BarChartProps {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    color?: string;
  }[];
  title?: string;
  height?: number;
  showLegend?: boolean;
  horizontal?: boolean;
  stacked?: boolean;
}

export function BarChart({
  labels,
  datasets,
  title,
  height = 300,
  showLegend = true,
  horizontal = false,
  stacked = false,
}: BarChartProps) {
  const data: ChartData<'bar'> = {
    labels,
    datasets: datasets.map((ds, i) => {
      const color = ds.color || chartColors.palette[i % chartColors.palette.length];
      return {
        label: ds.label,
        data: ds.data,
        backgroundColor: `${color}cc`,
        hoverBackgroundColor: color,
        borderColor: color,
        borderWidth: 1,
        borderRadius: 4,
      };
    }),
  };

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    plugins: {
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
        display: showLegend && datasets.length > 1,
        position: 'bottom' as const,
        labels: {
          color: '#9ca3af',
        },
      },
      tooltip: {
        backgroundColor: '#1f2937',
        titleColor: '#f9fafb',
        bodyColor: '#d1d5db',
        borderColor: '#374151',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
      },
    },
    scales: {
      x: {
        stacked,
        grid: {
          color: '#374151',
        },
        ticks: {
          color: '#9ca3af',
        },
      },
      y: {
        stacked,
        beginAtZero: true,
        grid: {
          color: '#374151',
        },
        ticks: {
          color: '#9ca3af',
        },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Bar data={data} options={options} />
    </div>
  );
}

export default BarChart;
