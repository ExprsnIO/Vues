'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/admin/ui';

interface Certificate {
  id: string;
  subject: string;
  type: 'root' | 'intermediate' | 'leaf' | 'client' | 'server';
  status: 'active' | 'revoked' | 'expired';
  notAfter: string;
}

interface ExpirationTimelineProps {
  certificates: Certificate[];
  onCertificateClick?: (cert: Certificate) => void;
  showMonths?: number;
}

export function ExpirationTimeline({
  certificates,
  onCertificateClick,
  showMonths = 12,
}: ExpirationTimelineProps) {
  const timeline = useMemo(() => {
    const now = new Date();
    const months: Array<{
      date: Date;
      label: string;
      certificates: Array<Certificate & { daysUntilExpiry: number }>;
    }> = [];

    // Generate months
    for (let i = 0; i < showMonths; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push({
        date,
        label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        certificates: [],
      });
    }

    // Assign certificates to months
    certificates
      .filter((cert) => cert.status === 'active')
      .forEach((cert) => {
        const expiryDate = new Date(cert.notAfter);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiry < 0) return; // Already expired

        const monthIndex = months.findIndex((m) => {
          const monthStart = m.date;
          const monthEnd = new Date(m.date.getFullYear(), m.date.getMonth() + 1, 0);
          return expiryDate >= monthStart && expiryDate <= monthEnd;
        });

        if (monthIndex >= 0) {
          months[monthIndex].certificates.push({ ...cert, daysUntilExpiry });
        }
      });

    return months;
  }, [certificates, showMonths]);

  const getUrgencyColor = (days: number) => {
    if (days < 7) return 'bg-red-500';
    if (days < 30) return 'bg-orange-500';
    if (days < 90) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getUrgencyBadge = (days: number) => {
    if (days < 7) return 'error' as const;
    if (days < 30) return 'warning' as const;
    if (days < 90) return 'info' as const;
    return 'success' as const;
  };

  const totalExpiring = timeline.reduce((sum, month) => sum + month.certificates.length, 0);
  const urgentCount = certificates.filter((c) => {
    if (c.status !== 'active') return false;
    const days = Math.ceil((new Date(c.notAfter).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days > 0 && days < 30;
  }).length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Certificate Expiration Timeline</h3>
          <p className="text-sm text-text-muted">
            {totalExpiring} certificate{totalExpiring !== 1 ? 's' : ''} expiring in the next {showMonths} months
          </p>
        </div>
        {urgentCount > 0 && (
          <Badge variant="warning">
            {urgentCount} expiring soon
          </Badge>
        )}
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

        <div className="space-y-6">
          {timeline.map((month, monthIndex) => (
            <div key={month.label} className="relative pl-10">
              {/* Month marker */}
              <div className={`absolute left-0 w-8 h-8 rounded-full flex items-center justify-center ${
                month.certificates.length > 0 ? 'bg-accent text-text-inverse' : 'bg-surface-hover text-text-muted'
              }`}>
                <span className="text-xs font-medium">
                  {month.date.toLocaleDateString('en-US', { month: 'short' }).slice(0, 3)}
                </span>
              </div>

              {/* Month content */}
              <div className="min-h-[40px]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-text-primary">{month.label}</span>
                  {month.certificates.length > 0 && (
                    <Badge variant="default" size="sm">
                      {month.certificates.length}
                    </Badge>
                  )}
                </div>

                {month.certificates.length > 0 && (
                  <div className="space-y-2">
                    {month.certificates
                      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
                      .map((cert) => (
                        <button
                          key={cert.id}
                          onClick={() => onCertificateClick?.(cert)}
                          className="w-full p-3 bg-surface hover:bg-surface-hover border border-border rounded-lg text-left transition-colors group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${getUrgencyColor(cert.daysUntilExpiry)}`} />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                                  {cert.subject}
                                </p>
                                <p className="text-xs text-text-muted">
                                  Expires {new Date(cert.notAfter).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <Badge variant={getUrgencyBadge(cert.daysUntilExpiry)} size="sm">
                              {cert.daysUntilExpiry} days
                            </Badge>
                          </div>
                        </button>
                      ))}
                  </div>
                )}

                {month.certificates.length === 0 && monthIndex < 3 && (
                  <p className="text-xs text-text-muted">No certificates expiring</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 pt-4 border-t border-border">
        <span className="text-xs text-text-muted">Urgency:</span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs text-text-muted">&lt; 7 days</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-xs text-text-muted">&lt; 30 days</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-xs text-text-muted">&lt; 90 days</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-text-muted">&gt; 90 days</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExpirationTimeline;
