'use client';

import { createContext, useContext, useEffect, useCallback, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth-context';
import {
  useOrganizationStore,
  useActiveOrganization,
  useSwitchOrganization,
} from '@/stores/organization-store';
import type { OrganizationWithMembership } from '@exprsn/shared';

interface OrganizationContextValue {
  // Current organization context
  activeOrganization: OrganizationWithMembership | null;
  isPersonalAccount: boolean;

  // User's organizations
  organizations: OrganizationWithMembership[];
  isLoading: boolean;
  error: Error | null;

  // Actions
  switchOrganization: (orgId: string | null) => void;
  refreshOrganizations: () => void;

  // Organization mutations
  createOrganization: (data: CreateOrgData) => Promise<{ id: string }>;
  leaveOrganization: (orgId: string) => Promise<void>;
}

interface CreateOrgData {
  name: string;
  handle?: string;
  type: string;
  bio?: string;
  isPublic?: boolean;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Zustand store
  const setOrganizations = useOrganizationStore((state) => state.setOrganizations);
  const setLoading = useOrganizationStore((state) => state.setLoading);
  const clearOrganizations = useOrganizationStore((state) => state.clearOrganizations);
  const storeOrganizations = useOrganizationStore((state) => state.organizations);

  // Get active org from hook
  const activeOrganization = useActiveOrganization();
  const switchOrg = useSwitchOrganization();

  // Fetch user's organizations
  const {
    data: orgsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['user-organizations'],
    queryFn: async () => {
      const response = await api.getUserOrganizations();
      return response.organizations as OrganizationWithMembership[];
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Sync fetched data to Zustand store
  useEffect(() => {
    if (orgsData) {
      setOrganizations(orgsData);
    }
  }, [orgsData, setOrganizations]);

  // Update loading state
  useEffect(() => {
    setLoading(isLoading);
  }, [isLoading, setLoading]);

  // Clear organizations on logout
  useEffect(() => {
    if (!isAuthenticated) {
      clearOrganizations();
    }
  }, [isAuthenticated, clearOrganizations]);

  // Create organization mutation
  const createOrgMutation = useMutation({
    mutationFn: async (data: CreateOrgData) => {
      const response = await api.createOrganization(data);
      return response;
    },
    onSuccess: () => {
      // Refetch organizations list
      refetch();
    },
  });

  // Leave organization mutation
  const leaveOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      await api.leaveOrganization(orgId);
    },
    onSuccess: (_, orgId) => {
      // If leaving active org, switch to personal
      if (activeOrganization?.id === orgId) {
        switchOrg(null);
      }
      // Refetch organizations list
      refetch();
    },
  });

  const switchOrganization = useCallback(
    (orgId: string | null) => {
      switchOrg(orgId);
    },
    [switchOrg]
  );

  const refreshOrganizations = useCallback(() => {
    refetch();
  }, [refetch]);

  const createOrganization = useCallback(
    async (data: CreateOrgData) => {
      return createOrgMutation.mutateAsync(data);
    },
    [createOrgMutation]
  );

  const leaveOrganization = useCallback(
    async (orgId: string) => {
      return leaveOrgMutation.mutateAsync(orgId);
    },
    [leaveOrgMutation]
  );

  const value: OrganizationContextValue = {
    activeOrganization,
    isPersonalAccount: !activeOrganization,
    organizations: storeOrganizations,
    isLoading,
    error: error as Error | null,
    switchOrganization,
    refreshOrganizations,
    createOrganization,
    leaveOrganization,
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}

// Re-export store hooks for convenience
export {
  useActiveOrganization,
  useOrgPermission,
  useCanPublishAsOrg,
  useContextDisplayName,
} from '@/stores/organization-store';
