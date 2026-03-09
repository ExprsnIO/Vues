export const DOMAIN_PERMISSION_CATEGORIES = {
  USERS: 'users',
  GROUPS: 'groups',
  ROLES: 'roles',
  ORGANIZATIONS: 'organizations',
  SSO: 'sso',
  PLC: 'plc',
  FEDERATION: 'federation',
  MODERATION: 'moderation',
  SERVICES: 'services',
  CERTIFICATES: 'certificates',
  ANALYTICS: 'analytics',
  BILLING: 'billing',
  BRANDING: 'branding',
  CONTENT: 'content',
} as const;

export type DomainPermissionCategory =
  typeof DOMAIN_PERMISSION_CATEGORIES[keyof typeof DOMAIN_PERMISSION_CATEGORIES];

export const DOMAIN_PERMISSIONS = {
  USERS_VIEW: 'domain.users.view',
  USERS_MANAGE: 'domain.users.manage',
  GROUPS_VIEW: 'domain.groups.view',
  GROUPS_MANAGE: 'domain.groups.manage',
  ROLES_VIEW: 'domain.roles.view',
  ROLES_MANAGE: 'domain.roles.manage',
  ORGANIZATIONS_VIEW: 'domain.organizations.view',
  ORGANIZATIONS_MANAGE: 'domain.organizations.manage',
  SSO_VIEW: 'domain.sso.view',
  SSO_MANAGE: 'domain.sso.manage',
  PLC_VIEW: 'domain.plc.view',
  PLC_MANAGE: 'domain.plc.manage',
  FEDERATION_VIEW: 'domain.federation.view',
  FEDERATION_MANAGE: 'domain.federation.manage',
  MODERATION_VIEW: 'domain.moderation.view',
  MODERATION_MANAGE: 'domain.moderation.manage',
  SERVICES_VIEW: 'domain.services.view',
  SERVICES_MANAGE: 'domain.services.manage',
  CERTIFICATES_VIEW: 'domain.certificates.view',
  CERTIFICATES_MANAGE: 'domain.certificates.manage',
  ANALYTICS_VIEW: 'domain.analytics.view',
  BILLING_VIEW: 'domain.billing.view',
  BILLING_MANAGE: 'domain.billing.manage',
  BRANDING_VIEW: 'domain.branding.view',
  BRANDING_MANAGE: 'domain.branding.manage',
  CONTENT_VIEW: 'domain.content.view',
  CONTENT_MANAGE: 'domain.content.manage',
} as const;

export type DomainPermission = typeof DOMAIN_PERMISSIONS[keyof typeof DOMAIN_PERMISSIONS];

export interface DomainPermissionDefinition {
  id: DomainPermission;
  name: string;
  description: string;
  category: DomainPermissionCategory;
}

