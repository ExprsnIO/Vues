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
  STREAMING: 'streaming',
  VIDEO_PROCESSING: 'video_processing',
  API_TOKENS: 'api_tokens',
  INVITE_CODES: 'invite_codes',
  PAYMENTS: 'payments',
  WEBHOOKS: 'webhooks',
  AUDIT: 'audit',
  INFRASTRUCTURE: 'infrastructure',
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
  // Streaming & Live
  STREAMING_VIEW: 'domain.streaming.view',
  STREAMING_MANAGE: 'domain.streaming.manage',
  STREAMING_MODERATE: 'domain.streaming.moderate',
  // Video Processing
  VIDEO_PROCESSING_VIEW: 'domain.video_processing.view',
  VIDEO_PROCESSING_MANAGE: 'domain.video_processing.manage',
  // API Tokens
  API_TOKENS_VIEW: 'domain.api_tokens.view',
  API_TOKENS_MANAGE: 'domain.api_tokens.manage',
  // Invite Codes
  INVITE_CODES_VIEW: 'domain.invite_codes.view',
  INVITE_CODES_MANAGE: 'domain.invite_codes.manage',
  // Payments
  PAYMENTS_VIEW: 'domain.payments.view',
  PAYMENTS_MANAGE: 'domain.payments.manage',
  // Webhooks
  WEBHOOKS_VIEW: 'domain.webhooks.view',
  WEBHOOKS_MANAGE: 'domain.webhooks.manage',
  // Audit
  AUDIT_VIEW: 'domain.audit.view',
  // Infrastructure
  INFRASTRUCTURE_VIEW: 'domain.infrastructure.view',
  INFRASTRUCTURE_MANAGE: 'domain.infrastructure.manage',
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
  // Streaming
  {
    id: DOMAIN_PERMISSIONS.STREAMING_VIEW,
    name: 'View Streams',
    description: 'View live streams and stream analytics.',
    category: DOMAIN_PERMISSION_CATEGORIES.STREAMING,
  },
  {
    id: DOMAIN_PERMISSIONS.STREAMING_MANAGE,
    name: 'Manage Streams',
    description: 'Create, configure, and end live streams.',
    category: DOMAIN_PERMISSION_CATEGORIES.STREAMING,
  },
  {
    id: DOMAIN_PERMISSIONS.STREAMING_MODERATE,
    name: 'Moderate Streams',
    description: 'Moderate live stream chat and ban viewers.',
    category: DOMAIN_PERMISSION_CATEGORIES.STREAMING,
  },
  // Video Processing
  {
    id: DOMAIN_PERMISSIONS.VIDEO_PROCESSING_VIEW,
    name: 'View Processing',
    description: 'View render pipeline and transcode queue status.',
    category: DOMAIN_PERMISSION_CATEGORIES.VIDEO_PROCESSING,
  },
  {
    id: DOMAIN_PERMISSIONS.VIDEO_PROCESSING_MANAGE,
    name: 'Manage Processing',
    description: 'Retry, cancel, and prioritize video processing jobs.',
    category: DOMAIN_PERMISSION_CATEGORIES.VIDEO_PROCESSING,
  },
  // API Tokens
  {
    id: DOMAIN_PERMISSIONS.API_TOKENS_VIEW,
    name: 'View API Tokens',
    description: 'View issued API tokens and usage statistics.',
    category: DOMAIN_PERMISSION_CATEGORIES.API_TOKENS,
  },
  {
    id: DOMAIN_PERMISSIONS.API_TOKENS_MANAGE,
    name: 'Manage API Tokens',
    description: 'Issue, revoke, and configure API tokens.',
    category: DOMAIN_PERMISSION_CATEGORIES.API_TOKENS,
  },
  // Invite Codes
  {
    id: DOMAIN_PERMISSIONS.INVITE_CODES_VIEW,
    name: 'View Invite Codes',
    description: 'View invite codes and usage statistics.',
    category: DOMAIN_PERMISSION_CATEGORIES.INVITE_CODES,
  },
  {
    id: DOMAIN_PERMISSIONS.INVITE_CODES_MANAGE,
    name: 'Manage Invite Codes',
    description: 'Generate, revoke, and configure invite codes.',
    category: DOMAIN_PERMISSION_CATEGORIES.INVITE_CODES,
  },
  // Payments
  {
    id: DOMAIN_PERMISSIONS.PAYMENTS_VIEW,
    name: 'View Payments',
    description: 'View payment gateway configuration and transactions.',
    category: DOMAIN_PERMISSION_CATEGORIES.PAYMENTS,
  },
  {
    id: DOMAIN_PERMISSIONS.PAYMENTS_MANAGE,
    name: 'Manage Payments',
    description: 'Configure payment gateways and process refunds.',
    category: DOMAIN_PERMISSION_CATEGORIES.PAYMENTS,
  },
  // Webhooks
  {
    id: DOMAIN_PERMISSIONS.WEBHOOKS_VIEW,
    name: 'View Webhooks',
    description: 'View webhook configurations and delivery logs.',
    category: DOMAIN_PERMISSION_CATEGORIES.WEBHOOKS,
  },
  {
    id: DOMAIN_PERMISSIONS.WEBHOOKS_MANAGE,
    name: 'Manage Webhooks',
    description: 'Create, update, and test webhook endpoints.',
    category: DOMAIN_PERMISSION_CATEGORIES.WEBHOOKS,
  },
  // Audit
  {
    id: DOMAIN_PERMISSIONS.AUDIT_VIEW,
    name: 'View Audit Log',
    description: 'Access domain audit trail and activity history.',
    category: DOMAIN_PERMISSION_CATEGORIES.AUDIT,
  },
  // Infrastructure
  {
    id: DOMAIN_PERMISSIONS.INFRASTRUCTURE_VIEW,
    name: 'View Infrastructure',
    description: 'View cluster, GPU, and infrastructure status.',
    category: DOMAIN_PERMISSION_CATEGORIES.INFRASTRUCTURE,
  },
  {
    id: DOMAIN_PERMISSIONS.INFRASTRUCTURE_MANAGE,
    name: 'Manage Infrastructure',
    description: 'Configure cluster resources and GPU allocation.',
    category: DOMAIN_PERMISSION_CATEGORIES.INFRASTRUCTURE,
  },
];

