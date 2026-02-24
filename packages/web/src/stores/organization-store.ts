import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  OrganizationWithMembership,
  OrganizationRole,
  OrgPermission,
} from '@exprsn/shared';

interface OrganizationState {
  // Current active organization (null = personal account)
  activeOrganizationId: string | null;

  // Cached list of user's organizations
  organizations: OrganizationWithMembership[];

  // Loading state
  isLoading: boolean;
  lastFetchedAt: string | null;

  // Actions
  setActiveOrganization: (orgId: string | null) => void;
  setOrganizations: (orgs: OrganizationWithMembership[]) => void;
  addOrganization: (org: OrganizationWithMembership) => void;
  removeOrganization: (orgId: string) => void;
  updateOrganization: (orgId: string, updates: Partial<OrganizationWithMembership>) => void;
  setLoading: (loading: boolean) => void;
  clearOrganizations: () => void;
}

export const useOrganizationStore = create<OrganizationState>()(
  persist(
    (set, get) => ({
      activeOrganizationId: null,
      organizations: [],
      isLoading: false,
      lastFetchedAt: null,

      setActiveOrganization: (orgId) => {
        set({ activeOrganizationId: orgId });
      },

      setOrganizations: (orgs) => {
        set({
          organizations: orgs,
          lastFetchedAt: new Date().toISOString(),
        });
      },

      addOrganization: (org) => {
        set((state) => ({
          organizations: [...state.organizations, org],
        }));
      },

      removeOrganization: (orgId) => {
        const state = get();
        set({
          organizations: state.organizations.filter((o) => o.id !== orgId),
          // Clear active if it was the removed org
          activeOrganizationId:
            state.activeOrganizationId === orgId ? null : state.activeOrganizationId,
        });
      },

      updateOrganization: (orgId, updates) => {
        set((state) => ({
          organizations: state.organizations.map((o) =>
            o.id === orgId ? { ...o, ...updates } : o
          ),
        }));
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      clearOrganizations: () => {
        set({
          activeOrganizationId: null,
          organizations: [],
          lastFetchedAt: null,
        });
      },
    }),
    {
      name: 'exprsn-organizations',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeOrganizationId: state.activeOrganizationId,
        // Don't persist the full org list, just the active selection
      }),
    }
  )
);

// Helper hooks

/**
 * Get the current active organization (or null for personal account)
 */
export function useActiveOrganization(): OrganizationWithMembership | null {
  const activeId = useOrganizationStore((state) => state.activeOrganizationId);
  const organizations = useOrganizationStore((state) => state.organizations);

  if (!activeId) return null;
  return organizations.find((o) => o.id === activeId) || null;
}

/**
 * Check if user has a specific permission in the active organization
 */
export function useOrgPermission(permission: OrgPermission): boolean {
  const activeOrg = useActiveOrganization();

  if (!activeOrg) return false;

  const role = activeOrg.membership.role;

  // Owner has all permissions
  if (role.name === 'owner') return true;

  // Check role permissions
  return role.permissions.includes(permission);
}

/**
 * Check if user can perform an action in any of their organizations
 */
export function useCanPublishAsOrg(): OrganizationWithMembership[] {
  const organizations = useOrganizationStore((state) => state.organizations);

  return organizations.filter((org) => {
    const role = org.membership.role;

    // Owner can always publish
    if (role.name === 'owner') return true;

    // Check for publish permission or explicit flag
    return (
      org.membership.canPublishOnBehalf ||
      role.permissions.includes('org.content.publish')
    );
  });
}

/**
 * Get display name for the current context
 */
export function useContextDisplayName(): string {
  const activeOrg = useActiveOrganization();

  if (!activeOrg) return 'Personal Account';

  return activeOrg.displayName || activeOrg.name;
}

/**
 * Switch to a different organization context
 */
export function useSwitchOrganization() {
  const setActiveOrganization = useOrganizationStore(
    (state) => state.setActiveOrganization
  );

  return (orgId: string | null) => {
    setActiveOrganization(orgId);
  };
}