export const DOMAIN_PERMISSION_DEFINITIONS: DomainPermissionDefinition[] = [
  {
    id: DOMAIN_PERMISSIONS.USERS_VIEW,
    name: 'View Users',
    description: 'View domain users and inherited admins.',
    category: DOMAIN_PERMISSION_CATEGORIES.USERS,
  },
  {
    id: DOMAIN_PERMISSIONS.USERS_MANAGE,
    name: 'Manage Users',
    description: 'Add, remove, and update domain users.',
    category: DOMAIN_PERMISSION_CATEGORIES.USERS,
  },
  {
    id: DOMAIN_PERMISSIONS.GROUPS_VIEW,
    name: 'View Groups',
    description: 'View domain groups and memberships.',
    category: DOMAIN_PERMISSION_CATEGORIES.GROUPS,
  },
  {
    id: DOMAIN_PERMISSIONS.GROUPS_MANAGE,
    name: 'Manage Groups',
    description: 'Create groups and manage group membership.',
    category: DOMAIN_PERMISSION_CATEGORIES.GROUPS,
  },
  {
    id: DOMAIN_PERMISSIONS.ROLES_VIEW,
    name: 'View Roles',
    description: 'Inspect domain role definitions.',
    category: DOMAIN_PERMISSION_CATEGORIES.ROLES,
  },
  {
    id: DOMAIN_PERMISSIONS.ROLES_MANAGE,
    name: 'Manage Roles',
    description: 'Create, update, delete, and assign domain roles.',
    category: DOMAIN_PERMISSION_CATEGORIES.ROLES,
  },
  {
    id: DOMAIN_PERMISSIONS.ORGANIZATIONS_VIEW,
    name: 'View Organizations',
    description: 'View organizations associated with the domain.',
    category: DOMAIN_PERMISSION_CATEGORIES.ORGANIZATIONS,
  },
  {
    id: DOMAIN_PERMISSIONS.ORGANIZATIONS_MANAGE,
    name: 'Manage Organizations',
    description: 'Create and manage organizations for the domain.',
    category: DOMAIN_PERMISSION_CATEGORIES.ORGANIZATIONS,
  },
  {
    id: DOMAIN_PERMISSIONS.SSO_VIEW,
    name: 'View SSO',
    description: 'View domain SSO configuration and linked users.',
    category: DOMAIN_PERMISSION_CATEGORIES.SSO,
  },
  {
    id: DOMAIN_PERMISSIONS.SSO_MANAGE,
    name: 'Manage SSO',
    description: 'Manage domain SSO providers and policies.',
    category: DOMAIN_PERMISSION_CATEGORIES.SSO,
  },
  {
    id: DOMAIN_PERMISSIONS.PLC_VIEW,
    name: 'View Identity',
    description: 'View PLC identities, handle reservations, and config.',
    category: DOMAIN_PERMISSION_CATEGORIES.PLC,
  },
  {
    id: DOMAIN_PERMISSIONS.PLC_MANAGE,
    name: 'Manage Identity',
    description: 'Create identities and manage PLC configuration.',
    category: DOMAIN_PERMISSION_CATEGORIES.PLC,
  },
  {
    id: DOMAIN_PERMISSIONS.FEDERATION_VIEW,
    name: 'View Federation',
    description: 'Inspect federation settings and health.',
    category: DOMAIN_PERMISSION_CATEGORIES.FEDERATION,
  },
  {
    id: DOMAIN_PERMISSIONS.FEDERATION_MANAGE,
    name: 'Manage Federation',
    description: 'Update federation policy, peers, and sync controls.',
    category: DOMAIN_PERMISSION_CATEGORIES.FEDERATION,
  },
  {
    id: DOMAIN_PERMISSIONS.MODERATION_VIEW,
    name: 'View Moderation',
    description: 'View moderation queue, reports, and appeals.',
    category: DOMAIN_PERMISSION_CATEGORIES.MODERATION,
  },
  {
    id: DOMAIN_PERMISSIONS.MODERATION_MANAGE,
    name: 'Manage Moderation',
    description: 'Take moderation actions on domain content and users.',
    category: DOMAIN_PERMISSION_CATEGORIES.MODERATION,
  },
  {
    id: DOMAIN_PERMISSIONS.SERVICES_VIEW,
    name: 'View Services',
    description: 'Inspect domain services and infrastructure.',
    category: DOMAIN_PERMISSION_CATEGORIES.SERVICES,
  },
  {
    id: DOMAIN_PERMISSIONS.SERVICES_MANAGE,
    name: 'Manage Services',
    description: 'Manage services, tokens, and infrastructure bindings.',
    category: DOMAIN_PERMISSION_CATEGORIES.SERVICES,
  },
  {
    id: DOMAIN_PERMISSIONS.CERTIFICATES_VIEW,
    name: 'View Certificates',
    description: 'View domain certificates and status.',
    category: DOMAIN_PERMISSION_CATEGORIES.CERTIFICATES,
  },
  {
    id: DOMAIN_PERMISSIONS.CERTIFICATES_MANAGE,
    name: 'Manage Certificates',
    description: 'Issue, revoke, and download domain certificates.',
    category: DOMAIN_PERMISSION_CATEGORIES.CERTIFICATES,
  },
  {
    id: DOMAIN_PERMISSIONS.ANALYTICS_VIEW,
    name: 'View Analytics',
    description: 'Access domain analytics and reporting.',
    category: DOMAIN_PERMISSION_CATEGORIES.ANALYTICS,
  },
  {
    id: DOMAIN_PERMISSIONS.BILLING_VIEW,
    name: 'View Billing',
    description: 'View domain billing configuration and usage.',
    category: DOMAIN_PERMISSION_CATEGORIES.BILLING,
  },
  {
    id: DOMAIN_PERMISSIONS.BILLING_MANAGE,
    name: 'Manage Billing',
    description: 'Update billing configuration for the domain.',
    category: DOMAIN_PERMISSION_CATEGORIES.BILLING,
  },
  {
    id: DOMAIN_PERMISSIONS.BRANDING_VIEW,
    name: 'View Branding',
    description: 'View domain branding settings.',
    category: DOMAIN_PERMISSION_CATEGORIES.BRANDING,
  },
  {
    id: DOMAIN_PERMISSIONS.BRANDING_MANAGE,
    name: 'Manage Branding',
    description: 'Update domain branding settings.',
    category: DOMAIN_PERMISSION_CATEGORIES.BRANDING,
  },
  {
    id: DOMAIN_PERMISSIONS.CONTENT_VIEW,
    name: 'View Content',
    description: 'View domain content and content metadata.',
    category: DOMAIN_PERMISSION_CATEGORIES.CONTENT,
  },
  {
    id: DOMAIN_PERMISSIONS.CONTENT_MANAGE,
    name: 'Manage Content',
    description: 'Feature, edit, or remove domain content.',
    category: DOMAIN_PERMISSION_CATEGORIES.CONTENT,
  },
];

