'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Domain {
  id: string;
  name: string;
  domain: string;
  type: string;
  status: string;
  handleSuffix?: string;
  userCount?: number;
  groupCount?: number;
  certificateCount?: number;
  verifiedAt?: string;
  createdAt: string;
  health?: Record<string, unknown>;
  parentDomainId?: string | null;
  hierarchyPath?: string | null;
  hierarchyLevel?: number;
}

export interface Organization {
  id: string;
  name: string;
  displayName?: string;
  handle?: string;
  type?: string;
  domainId?: string;
  parentOrganizationId?: string | null;
  hierarchyPath?: string | null;
  hierarchyLevel?: number;
  memberCount?: number;
  verified?: boolean;
  avatar?: string;
  status?: string;
  description?: string;
}

interface AdminDomainContextValue {
  // Domain selection
  selectedDomainId: string | null;
  selectedDomain: Domain | null;
  setSelectedDomain: (id: string | null) => void;
  isGlobal: boolean;
  domains: Domain[];
  isLoadingDomains: boolean;

  // Organization selection (domain-scoped)
  selectedOrganizationId: string | null;
  selectedOrganization: Organization | null;
  setSelectedOrganization: (id: string | null) => void;
  isOrgScoped: boolean;
  organizations: Organization[];
  isLoadingOrganizations: boolean;

  // Permission inheritance toggle
  inheritPermissions: boolean;
  setInheritPermissions: (enabled: boolean) => void;
}

const DOMAIN_STORAGE_KEY = 'admin-selected-domain';
const ORG_STORAGE_KEY = 'admin-selected-org';
const INHERIT_PERMS_KEY = 'admin-inherit-permissions';

const AdminDomainContext = createContext<AdminDomainContextValue | null>(null);

function getStoredValue(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStoredValue(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage errors
  }
}

export function AdminDomainProvider({ children }: { children: ReactNode }) {
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [inheritPermissions, setInheritPermissionsState] = useState<boolean>(false);
  const [initialized, setInitialized] = useState(false);

  // Fetch all domains for the selector
  const { data: domainsData, isLoading: isLoadingDomains } = useQuery({
    queryKey: ['admin', 'domains', 'list-all'],
    queryFn: () => api.adminDomainsList({ limit: 100 }),
    staleTime: 60000,
  });

  const domains = (domainsData?.domains || []) as Domain[];

  // Fetch organizations for the selected domain
  const { data: orgsData, isLoading: isLoadingOrganizations } = useQuery({
    queryKey: ['admin', 'organizations', 'list', selectedDomainId],
    queryFn: () => api.adminDomainOrganizationsList(selectedDomainId!, { limit: 100 }),
    enabled: !!selectedDomainId,
    staleTime: 60000,
  });

  const organizations = (orgsData?.organizations || []) as Organization[];

  // Find the selected domain object
  const selectedDomain: Domain | null = selectedDomainId
    ? domains.find((d: Domain) => d.id === selectedDomainId) || null
    : null;

  // Find the selected organization object
  const selectedOrganization: Organization | null = selectedOrganizationId
    ? organizations.find((o: Organization) => o.id === selectedOrganizationId) || null
    : null;

  const isGlobal = selectedDomainId === null;
  const isOrgScoped = selectedOrganizationId !== null;

  // Initialize from localStorage on mount
  useEffect(() => {
    const storedDomainId = getStoredValue(DOMAIN_STORAGE_KEY);
    const storedOrgId = getStoredValue(ORG_STORAGE_KEY);
    const storedInherit = getStoredValue(INHERIT_PERMS_KEY);

    if (storedDomainId) {
      setSelectedDomainId(storedDomainId);
    }
    if (storedOrgId) {
      setSelectedOrganizationId(storedOrgId);
    }
    if (storedInherit !== null) {
      setInheritPermissionsState(storedInherit === 'true');
    }
    setInitialized(true);
  }, []);

  // Validate selected domain exists when domains load
  useEffect(() => {
    if (initialized && domains.length > 0 && selectedDomainId) {
      const exists = domains.some((d) => d.id === selectedDomainId);
      if (!exists) {
        setSelectedDomainId(null);
        setStoredValue(DOMAIN_STORAGE_KEY, null);
        // Also clear org selection
        setSelectedOrganizationId(null);
        setStoredValue(ORG_STORAGE_KEY, null);
      }
    }
  }, [initialized, domains, selectedDomainId]);

  // Validate selected org exists when orgs load
  useEffect(() => {
    if (initialized && organizations.length > 0 && selectedOrganizationId) {
      const exists = organizations.some((o) => o.id === selectedOrganizationId);
      if (!exists) {
        setSelectedOrganizationId(null);
        setStoredValue(ORG_STORAGE_KEY, null);
      }
    }
  }, [initialized, organizations, selectedOrganizationId]);

  // Clear org when domain changes
  useEffect(() => {
    if (initialized && selectedOrganizationId) {
      // If org's domainId doesn't match selected domain, clear it
      if (selectedOrganization && selectedOrganization.domainId && selectedOrganization.domainId !== selectedDomainId) {
        setSelectedOrganizationId(null);
        setStoredValue(ORG_STORAGE_KEY, null);
      }
    }
  }, [initialized, selectedDomainId, selectedOrganization, selectedOrganizationId]);

  const setSelectedDomain = useCallback((id: string | null) => {
    setSelectedDomainId(id);
    setStoredValue(DOMAIN_STORAGE_KEY, id);
    // Clear org selection when domain changes
    setSelectedOrganizationId(null);
    setStoredValue(ORG_STORAGE_KEY, null);
  }, []);

  const setSelectedOrganization = useCallback((id: string | null) => {
    setSelectedOrganizationId(id);
    setStoredValue(ORG_STORAGE_KEY, id);
  }, []);

  const setInheritPermissions = useCallback((enabled: boolean) => {
    setInheritPermissionsState(enabled);
    setStoredValue(INHERIT_PERMS_KEY, String(enabled));
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
        selectedOrganizationId,
        selectedOrganization,
        setSelectedOrganization,
        isOrgScoped,
        organizations,
        isLoadingOrganizations,
        inheritPermissions,
        setInheritPermissions,
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
