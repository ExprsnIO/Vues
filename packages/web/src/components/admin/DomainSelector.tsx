'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAdminDomain, Domain } from '@/lib/admin-domain-context';

export function DomainSelector() {
  const { selectedDomainId, selectedDomain, setSelectedDomain, isGlobal, domains, isLoadingDomains } = useAdminDomain();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter domains by search
  const filteredDomains = domains.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.domain.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (domain: Domain | null) => {
    setSelectedDomain(domain?.id || null);
    setIsOpen(false);
    setSearch('');

    // Navigate to appropriate dashboard
    if (domain) {
      // If we're on a global page, navigate to domain dashboard
      if (!pathname.startsWith('/admin/d/')) {
        router.push(`/admin/d/${domain.id}`);
      } else {
        // Update the domain ID in the current path
        const newPath = pathname.replace(/\/admin\/d\/[^/]+/, `/admin/d/${domain.id}`);
        router.push(newPath);
      }
    } else {
      // Navigate to global dashboard
      router.push('/admin');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'pending':
      case 'verifying':
        return 'bg-yellow-500';
      case 'suspended':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-3 py-2.5 bg-surface-hover hover:bg-border rounded-lg transition-colors"
      >
        {isGlobal ? (
          <>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center">
              <GlobeIcon className="w-4 h-4 text-text-inverse" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">Global</p>
              <p className="text-xs text-text-muted truncate">All domains</p>
            </div>
          </>
        ) : selectedDomain ? (
          <>
            <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center relative">
              <span className="text-sm font-semibold text-text-primary">
                {selectedDomain.name[0]?.toUpperCase()}
              </span>
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-hover ${getStatusColor(
                  selectedDomain.status
                )}`}
              />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{selectedDomain.name}</p>
              <p className="text-xs text-text-muted truncate">{selectedDomain.domain}</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-lg bg-surface animate-pulse" />
            <div className="flex-1 text-left">
              <div className="h-4 w-20 bg-surface rounded animate-pulse" />
            </div>
          </>
        )}
        <ChevronIcon className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg overflow-hidden z-50">
          {/* Search */}
          {domains.length > 5 && (
            <div className="p-2 border-b border-border">
              <input
                type="text"
                placeholder="Search domains..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-surface-hover rounded-md border-0 text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                autoFocus
              />
            </div>
          )}

          {/* Options */}
          <div className="max-h-64 overflow-y-auto">
            {/* Global Option */}
            <button
              onClick={() => handleSelect(null)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover transition-colors ${
                isGlobal ? 'bg-accent/10' : ''
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center">
                <GlobeIcon className="w-4 h-4 text-text-inverse" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">Global</p>
                <p className="text-xs text-text-muted">All domains</p>
              </div>
              {isGlobal && <CheckIcon className="w-4 h-4 text-accent" />}
            </button>

            {/* Divider */}
            {filteredDomains.length > 0 && <div className="h-px bg-border my-1" />}

            {/* Domain Options */}
            {isLoadingDomains ? (
              <div className="px-3 py-4 text-center text-text-muted text-sm">Loading domains...</div>
            ) : filteredDomains.length === 0 && search ? (
              <div className="px-3 py-4 text-center text-text-muted text-sm">No domains found</div>
            ) : (
              filteredDomains.map((domain) => (
                <button
                  key={domain.id}
                  onClick={() => handleSelect(domain)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover transition-colors ${
                    selectedDomainId === domain.id ? 'bg-accent/10' : ''
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center relative">
                    <span className="text-sm font-semibold text-text-primary">
                      {domain.name[0]?.toUpperCase()}
                    </span>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface ${getStatusColor(
                        domain.status
                      )}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{domain.name}</p>
                    <p className="text-xs text-text-muted truncate">{domain.domain}</p>
                  </div>
                  {selectedDomainId === domain.id && <CheckIcon className="w-4 h-4 text-accent" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
      />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