export type DomainSystemRoleName = 'owner' | 'admin' | 'moderator' | 'member';

export interface DomainSystemRoleDefinition {
  name: DomainSystemRoleName;
  displayName: string;
  description: string;
  permissions: DomainPermission[];
  priority: number;
}

const ALL_DOMAIN_PERMISSIONS = DOMAIN_PERMISSION_DEFINITIONS.map((permission) => permission.id);

export const DOMAIN_SYSTEM_ROLES: Record<DomainSystemRoleName, DomainSystemRoleDefinition> = {
  owner: {
    name: 'owner',
    displayName: 'Owner',
    description: 'Full control over the domain and its delegated access.',
    permissions: ALL_DOMAIN_PERMISSIONS,
    priority: 100,
  },
  admin: {
    name: 'admin',
    displayName: 'Admin',
    description: 'Administrative access to domain configuration and management.',
    permissions: ALL_DOMAIN_PERMISSIONS.filter((permission) => permission !== DOMAIN_PERMISSIONS.BILLING_MANAGE),
    priority: 80,
  },
  moderator: {
    name: 'moderator',
    displayName: 'Moderator',
    description: 'Access focused on safety, content, and user review workflows.',
    permissions: [
      DOMAIN_PERMISSIONS.USERS_VIEW,
      DOMAIN_PERMISSIONS.GROUPS_VIEW,
      DOMAIN_PERMISSIONS.ORGANIZATIONS_VIEW,
      DOMAIN_PERMISSIONS.MODERATION_VIEW,
      DOMAIN_PERMISSIONS.MODERATION_MANAGE,
      DOMAIN_PERMISSIONS.CONTENT_VIEW,
      DOMAIN_PERMISSIONS.CONTENT_MANAGE,
      DOMAIN_PERMISSIONS.ANALYTICS_VIEW,
    ],
    priority: 60,
  },
  member: {
    name: 'member',
    displayName: 'Member',
    description: 'Basic access to view shared domain surfaces.',
    permissions: [
      DOMAIN_PERMISSIONS.USERS_VIEW,
      DOMAIN_PERMISSIONS.GROUPS_VIEW,
      DOMAIN_PERMISSIONS.ORGANIZATIONS_VIEW,
      DOMAIN_PERMISSIONS.CONTENT_VIEW,
      DOMAIN_PERMISSIONS.ANALYTICS_VIEW,
    ],
    priority: 20,
  },
};

export interface DomainRoleSummary {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  isSystem: boolean;
  priority: number;
  permissions: DomainPermission[];
}

export interface EffectiveDomainAccess {
  domainId: string;
  userDid: string;
  source: 'domain' | 'global_inherited';
  directPermissions: DomainPermission[];
  assignedRoles: DomainRoleSummary[];
  groups: Array<{
    id: string;
    name: string;
    directPermissions: DomainPermission[];
    assignedRoles: DomainRoleSummary[];
  }>;
  effectivePermissions: DomainPermission[];
}
