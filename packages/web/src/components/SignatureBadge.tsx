'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface SignatureBadgeProps {
  videoUri: string;
  signed: boolean;
  verified: boolean;
  size?: 'sm' | 'md';
}

const sizeConfig = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
};

function CheckShieldIcon({ className }: { className?: string }) {
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

function StatusDot({ status }: { status: string }) {
  const isActive = status === 'valid' || status === 'active';
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        isActive ? 'bg-green-500' : 'bg-amber-500'
      }`}
      aria-label={`Signature status: ${status}`}
    />
  );
}

interface SignaturePanelProps {
  videoUri: string;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

function SignaturePanel({ videoUri, onClose, anchorRef }: SignaturePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['signature-info', videoUri],
    queryFn: () => api.getSignatureInfo(videoUri),
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

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Content signature details"
      className="absolute z-50 mt-2 w-72 rounded-xl border border-border bg-surface shadow-xl p-4 text-sm"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckShieldIcon className="w-4 h-4 text-green-500" />
          <span className="font-semibold text-text-primary">Signed Content</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close signature panel"
          className="text-text-muted hover:text-text-primary transition-colors p-0.5 rounded"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      {isLoading && (
        <div className="space-y-2 animate-pulse">
          <div className="h-3 bg-surface-elevated rounded w-3/4" />
          <div className="h-3 bg-surface-elevated rounded w-1/2" />
          <div className="h-3 bg-surface-elevated rounded w-2/3" />
        </div>
      )}

      {error && (
        <p className="text-amber-500 text-xs">Signature details unavailable.</p>
      )}

      {data && !isLoading && (
        <div className="space-y-2.5">
          {/* Verification status */}
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Status</span>
            <span className="flex items-center gap-1.5">
              <StatusDot status={data.status || (data.verified ? 'valid' : 'unknown')} />
              <span className="text-text-primary font-medium">
                {data.verified ? 'Verified' : 'Unverified'}
              </span>
            </span>
          </div>

          {/* Signing timestamp */}
          {data.timestamp && (
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Signed at</span>
              <span className="text-text-primary text-xs">
                {new Date(data.timestamp).toLocaleString()}
              </span>
            </div>
          )}

          {/* Signer */}
          {(data.signerHandle || data.signerDid) && (
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Signer</span>
              <span className="text-text-primary text-xs font-medium">
                {data.signerHandle ? `@${data.signerHandle}` : data.signerDid}
              </span>
            </div>
          )}

          {/* Certificate fingerprint */}
          {data.certificateFingerprint && (
            <div className="space-y-0.5">
              <span className="text-text-muted block">Certificate</span>
              <span className="font-mono text-xs text-text-primary break-all select-all">
                {data.certificateFingerprint}
              </span>
            </div>
          )}

          {/* Issuer */}
          {data.issuer && (
            <div className="space-y-0.5">
              <span className="text-text-muted block">Issuer</span>
              <span className="text-text-primary text-xs break-all">{data.issuer}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SignatureBadge({ videoUri, signed, verified, size = 'sm' }: SignatureBadgeProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  if (!signed || !verified) return null;

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        aria-pressed={panelOpen}
        aria-label="View content signature details"
        className="inline-flex items-center text-green-500 hover:text-green-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 rounded"
        title="Signed & verified content"
      >
        <CheckShieldIcon className={sizeConfig[size]} />
      </button>

      {panelOpen && (
        <div className="absolute top-full left-0">
          <SignaturePanel
            videoUri={videoUri}
            onClose={() => setPanelOpen(false)}
            anchorRef={anchorRef}
          />
        </div>
      )}
    </span>
  );
}
