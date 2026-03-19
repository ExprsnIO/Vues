'use client';

import { useAdminDomain } from '@/lib/admin-domain-context';

// ---- Icon components ----

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

function ChevronRightSmIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 20 20"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7l3 3-3 3" />
    </svg>
  );
}

// ---- Props ----

interface InheritanceToggleProps {
  className?: string;
}

// ---- Chain visualisation ----

interface ChainNode {
  label: string;
  isCurrentDomain: boolean;
}

function InheritanceChain({ nodes, enabled }: { nodes: ChainNode[]; enabled: boolean }) {
  if (nodes.length === 0) return null;

  return (
    <div
      className={[
        'flex flex-wrap items-center gap-1 transition-opacity duration-200',
        enabled ? 'opacity-100' : 'opacity-40',
      ].join(' ')}
      aria-label="Permission inheritance chain"
    >
      {nodes.map((node, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && (
            <ChevronRightSmIcon className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" />
          )}
          <span
            className={[
              'px-2 py-0.5 rounded text-xs font-medium',
              node.isCurrentDomain
                ? 'bg-accent/20 text-accent ring-1 ring-accent/40'
                : 'bg-surface-hover text-text-muted',
            ].join(' ')}
          >
            {node.label}
          </span>
        </span>
      ))}
    </div>
  );
}

// ---- Toggle switch ----

function ToggleSwitch({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  id: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      id={id}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
        'transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        checked ? 'bg-accent' : 'bg-zinc-600',
      ].join(' ')}
    >
      <span className="sr-only">{checked ? 'Disable' : 'Enable'} permission inheritance</span>
      <span
        className={[
          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0',
          'transition duration-200 ease-in-out',
          checked ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}

// ---- Main exported component ----

export function InheritanceToggle({ className = '' }: InheritanceToggleProps) {
  const {
    inheritPermissions,
    setInheritPermissions,
    selectedDomain,
    domains,
    isGlobal,
  } = useAdminDomain();

  // Build ancestry chain for the selected domain
  const chainNodes = buildChain(selectedDomain?.id ?? null, domains);

  const toggleId = 'inheritance-toggle-switch';

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <ShieldCheckIcon
            className={[
              'mt-0.5 w-5 h-5 flex-shrink-0 transition-colors',
              inheritPermissions ? 'text-accent' : 'text-text-muted',
            ].join(' ')}
          />
          <div className="min-w-0">
            <label
              htmlFor={toggleId}
              className="block text-sm font-medium text-text-primary cursor-pointer"
            >
              Inherit Permissions
            </label>
            <p className="mt-0.5 text-xs text-text-muted leading-relaxed">
              {inheritPermissions
                ? 'This domain inherits all permissions from its parent domains. Changes to parent roles automatically apply here.'
                : 'This domain uses its own isolated permission set. No permissions are inherited from parent domains.'}
            </p>
          </div>
        </div>

        <ToggleSwitch
          id={toggleId}
          checked={inheritPermissions}
          onChange={setInheritPermissions}
        />
      </div>

      {/* Inheritance chain visualisation */}
      {!isGlobal && chainNodes.length > 0 && (
        <div className="pl-7">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ArrowDownIcon
              className={[
                'w-3.5 h-3.5 flex-shrink-0 transition-colors',
                inheritPermissions ? 'text-accent' : 'text-text-muted',
              ].join(' ')}
            />
            <span className="text-xs text-text-muted">Permission flow</span>
          </div>

          <InheritanceChain nodes={chainNodes} enabled={inheritPermissions} />

          {inheritPermissions && chainNodes.length === 1 && (
            <p className="mt-1.5 text-xs text-text-muted italic">
              This is a root domain. No parent permissions to inherit.
            </p>
          )}
        </div>
      )}

      {/* Global scope notice */}
      {isGlobal && (
        <div className="pl-7">
          <p className="text-xs text-text-muted italic">
            Select a domain to configure its inheritance settings.
          </p>
        </div>
      )}
    </div>
  );
}

// ---- Utility: build ancestor chain nodes for the chain display ----

interface DomainLike {
  id: string;
  name: string;
  parentDomainId?: string | null;
}

function buildChain(
  domainId: string | null,
  domains: DomainLike[]
): ChainNode[] {
  if (!domainId) return [];

  const map = new Map<string, DomainLike>();
  for (const d of domains) {
    map.set(d.id, d);
  }

  const chain: ChainNode[] = [];
  const visited = new Set<string>();

  // Walk ancestors from root first
  const ancestors: string[] = [];
  let current: string | null = map.get(domainId)?.parentDomainId ?? null;
  while (current && !visited.has(current)) {
    visited.add(current);
    ancestors.unshift(current);
    current = map.get(current)?.parentDomainId ?? null;
  }

  for (const id of ancestors) {
    const d = map.get(id);
    if (d) {
      chain.push({ label: d.name, isCurrentDomain: false });
    }
  }

  // Add current domain as the final node
  const currentDomain = map.get(domainId);
  if (currentDomain) {
    chain.push({ label: currentDomain.name, isCurrentDomain: true });
  }

  return chain;
}
