// @ts-nocheck
'use client';

import { useState } from 'react';
import { Badge, StatusIndicator } from '@/components/admin/ui';

interface Certificate {
  id: string;
  subject: string;
  type: 'root' | 'intermediate' | 'leaf';
  status: 'active' | 'revoked' | 'expired';
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  issuer?: string;
  children?: Certificate[];
}

interface CAHierarchyTreeProps {
  certificates: Certificate[];
  onSelect?: (cert: Certificate) => void;
  selectedId?: string;
}

export function CAHierarchyTree({ certificates, onSelect, selectedId }: CAHierarchyTreeProps) {
  return (
    <div className="space-y-2">
      {certificates.map((cert) => (
        <TreeNode
          key={cert.id}
          certificate={cert}
          level={0}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      ))}
    </div>
  );
}

interface TreeNodeProps {
  certificate: Certificate;
  level: number;
  onSelect?: (cert: Certificate) => void;
  selectedId?: string;
}

function TreeNode({ certificate, level, onSelect, selectedId }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = certificate.children && certificate.children.length > 0;
  const isSelected = selectedId === certificate.id;

  const statusColors = {
    active: 'success' as const,
    revoked: 'error' as const,
    expired: 'warning' as const,
  };

  const typeIcons = {
    root: (
      <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    intermediate: (
      <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    leaf: (
      <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  };

  const daysUntilExpiry = Math.ceil(
    (new Date(certificate.notAfter).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div>
      <div
        className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? 'bg-accent/10 border border-accent'
            : 'bg-surface hover:bg-surface-hover border border-transparent'
        }`}
        style={{ marginLeft: level * 24 }}
        onClick={() => onSelect?.(certificate)}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 hover:bg-surface-hover rounded"
          >
            <svg
              className={`w-4 h-4 text-text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        {!hasChildren && <div className="w-5" />}

        {typeIcons[certificate.type]}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary truncate">
              {certificate.subject}
            </span>
            <Badge variant={statusColors[certificate.status]} size="sm">
              {certificate.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span>SN: {certificate.serialNumber.slice(0, 16)}...</span>
            {certificate.status === 'active' && (
              <span className={daysUntilExpiry < 30 ? 'text-warning' : ''}>
                {daysUntilExpiry > 0 ? `${daysUntilExpiry} days left` : 'Expired'}
              </span>
            )}
          </div>
        </div>

        <StatusIndicator
          status={certificate.status === 'active' ? 'online' : certificate.status === 'revoked' ? 'error' : 'warning'}
          showLabel={false}
        />
      </div>

      {hasChildren && expanded && (
        <div className="mt-1 relative">
          <div
            className="absolute left-6 top-0 bottom-4 w-px bg-border"
            style={{ marginLeft: level * 24 }}
          />
          {certificate.children!.map((child) => (
            <TreeNode
              key={child.id}
              certificate={child}
              level={level + 1}
              onSelect={onSelect}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default CAHierarchyTree;
