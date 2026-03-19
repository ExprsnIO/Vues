'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';

interface IdentityBadgeProps {
  did: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const sizeConfig = {
  sm: { icon: 'w-3.5 h-3.5', text: 'text-xs', gap: 'gap-1' },
  md: { icon: 'w-4 h-4', text: 'text-sm', gap: 'gap-1.5' },
  lg: { icon: 'w-5 h-5', text: 'text-base', gap: 'gap-2' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 1L3 5v6c0 5.25 3.75 10.15 9 11.35C17.25 21.15 21 16.25 21 11V5l-9-4zm-1 13l-3-3 1.41-1.41L11 11.17l4.59-4.58L17 8l-6 6z" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  );
}

function ChainLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
    </svg>
  );
}

function StatusDot({ status }: { status: string }) {
  const isActive = status === 'active' || status === 'valid';
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        isActive ? 'bg-green-500' : 'bg-amber-500'
      }`}
      aria-label={`Certificate status: ${status}`}
    />
  );
}

interface CertPanelProps {
  did: string;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

function CertificatePanel({ did, onClose, anchorRef }: CertPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['certificate-info', did],
    queryFn: () => api.getCertificateInfo(did),
    staleTime: 5 * 60 * 1000,
  });

  // Close on outside click
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose, anchorRef]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const cert = data?.certificate;
  const didMethod = data?.didMethod ?? (did.startsWith('did:exprsn:') ? 'exprsn' : 'plc');

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Identity certificate details"
      className="absolute z-50 mt-2 w-80 rounded-xl border border-border bg-surface shadow-xl p-4 text-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {didMethod === 'exprsn' ? (
            <ShieldIcon className="w-4 h-4 text-accent" />
          ) : (
            <GlobeIcon className="w-4 h-4 text-blue-400" />
          )}
          <span className="font-semibold text-text-primary">
            {didMethod === 'exprsn' ? 'Exprsn Identity' : 'AT Protocol Identity'}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close certificate panel"
          className="text-text-muted hover:text-text-primary transition-colors p-0.5 rounded"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      {/* DID */}
      <div className="mb-3 p-2 bg-background rounded-lg font-mono text-xs text-text-muted break-all select-all">
        {did}
      </div>

      {isLoading && (
        <div className="space-y-2 animate-pulse">
          <div className="h-3 bg-surface-elevated rounded w-3/4" />
          <div className="h-3 bg-surface-elevated rounded w-1/2" />
          <div className="h-3 bg-surface-elevated rounded w-2/3" />
        </div>
      )}

      {error && (
        <p className="text-amber-500 text-xs">
          Certificate details unavailable.
        </p>
      )}

      {data && !isLoading && (
        <>
          {cert ? (
            <div className="space-y-2.5">
              {/* Status row */}
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Status</span>
                <span className="flex items-center gap-1.5">
                  <StatusDot status={cert.status} />
                  <span className="capitalize text-text-primary font-medium">{cert.status}</span>
                </span>
              </div>

              {/* Type */}
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Type</span>
                <span className="text-text-primary font-medium capitalize">{cert.type}</span>
              </div>

              {/* Fingerprint */}
              <div className="space-y-0.5">
                <span className="text-text-muted block">Fingerprint</span>
                <span className="font-mono text-xs text-text-primary break-all select-all">
                  {cert.fingerprint}
                </span>
              </div>

              {/* Issuer */}
              <div className="space-y-0.5">
                <span className="text-text-muted block">Issuer</span>
                <span className="text-text-primary text-xs break-all">{cert.issuer}</span>
              </div>

              {/* Validity dates */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border">
                <div>
                  <span className="text-text-muted text-xs block mb-0.5">Valid from</span>
                  <span className="text-text-primary text-xs">{formatDate(cert.notBefore)}</span>
                </div>
                <div>
                  <span className="text-text-muted text-xs block mb-0.5">Expires</span>
                  <span
                    className={`text-xs font-medium ${
                      cert.expiringSoon ? 'text-amber-500' : 'text-text-primary'
                    }`}
                  >
                    {formatDate(cert.notAfter)}
                  </span>
                </div>
              </div>

              {/* Expiry warning */}
              {cert.expiringSoon && (
                <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-500/10 text-amber-500 text-xs">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                  </svg>
                  Expires in {cert.daysUntilExpiry} day{cert.daysUntilExpiry !== 1 ? 's' : ''}
                </div>
              )}

              {/* Chain visualization */}
              <div className="pt-2 border-t border-border">
                <span className="text-text-muted text-xs block mb-1.5">Certificate chain</span>
                <div className="flex flex-col gap-1">
                  <ChainNode label="Root CA" isRoot />
                  <ChainConnector />
                  <ChainNode label={cert.issuer} />
                  <ChainConnector />
                  <ChainNode label={`This certificate (${cert.type})`} isLeaf />
                </div>
              </div>

              {/* Learn more link */}
              <div className="pt-2 border-t border-border">
                <Link
                  href="/about/verification"
                  onClick={onClose}
                  className="text-xs text-accent hover:underline"
                >
                  Learn about verified identity &rarr;
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-text-muted text-xs">
                {data.hasCertificate
                  ? 'Certificate details could not be loaded.'
                  : 'No certificate issued for this identity.'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChainNode({
  label,
  isRoot,
  isLeaf,
}: {
  label: string;
  isRoot?: boolean;
  isLeaf?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ${
        isLeaf
          ? 'bg-accent/10 text-accent border border-accent/20'
          : isRoot
          ? 'bg-surface-elevated text-text-muted'
          : 'bg-surface-elevated text-text-muted'
      }`}
    >
      <ChainLinkIcon className="w-3 h-3 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function ChainConnector() {
  return (
    <div className="flex items-center justify-start pl-3.5">
      <div className="w-px h-3 bg-border" />
    </div>
  );
}

export function IdentityBadge({ did, size = 'md', showLabel = false }: IdentityBadgeProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const isExprsnDid = did.startsWith('did:exprsn:');
  const cfg = sizeConfig[size];

  if (isExprsnDid) {
    return (
      <span className="relative inline-flex items-center">
        <button
          ref={anchorRef}
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-pressed={panelOpen}
          aria-label="View Exprsn identity certificate"
          className={`inline-flex items-center ${cfg.gap} text-accent hover:text-accent/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded`}
        >
          <ShieldIcon className={cfg.icon} />
          {showLabel && (
            <span className={`${cfg.text} font-medium`}>Verified</span>
          )}
        </button>

        {panelOpen && (
          <div className="absolute top-full left-0">
            <CertificatePanel
              did={did}
              onClose={() => setPanelOpen(false)}
              anchorRef={anchorRef}
            />
          </div>
        )}
      </span>
    );
  }

  // did:plc or any other AT Protocol DID
  return (
    <span
      className={`inline-flex items-center ${cfg.gap} text-blue-400`}
      title={`AT Protocol identity: ${did}`}
    >
      <GlobeIcon className={cfg.icon} />
      {showLabel && (
        <span className={`${cfg.text} font-medium`}>AT Protocol</span>
      )}
    </span>
  );
}
