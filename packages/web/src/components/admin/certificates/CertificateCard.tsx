'use client';

import { Badge, StatusIndicator } from '@/components/admin/ui';

interface CertificateCardProps {
  certificate: {
    id: string;
    subject: string;
    type: 'root' | 'intermediate' | 'leaf' | 'client' | 'server';
    status: 'active' | 'revoked' | 'expired' | 'pending';
    serialNumber: string;
    notBefore: string;
    notAfter: string;
    issuer?: string;
    keyUsage?: string[];
    algorithm?: string;
  };
  onClick?: () => void;
  selected?: boolean;
  compact?: boolean;
}

export function CertificateCard({ certificate, onClick, selected, compact }: CertificateCardProps) {
  const daysUntilExpiry = Math.ceil(
    (new Date(certificate.notAfter).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const statusColors = {
    active: 'success' as const,
    revoked: 'error' as const,
    expired: 'warning' as const,
    pending: 'info' as const,
  };

  const typeLabels = {
    root: 'Root CA',
    intermediate: 'Intermediate CA',
    leaf: 'End Entity',
    client: 'Client',
    server: 'Server',
  };

  const typeColors = {
    root: 'bg-purple-500/10 text-purple-500',
    intermediate: 'bg-blue-500/10 text-blue-500',
    leaf: 'bg-green-500/10 text-green-500',
    client: 'bg-yellow-500/10 text-yellow-500',
    server: 'bg-cyan-500/10 text-cyan-500',
  };

  if (compact) {
    return (
      <div
        onClick={onClick}
        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
          selected
            ? 'bg-accent/10 border border-accent'
            : 'bg-surface hover:bg-surface-hover border border-border'
        }`}
      >
        <div className={`p-2 rounded-lg ${typeColors[certificate.type]}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{certificate.subject}</p>
          <p className="text-xs text-text-muted">{typeLabels[certificate.type]}</p>
        </div>
        <Badge variant={statusColors[certificate.status]} size="sm">
          {certificate.status}
        </Badge>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl cursor-pointer transition-all ${
        selected
          ? 'bg-accent/10 border-2 border-accent shadow-lg'
          : 'bg-surface hover:bg-surface-hover border border-border hover:border-accent/50'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${typeColors[certificate.type]}`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <StatusIndicator
          status={certificate.status === 'active' ? 'online' : certificate.status === 'revoked' ? 'error' : 'warning'}
          label={certificate.status}
        />
      </div>

      <h3 className="text-sm font-semibold text-text-primary mb-1 truncate" title={certificate.subject}>
        {certificate.subject}
      </h3>

      <div className="flex items-center gap-2 mb-3">
        <Badge variant="default" size="sm">{typeLabels[certificate.type]}</Badge>
        {certificate.algorithm && (
          <span className="text-xs text-text-muted">{certificate.algorithm}</span>
        )}
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-text-muted">Serial Number</span>
          <span className="text-text-primary font-mono">{certificate.serialNumber.slice(0, 16)}...</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Valid From</span>
          <span className="text-text-primary">{new Date(certificate.notBefore).toLocaleDateString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Valid Until</span>
          <span className={`font-medium ${daysUntilExpiry < 30 ? 'text-warning' : 'text-text-primary'}`}>
            {new Date(certificate.notAfter).toLocaleDateString()}
          </span>
        </div>
      </div>

      {certificate.status === 'active' && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted">Expires in</span>
            <span className={`font-medium ${
              daysUntilExpiry < 30 ? 'text-warning' : daysUntilExpiry < 90 ? 'text-yellow-500' : 'text-green-500'
            }`}>
              {daysUntilExpiry > 0 ? `${daysUntilExpiry} days` : 'Expired'}
            </span>
          </div>
          <div className="mt-2 h-1.5 bg-surface-hover rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                daysUntilExpiry < 30 ? 'bg-warning' : daysUntilExpiry < 90 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, (daysUntilExpiry / 365) * 100))}%` }}
            />
          </div>
        </div>
      )}

      {certificate.keyUsage && certificate.keyUsage.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {certificate.keyUsage.slice(0, 3).map((usage) => (
            <span key={usage} className="px-2 py-0.5 text-xs bg-surface-hover text-text-muted rounded">
              {usage}
            </span>
          ))}
          {certificate.keyUsage.length > 3 && (
            <span className="px-2 py-0.5 text-xs bg-surface-hover text-text-muted rounded">
              +{certificate.keyUsage.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default CertificateCard;
