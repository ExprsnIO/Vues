'use client';

type StatusIndicatorVariant = 'online' | 'offline' | 'warning' | 'error' | 'idle';
type StatusIndicatorSize = 'sm' | 'md' | 'lg';

interface StatusIndicatorProps {
  status: StatusIndicatorVariant;
  size?: StatusIndicatorSize;
  pulse?: boolean;
  label?: string;
  className?: string;
}

const statusColors: Record<StatusIndicatorVariant, string> = {
  online: 'bg-green-500',
  offline: 'bg-gray-400',
  warning: 'bg-yellow-500',
  error: 'bg-red-500',
  idle: 'bg-orange-500',
};

const pulseColors: Record<StatusIndicatorVariant, string> = {
  online: 'bg-green-400',
  offline: 'bg-gray-300',
  warning: 'bg-yellow-400',
  error: 'bg-red-400',
  idle: 'bg-orange-400',
};

const sizeStyles: Record<StatusIndicatorSize, string> = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
};

const labelSizeStyles: Record<StatusIndicatorSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export function StatusIndicator({
  status,
  size = 'md',
  pulse = false,
  label,
  className = '',
}: StatusIndicatorProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative flex">
        <span
          className={`rounded-full ${sizeStyles[size]} ${statusColors[status]}`}
        />
        {pulse && (status === 'online' || status === 'error') && (
          <span
            className={`absolute inset-0 rounded-full ${pulseColors[status]} animate-ping opacity-75`}
          />
        )}
      </span>
      {label && (
        <span className={`text-text-secondary ${labelSizeStyles[size]}`}>
          {label}
        </span>
      )}
    </span>
  );
}

// Health status indicator with multiple health states
interface HealthIndicatorProps {
  health: 'healthy' | 'degraded' | 'down' | 'unknown';
  size?: StatusIndicatorSize;
  showLabel?: boolean;
  className?: string;
}

export function HealthIndicator({
  health,
  size = 'md',
  showLabel = true,
  className = '',
}: HealthIndicatorProps) {
  const healthConfig: Record<
    string,
    { status: StatusIndicatorVariant; label: string }
  > = {
    healthy: { status: 'online', label: 'Healthy' },
    degraded: { status: 'warning', label: 'Degraded' },
    down: { status: 'error', label: 'Down' },
    unknown: { status: 'offline', label: 'Unknown' },
  };

  const config = healthConfig[health] || healthConfig.unknown;

  return (
    <StatusIndicator
      status={config.status}
      size={size}
      pulse={health === 'healthy' || health === 'down'}
      label={showLabel ? config.label : undefined}
      className={className}
    />
  );
}

// Connection status for services
interface ConnectionStatusProps {
  connected: boolean;
  connecting?: boolean;
  size?: StatusIndicatorSize;
  showLabel?: boolean;
  className?: string;
}

export function ConnectionStatus({
  connected,
  connecting = false,
  size = 'md',
  showLabel = true,
  className = '',
}: ConnectionStatusProps) {
  const status: StatusIndicatorVariant = connecting
    ? 'idle'
    : connected
    ? 'online'
    : 'offline';
  const label = connecting
    ? 'Connecting...'
    : connected
    ? 'Connected'
    : 'Disconnected';

  return (
    <StatusIndicator
      status={status}
      size={size}
      pulse={connecting || connected}
      label={showLabel ? label : undefined}
      className={className}
    />
  );
}
