// @ts-nocheck
'use client';

import { Badge } from '@/components/admin/ui';

interface ServiceCardProps {
  service: {
    id: string;
    name: string;
    type: 'pds' | 'relay' | 'appview' | 'labeler' | 'ozone';
    status: 'running' | 'stopped' | 'error' | 'degraded';
    version?: string;
    endpoint?: string;
    healthCheck?: {
      lastCheck: string;
      responseTime: number;
      uptime?: number;
    };
    stats?: {
      requestsPerMinute?: number;
      activeConnections?: number;
      errorRate?: number;
    };
  };
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onRestart?: () => void;
}

const SERVICE_ICONS = {
  pds: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  relay: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  appview: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  labeler: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  ),
  ozone: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
};

const SERVICE_COLORS = {
  pds: 'blue',
  relay: 'purple',
  appview: 'green',
  labeler: 'yellow',
  ozone: 'pink',
};

export function ServiceCard({ service, onClick, onToggle, onRestart }: ServiceCardProps) {
  const color = SERVICE_COLORS[service.type];

  return (
    <div
      onClick={onClick}
      className={`p-5 bg-surface border border-border rounded-xl transition-all ${
        onClick ? 'cursor-pointer hover:border-accent/50 hover:shadow-md' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 bg-${color}-500/10 rounded-lg`}>
            <div className={`text-${color}-500`}>
              {SERVICE_ICONS[service.type]}
            </div>
          </div>
          <div>
            <h4 className="font-medium text-text-primary">{service.name}</h4>
            <p className="text-xs text-text-muted">{service.type.toUpperCase()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            service.status === 'running' ? 'bg-green-500' :
            service.status === 'stopped' ? 'bg-gray-500' :
            service.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
          }`} />
          <Badge variant={
            service.status === 'running' ? 'success' :
            service.status === 'stopped' ? 'default' :
            service.status === 'degraded' ? 'warning' : 'danger'
          }>
            {service.status}
          </Badge>
        </div>
      </div>

      {service.endpoint && (
        <div className="mb-3 px-3 py-2 bg-surface-hover rounded-lg">
          <p className="text-xs text-text-muted font-mono truncate">{service.endpoint}</p>
        </div>
      )}

      {service.healthCheck && (
        <div className="flex items-center gap-4 text-xs text-text-muted mb-3">
          <div className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{service.healthCheck.responseTime}ms</span>
          </div>
          {service.healthCheck.uptime !== undefined && (
            <div className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>{service.healthCheck.uptime.toFixed(2)}% uptime</span>
            </div>
          )}
        </div>
      )}

      {service.stats && (
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
          {service.stats.requestsPerMinute !== undefined && (
            <div className="text-center">
              <p className="text-lg font-semibold text-text-primary">{service.stats.requestsPerMinute}</p>
              <p className="text-xs text-text-muted">req/min</p>
            </div>
          )}
          {service.stats.activeConnections !== undefined && (
            <div className="text-center">
              <p className="text-lg font-semibold text-text-primary">{service.stats.activeConnections}</p>
              <p className="text-xs text-text-muted">connections</p>
            </div>
          )}
          {service.stats.errorRate !== undefined && (
            <div className="text-center">
              <p className={`text-lg font-semibold ${service.stats.errorRate > 5 ? 'text-red-500' : 'text-text-primary'}`}>
                {service.stats.errorRate.toFixed(1)}%
              </p>
              <p className="text-xs text-text-muted">errors</p>
            </div>
          )}
        </div>
      )}

      {(onToggle || onRestart) && (
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
          {onToggle && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle(service.status !== 'running');
              }}
              className={`flex-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                service.status === 'running'
                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                  : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
              }`}
            >
              {service.status === 'running' ? 'Stop' : 'Start'}
            </button>
          )}
          {onRestart && service.status === 'running' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRestart();
              }}
              className="flex-1 px-3 py-1.5 text-sm bg-surface-hover hover:bg-surface text-text-primary rounded-lg transition-colors"
            >
              Restart
            </button>
          )}
        </div>
      )}

      {service.version && (
        <div className="mt-3 text-xs text-text-muted text-right">
          v{service.version}
        </div>
      )}
    </div>
  );
}

export default ServiceCard;
