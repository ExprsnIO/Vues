'use client';

import { Doughnut } from 'react-chartjs-2';
import { ChartData, ChartOptions } from 'chart.js';
import '@/lib/chartjs';
import { chartColors } from '@/lib/chartjs';

interface DoughnutChartProps {
  labels: string[];
  data: number[];
  title?: string;
  height?: number;
  showLegend?: boolean;
  colors?: string[];
  centerLabel?: {
    text: string;
    subtext?: string;
  };
}

export function DoughnutChart({
  labels,
  data,
  title,
  height = 250,
  showLegend = true,
  colors = chartColors.palette,
  centerLabel,
}: DoughnutChartProps) {
  const chartData: ChartData<'doughnut'> = {
    labels,
    datasets: [
      {
        data,
        backgroundColor: colors.map((c) => `${c}cc`),
        hoverBackgroundColor: colors,
        borderColor: '#1f2937',
        borderWidth: 2,
      },
    ],
  };

  const options: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
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
        display: showLegend,
        position: 'bottom' as const,
        labels: {
          color: '#9ca3af',
          padding: 16,
          usePointStyle: true,
          pointStyle: 'circle',
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
        callbacks: {
          label: (context) => {
            const total = context.dataset.data.reduce(
              (sum: number, val: number) => sum + val,
              0
            );
            const percentage = ((context.parsed / total) * 100).toFixed(1);
            return `${context.label}: ${context.formattedValue} (${percentage}%)`;
          },
        },
      },
    },
  };

  return (
    <div style={{ height }} className="relative">
      <Doughnut data={chartData} options={options} />
      {centerLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-text-primary">
            {centerLabel.text}
          </span>
          {centerLabel.subtext && (
            <span className="text-sm text-text-muted">{centerLabel.subtext}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default DoughnutChart;