export type DomainSystemRoleName = 'owner' | 'admin' | 'moderator' | 'member' | 'stream_manager' | 'billing_admin' | 'api_manager' | 'auditor';

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
      DOMAIN_PERMISSIONS.STREAMING_VIEW,
      DOMAIN_PERMISSIONS.STREAMING_MODERATE,
      DOMAIN_PERMISSIONS.AUDIT_VIEW,
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
  stream_manager: {
    name: 'stream_manager',
    displayName: 'Stream Manager',
    description: 'Manage live streaming, RTMP configuration, and stream moderation.',
    permissions: [
      DOMAIN_PERMISSIONS.STREAMING_VIEW,
      DOMAIN_PERMISSIONS.STREAMING_MANAGE,
      DOMAIN_PERMISSIONS.STREAMING_MODERATE,
      DOMAIN_PERMISSIONS.CONTENT_VIEW,
      DOMAIN_PERMISSIONS.ANALYTICS_VIEW,
    ],
    priority: 50,
  },
  billing_admin: {
    name: 'billing_admin',
    displayName: 'Billing Admin',
    description: 'Manage payments, subscriptions, and billing configuration.',
    permissions: [
      DOMAIN_PERMISSIONS.BILLING_VIEW,
      DOMAIN_PERMISSIONS.BILLING_MANAGE,
      DOMAIN_PERMISSIONS.PAYMENTS_VIEW,
      DOMAIN_PERMISSIONS.PAYMENTS_MANAGE,
      DOMAIN_PERMISSIONS.ANALYTICS_VIEW,
    ],
    priority: 40,
  },
  api_manager: {
    name: 'api_manager',
    displayName: 'API Manager',
    description: 'Manage API tokens, webhooks, and developer integrations.',
    permissions: [
      DOMAIN_PERMISSIONS.API_TOKENS_VIEW,
      DOMAIN_PERMISSIONS.API_TOKENS_MANAGE,
      DOMAIN_PERMISSIONS.WEBHOOKS_VIEW,
      DOMAIN_PERMISSIONS.WEBHOOKS_MANAGE,
      DOMAIN_PERMISSIONS.INVITE_CODES_VIEW,
      DOMAIN_PERMISSIONS.INVITE_CODES_MANAGE,
      DOMAIN_PERMISSIONS.SERVICES_VIEW,
    ],
    priority: 40,
  },
  auditor: {
    name: 'auditor',
    displayName: 'Auditor',
    description: 'Read-only access to audit logs, analytics, and compliance data.',
    permissions: [
      DOMAIN_PERMISSIONS.AUDIT_VIEW,
      DOMAIN_PERMISSIONS.ANALYTICS_VIEW,
      DOMAIN_PERMISSIONS.USERS_VIEW,
      DOMAIN_PERMISSIONS.CONTENT_VIEW,
      DOMAIN_PERMISSIONS.MODERATION_VIEW,
      DOMAIN_PERMISSIONS.BILLING_VIEW,
      DOMAIN_PERMISSIONS.CERTIFICATES_VIEW,
      DOMAIN_PERMISSIONS.INFRASTRUCTURE_VIEW,
    ],
    priority: 30,
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
