'use client';

import { ReactNode } from 'react';

type TrendDirection = 'up' | 'down' | 'neutral';
type StatCardVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: {
    value: number;
    direction: TrendDirection;
    label?: string;
  };
  subtitle?: string;
  variant?: StatCardVariant;
  loading?: boolean;
  className?: string;
  onClick?: () => void;
}

const trendColors: Record<TrendDirection, string> = {
  up: 'text-green-500',
  down: 'text-red-500',
  neutral: 'text-text-muted',
};

const variantIconBg: Record<StatCardVariant, string> = {
  default: 'bg-surface-hover',
  success: 'bg-green-500/10',
  warning: 'bg-yellow-500/10',
  error: 'bg-red-500/10',
  info: 'bg-blue-500/10',
};

const variantIconColor: Record<StatCardVariant, string> = {
  default: 'text-text-muted',
  success: 'text-green-500',
  warning: 'text-yellow-500',
  error: 'text-red-500',
  info: 'text-blue-500',
};

export function StatCard({
  title,
  value,
  icon,
  trend,
  subtitle,
  variant = 'default',
  loading = false,
  className = '',
  onClick,
}: StatCardProps) {
  const Component = onClick ? 'button' : 'div';

  if (loading) {
    return (
      <div
        className={`p-4 bg-surface border border-border rounded-xl ${className}`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="h-3 w-24 bg-surface-hover rounded animate-pulse" />
          <div className="h-5 w-5 bg-surface-hover rounded animate-pulse" />
        </div>
        <div className="h-8 w-16 bg-surface-hover rounded animate-pulse mb-1" />
        <div className="h-3 w-20 bg-surface-hover rounded animate-pulse" />
      </div>
    );
  }

  return (
    <Component
      className={`
        p-4 bg-surface border border-border rounded-xl text-left w-full
        ${onClick ? 'hover:border-border-hover cursor-pointer transition-colors' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-text-muted">{title}</span>
        {icon && (
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${variantIconBg[variant]} ${variantIconColor[variant]}`}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-text-primary">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {trend && (
          <span
            className={`text-sm font-medium flex items-center gap-0.5 ${trendColors[trend.direction]}`}
          >
            {trend.direction === 'up' && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            )}
            {trend.direction === 'down' && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
            {trend.value > 0 ? '+' : ''}
            {trend.value}%
            {trend.label && (
              <span className="text-text-muted font-normal ml-1">{trend.label}</span>
            )}
          </span>
        )}
      </div>

      {subtitle && (
        <span className="text-xs text-text-muted mt-1 block">{subtitle}</span>
      )}
    </Component>
  );
}

// Mini stat for compact displays
interface MiniStatProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  className?: string;
}

export function MiniStat({ label, value, icon, className = '' }: MiniStatProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {icon && (
        <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center text-text-muted">
          {icon}
        </div>
      )}
      <div>
        <span className="text-lg font-semibold text-text-primary block">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        <span className="text-xs text-text-muted">{label}</span>
      </div>
    </div>
  );
}

// Stats grid layout
interface StatsGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

export function StatsGrid({
  children,
  columns = 4,
  className = '',
}: StatsGridProps) {
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }[columns];

  return (
    <div className={`grid ${gridCols} gap-4 ${className}`}>{children}</div>
  );
}
