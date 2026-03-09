// @ts-nocheck
'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Domain {
  id: string;
  name: string;
  domain: string;
  type: 'hosted' | 'federated';
  status: 'pending' | 'verifying' | 'active' | 'suspended' | 'inactive';
  handleSuffix?: string;
  createdAt: string;
}

interface AdminDomainContextValue {
  selectedDomainId: string | null;
  selectedDomain: Domain | null;
  setSelectedDomain: (id: string | null) => void;
  isGlobal: boolean;
  domains: Domain[];
  isLoadingDomains: boolean;
}

const STORAGE_KEY = 'admin-selected-domain';

const AdminDomainContext = createContext<AdminDomainContextValue | null>(null);

function getStoredDomainId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredDomainId(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function AdminDomainProvider({ children }: { children: ReactNode }) {
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Fetch all domains for the selector
  const { data: domainsData, isLoading: isLoadingDomains } = useQuery({
    queryKey: ['admin', 'domains', 'list-all'],
    queryFn: () => api.adminDomainsList({ limit: 100 }),
    staleTime: 60000, // 1 minute
  });

  const domains = domainsData?.domains || [];

  // Find the selected domain object
  const selectedDomain = selectedDomainId
    ? domains.find((d) => d.id === selectedDomainId) || null
    : null;

  const isGlobal = selectedDomainId === null;

  // Initialize from localStorage on mount
  useEffect(() => {
    const storedId = getStoredDomainId();
    if (storedId) {
      setSelectedDomainId(storedId);
    }
    setInitialized(true);
  }, []);

  // Validate selected domain exists when domains load
  useEffect(() => {
    if (initialized && domains.length > 0 && selectedDomainId) {
      const exists = domains.some((d) => d.id === selectedDomainId);
      if (!exists) {
        // Domain no longer exists, reset to global
        setSelectedDomainId(null);
        setStoredDomainId(null);
      }
    }
  }, [initialized, domains, selectedDomainId]);

  const setSelectedDomain = useCallback((id: string | null) => {
    setSelectedDomainId(id);
    setStoredDomainId(id);
  }, []);

  return (
    <AdminDomainContext.Provider
      value={{
        selectedDomainId,
        selectedDomain,
        setSelectedDomain,
        isGlobal,
        domains,
        isLoadingDomains,
      }}
    >
      {children}
    </AdminDomainContext.Provider>
  );
}

export function useAdminDomain(): AdminDomainContextValue {
  const context = useContext(AdminDomainContext);
  if (!context) {
    throw new Error('useAdminDomain must be used within an AdminDomainProvider');
  }
  return context;
}

// Hook to get the current domain ID from context or URL params
export function useCurrentDomainId(urlDomainId?: string): string | null {
  const { selectedDomainId } = useAdminDomain();
  // URL param takes precedence if provided
  return urlDomainId || selectedDomainId;
}
