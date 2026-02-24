// Organization Types
// Types for organization management, roles, permissions, and related features

// Organization type identifiers
export type OrganizationType = 'team' | 'company' | 'brand' | 'network' | 'channel' | 'enterprise' | 'nonprofit' | 'business' | 'label';

// Organization verification status
export type VerificationStatus = 'none' | 'pending' | 'verified' | 'rejected';

// Verification workflow types
export type VerificationWorkflow = 'standard' | 'enterprise' | 'creative';

// System role identifiers (built-in roles)
export type SystemRoleName = 'owner' | 'admin' | 'editor' | 'viewer' | 'member';

// Organization permission identifiers
export const ORG_PERMISSIONS = {
  // Member management
  MANAGE_MEMBERS: 'org.members.manage',
  INVITE_MEMBERS: 'org.members.invite',
  REMOVE_MEMBERS: 'org.members.remove',

  // Role management
  MANAGE_ROLES: 'org.roles.manage',
  ASSIGN_ROLES: 'org.roles.assign',

  // Settings management
  MANAGE_SETTINGS: 'org.settings.manage',
  EDIT_PROFILE: 'org.settings.profile',

  // Billing
  MANAGE_BILLING: 'org.billing.manage',
  VIEW_BILLING: 'org.billing.view',

  // Content
  PUBLISH_CONTENT: 'org.content.publish',
  REVIEW_CONTENT: 'org.content.review',
  DELETE_CONTENT: 'org.content.delete',

  // Analytics
  VIEW_ANALYTICS: 'org.analytics.view',
  EXPORT_ANALYTICS: 'org.analytics.export',

  // API & Integrations
  MANAGE_API: 'org.api.manage',
  MANAGE_WEBHOOKS: 'org.webhooks.manage',
} as const;

export type OrgPermission = typeof ORG_PERMISSIONS[keyof typeof ORG_PERMISSIONS];

// Type-specific permissions for specialized organization features
export const ORG_TYPE_PERMISSIONS = {
  // Label/Music permissions
  MANAGE_ARTISTS: 'org.artists.manage',
  VIEW_ARTISTS: 'org.artists.view',
  MANAGE_CATALOG: 'org.catalog.manage',
  VIEW_CATALOG: 'org.catalog.view',
  MANAGE_ROYALTIES: 'org.royalties.manage',
  VIEW_ROYALTIES: 'org.royalties.view',
  MANAGE_DISTRIBUTION: 'org.distribution.manage',

  // Brand permissions
  MANAGE_CAMPAIGNS: 'org.campaigns.manage',
  VIEW_CAMPAIGNS: 'org.campaigns.view',
  MANAGE_INFLUENCERS: 'org.influencers.manage',
  VIEW_INFLUENCERS: 'org.influencers.view',
  MANAGE_GUIDELINES: 'org.guidelines.manage',

  // Enterprise permissions
  MANAGE_DEPARTMENTS: 'org.department.manage',
  VIEW_DEPARTMENTS: 'org.department.view',
  MANAGE_COMPLIANCE: 'org.compliance.manage',
  VIEW_COMPLIANCE: 'org.compliance.view',
  VIEW_AUDIT: 'org.audit.view',
  EXPORT_AUDIT: 'org.audit.export',

  // Network permissions
  MANAGE_CHANNELS: 'org.channels.manage',
  VIEW_CHANNELS: 'org.channels.view',
  MANAGE_TALENT: 'org.talent.manage',
  VIEW_TALENT: 'org.talent.view',

  // Nonprofit permissions
  MANAGE_DONORS: 'org.donors.manage',
  VIEW_DONORS: 'org.donors.view',
  MANAGE_GRANTS: 'org.grants.manage',
  VIEW_GRANTS: 'org.grants.view',
  MANAGE_VOLUNTEERS: 'org.volunteers.manage',
  VIEW_VOLUNTEERS: 'org.volunteers.view',
  MANAGE_PROGRAMS: 'org.programs.manage',
} as const;

export type OrgTypePermission = typeof ORG_TYPE_PERMISSIONS[keyof typeof ORG_TYPE_PERMISSIONS];

// Feature identifiers for type-specific features
export const ORG_TYPE_FEATURES = {
  // Label/Music features
  ARTIST_MANAGEMENT: 'artist_management',
  CATALOG_MANAGEMENT: 'catalog_management',
  ROYALTY_TRACKING: 'royalty_tracking',
  DISTRIBUTION: 'distribution',

  // Brand features
  CAMPAIGN_MANAGEMENT: 'campaign_management',
  INFLUENCER_CONNECTIONS: 'influencer_connections',
  BRAND_GUIDELINES: 'brand_guidelines',

  // Enterprise features
  DEPARTMENT_HIERARCHY: 'department_hierarchy',
  COMPLIANCE_SETTINGS: 'compliance_settings',
  SSO_INTEGRATION: 'sso_integration',
  AUDIT_LOGGING: 'audit_logging',

  // Network features
  CHANNEL_MANAGEMENT: 'channel_management',
  TALENT_COORDINATION: 'talent_coordination',
  NETWORK_ANALYTICS: 'network_analytics',

  // Nonprofit features
  DONOR_MANAGEMENT: 'donor_management',
  GRANT_TRACKING: 'grant_tracking',
  VOLUNTEER_COORDINATION: 'volunteer_coordination',
} as const;

export type OrgTypeFeature = typeof ORG_TYPE_FEATURES[keyof typeof ORG_TYPE_FEATURES];

// Default enabled features per organization type
export const DEFAULT_TYPE_FEATURES: Record<OrganizationType, OrgTypeFeature[]> = {
  label: [
    ORG_TYPE_FEATURES.ARTIST_MANAGEMENT,
    ORG_TYPE_FEATURES.CATALOG_MANAGEMENT,
    ORG_TYPE_FEATURES.ROYALTY_TRACKING,
    ORG_TYPE_FEATURES.DISTRIBUTION,
  ],
  brand: [
    ORG_TYPE_FEATURES.CAMPAIGN_MANAGEMENT,
    ORG_TYPE_FEATURES.INFLUENCER_CONNECTIONS,
    ORG_TYPE_FEATURES.BRAND_GUIDELINES,
  ],
  enterprise: [
    ORG_TYPE_FEATURES.DEPARTMENT_HIERARCHY,
    ORG_TYPE_FEATURES.COMPLIANCE_SETTINGS,
    ORG_TYPE_FEATURES.SSO_INTEGRATION,
    ORG_TYPE_FEATURES.AUDIT_LOGGING,
  ],
  network: [
    ORG_TYPE_FEATURES.CHANNEL_MANAGEMENT,
    ORG_TYPE_FEATURES.TALENT_COORDINATION,
    ORG_TYPE_FEATURES.NETWORK_ANALYTICS,
  ],
  nonprofit: [
    ORG_TYPE_FEATURES.DONOR_MANAGEMENT,
    ORG_TYPE_FEATURES.GRANT_TRACKING,
    ORG_TYPE_FEATURES.VOLUNTEER_COORDINATION,
  ],
  team: [],
  company: [],
  channel: [],
  business: [],
};

// Handle suffixes per organization type
export const ORG_TYPE_HANDLE_SUFFIXES: Record<OrganizationType, string> = {
  label: 'label.exprsn',
  brand: 'brand.exprsn',
  enterprise: 'ent.exprsn',
  network: 'network.exprsn',
  nonprofit: 'npo.exprsn',
  channel: 'channel.exprsn',
  team: 'org.exprsn',
  company: 'org.exprsn',
  business: 'org.exprsn',
};

// Type-specific default role definition
export interface TypeSpecificRole {
  name: string;
  displayName: string;
  description: string;
  permissions: (OrgPermission | OrgTypePermission)[];
  color: string;
  priority: number;
}

// Type-specific default roles
export const TYPE_SPECIFIC_ROLES: Record<OrganizationType, TypeSpecificRole[]> = {
  label: [
    {
      name: 'ar_manager',
      displayName: 'A&R Manager',
      description: 'Manages artists, talent scouting, and creative direction',
      permissions: [
        ORG_TYPE_PERMISSIONS.MANAGE_ARTISTS,
        ORG_TYPE_PERMISSIONS.VIEW_ARTISTS,
        ORG_PERMISSIONS.PUBLISH_CONTENT,
        ORG_PERMISSIONS.VIEW_ANALYTICS,
      ],
      color: '#8b5cf6', // Purple
      priority: 70,
    },
    {
      name: 'catalog_manager',
      displayName: 'Catalog Manager',
      description: 'Manages music catalog, releases, and metadata',
      permissions: [
        ORG_TYPE_PERMISSIONS.MANAGE_CATALOG,
        ORG_TYPE_PERMISSIONS.VIEW_CATALOG,
        ORG_PERMISSIONS.REVIEW_CONTENT,
        ORG_PERMISSIONS.VIEW_ANALYTICS,
      ],
      color: '#06b6d4', // Cyan
      priority: 65,
    },
    {
      name: 'artist',
      displayName: 'Artist',
      description: 'Signed artist with publishing rights',
      permissions: [
        ORG_PERMISSIONS.PUBLISH_CONTENT,
        ORG_PERMISSIONS.VIEW_ANALYTICS,
        ORG_TYPE_PERMISSIONS.VIEW_ROYALTIES,
      ],
      color: '#f59e0b', // Amber
      priority: 40,
    },
  ],
  brand: [
    {
      name: 'campaign_manager',
      displayName: 'Campaign Manager',
      description: 'Creates and manages marketing campaigns',
      permissions: [
        ORG_TYPE_PERMISSIONS.MANAGE_CAMPAIGNS,
        ORG_TYPE_PERMISSIONS.VIEW_CAMPAIGNS,
        ORG_PERMISSIONS.PUBLISH_CONTENT,
        ORG_PERMISSIONS.VIEW_ANALYTICS,
        ORG_PERMISSIONS.EXPORT_ANALYTICS,
      ],
      color: '#ec4899', // Pink
      priority: 70,
    },
    {
      name: 'creative_director',
      displayName: 'Creative Director',
      description: 'Oversees creative content and brand guidelines',
      permissions: [
        ORG_PERMISSIONS.REVIEW_CONTENT,
        ORG_PERMISSIONS.PUBLISH_CONTENT,
        ORG_TYPE_PERMISSIONS.MANAGE_GUIDELINES,
        ORG_PERMISSIONS.VIEW_ANALYTICS,
      ],
      color: '#14b8a6', // Teal
      priority: 65,
    },
    {
      name: 'influencer_liaison',
      displayName: 'Influencer Liaison',
      description: 'Manages influencer relationships and partnerships',
      permissions: [
        ORG_TYPE_PERMISSIONS.MANAGE_INFLUENCERS,
        ORG_TYPE_PERMISSIONS.VIEW_INFLUENCERS,
        ORG_TYPE_PERMISSIONS.VIEW_CAMPAIGNS,
      ],
      color: '#f97316', // Orange
      priority: 50,
    },
  ],
  enterprise: [
    {
      name: 'department_head',
      displayName: 'Department Head',
      description: 'Manages department structure and team members',
      permissions: [
        ORG_TYPE_PERMISSIONS.MANAGE_DEPARTMENTS,
        ORG_TYPE_PERMISSIONS.VIEW_DEPARTMENTS,
        ORG_PERMISSIONS.MANAGE_MEMBERS,
        ORG_PERMISSIONS.INVITE_MEMBERS,
        ORG_PERMISSIONS.VIEW_ANALYTICS,
      ],
      color: '#6366f1', // Indigo
      priority: 75,
    },
    {
      name: 'compliance_officer',
      displayName: 'Compliance Officer',
      description: 'Manages compliance policies and auditing',
      permissions: [
        ORG_TYPE_PERMISSIONS.MANAGE_COMPLIANCE,
        ORG_TYPE_PERMISSIONS.VIEW_COMPLIANCE,
        ORG_TYPE_PERMISSIONS.VIEW_AUDIT,
        ORG_TYPE_PERMISSIONS.EXPORT_AUDIT,
        ORG_PERMISSIONS.REVIEW_CONTENT,
      ],
      color: '#dc2626', // Red
      priority: 70,
    },
    {
      name: 'hr_manager',
      displayName: 'HR Manager',
      description: 'Handles human resources and member onboarding',
      permissions: [
        ORG_PERMISSIONS.MANAGE_MEMBERS,
        ORG_PERMISSIONS.INVITE_MEMBERS,
        ORG_PERMISSIONS.REMOVE_MEMBERS,
        ORG_TYPE_PERMISSIONS.VIEW_DEPARTMENTS,
      ],
      color: '#84cc16', // Lime
      priority: 60,
    },
  ],
  network: [
    {
      name: 'channel_manager',
      displayName: 'Channel Manager',
      description: 'Manages network channels and content distribution',
      permissions: [
        ORG_TYPE_PERMISSIONS.MANAGE_CHANNELS,
        ORG_TYPE_PERMISSIONS.VIEW_CHANNELS,
        ORG_PERMISSIONS.PUBLISH_CONTENT,
        ORG_PERMISSIONS.VIEW_ANALYTICS,
      ],
      color: '#0ea5e9', // Sky
      priority: 70,
    },
    {
      name: 'talent_coordinator',
      displayName: 'Talent Coordinator',
      description: 'Coordinates talent and content creators',
      permissions: [
        ORG_TYPE_PERMISSIONS.MANAGE_TALENT,
        ORG_TYPE_PERMISSIONS.VIEW_TALENT,
        ORG_PERMISSIONS.INVITE_MEMBERS,
        ORG_PERMISSIONS.VIEW_ANALYTICS,
      ],
      color: '#a855f7', // Fuchsia
      priority: 65,
    },
  ],
  nonprofit: [
    {
      name: 'program_director',
      displayName: 'Program Director',
      description: 'Directs organizational programs and initiatives',
      permissions: [
        ORG_TYPE_PERMISSIONS.MANAGE_PROGRAMS,
        ORG_PERMISSIONS.PUBLISH_CONTENT,
        ORG_PERMISSIONS.REVIEW_CONTENT,
        ORG_PERMISSIONS.VIEW_ANALYTICS,
        ORG_PERMISSIONS.EXPORT_ANALYTICS,
      ],
      color: '#10b981', // Emerald
      priority: 70,
    },
    {
      name: 'donor_relations',
      displayName: 'Donor Relations',
      description: 'Manages donor relationships and communications',
      permissions: [
        ORG_TYPE_PERMISSIONS.MANAGE_DONORS,
        ORG_TYPE_PERMISSIONS.VIEW_DONORS,
        ORG_TYPE_PERMISSIONS.VIEW_GRANTS,
        ORG_PERMISSIONS.VIEW_ANALYTICS,
      ],
      color: '#f59e0b', // Amber
      priority: 60,
    },
    {
      name: 'volunteer_coordinator',
      displayName: 'Volunteer Coordinator',
      description: 'Coordinates volunteer activities and engagement',
      permissions: [
        ORG_TYPE_PERMISSIONS.MANAGE_VOLUNTEERS,
        ORG_TYPE_PERMISSIONS.VIEW_VOLUNTEERS,
        ORG_PERMISSIONS.INVITE_MEMBERS,
      ],
      color: '#06b6d4', // Cyan
      priority: 50,
    },
  ],
  // Types with no additional roles (use system roles only)
  team: [],
  company: [],
  channel: [],
  business: [],
};

// Default permissions for system roles
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleName, OrgPermission[]> = {
  owner: Object.values(ORG_PERMISSIONS),
  admin: [
    ORG_PERMISSIONS.MANAGE_MEMBERS,
    ORG_PERMISSIONS.INVITE_MEMBERS,
    ORG_PERMISSIONS.REMOVE_MEMBERS,
    ORG_PERMISSIONS.ASSIGN_ROLES,
    ORG_PERMISSIONS.MANAGE_SETTINGS,
    ORG_PERMISSIONS.EDIT_PROFILE,
    ORG_PERMISSIONS.VIEW_BILLING,
    ORG_PERMISSIONS.PUBLISH_CONTENT,
    ORG_PERMISSIONS.REVIEW_CONTENT,
    ORG_PERMISSIONS.DELETE_CONTENT,
    ORG_PERMISSIONS.VIEW_ANALYTICS,
    ORG_PERMISSIONS.EXPORT_ANALYTICS,
  ],
  editor: [
    ORG_PERMISSIONS.PUBLISH_CONTENT,
    ORG_PERMISSIONS.VIEW_ANALYTICS,
  ],
  viewer: [
    ORG_PERMISSIONS.VIEW_ANALYTICS,
  ],
  member: [],
};

// System role display configuration
export const SYSTEM_ROLES: Record<SystemRoleName, { displayName: string; description: string; color: string; priority: number }> = {
  owner: {
    displayName: 'Owner',
    description: 'Full control over the organization',
    color: '#eab308', // Yellow/gold
    priority: 100,
  },
  admin: {
    displayName: 'Admin',
    description: 'Manage members, content, and settings',
    color: '#ef4444', // Red
    priority: 80,
  },
  editor: {
    displayName: 'Editor',
    description: 'Publish and manage content',
    color: '#3b82f6', // Blue
    priority: 60,
  },
  viewer: {
    displayName: 'Viewer',
    description: 'View analytics and content',
    color: '#22c55e', // Green
    priority: 40,
  },
  member: {
    displayName: 'Member',
    description: 'Basic organization membership',
    color: '#6b7280', // Gray
    priority: 20,
  },
};

// Organization role definition
export interface OrganizationRole {
  id: string;
  organizationId: string;
  name: string;
  displayName: string;
  description?: string;
  isSystem: boolean;
  permissions: OrgPermission[];
  priority: number;
  color?: string;
  createdAt: string;
  updatedAt?: string;
}

// Organization member
export interface OrganizationMember {
  id: string;
  organizationId: string;
  user: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  role: OrganizationRole;
  title?: string;
  canPublishOnBehalf: boolean;
  status: 'active' | 'suspended';
  joinedAt: string;
}

// Organization social links
export interface OrganizationSocialLinks {
  twitter?: string;
  instagram?: string;
  youtube?: string;
  tiktok?: string;
  discord?: string;
}

// Organization billing address
export interface OrganizationBillingAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

// Subscription tiers
export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'enterprise';

export const SUBSCRIPTION_TIERS: Record<SubscriptionTier, { name: string; description: string; memberLimit: number; features: string[] }> = {
  free: {
    name: 'Free',
    description: 'For small teams getting started',
    memberLimit: 5,
    features: ['Up to 5 members', 'Basic analytics', 'Community support'],
  },
  starter: {
    name: 'Starter',
    description: 'For growing teams',
    memberLimit: 25,
    features: ['Up to 25 members', 'Advanced analytics', 'Priority support', 'Custom roles'],
  },
  pro: {
    name: 'Pro',
    description: 'For professional teams',
    memberLimit: 100,
    features: ['Up to 100 members', 'Full analytics', 'API access', 'Webhooks', 'Content moderation'],
  },
  enterprise: {
    name: 'Enterprise',
    description: 'For large organizations',
    memberLimit: -1, // Unlimited
    features: ['Unlimited members', 'Custom contracts', 'Dedicated support', 'SLA guarantees', 'SSO'],
  },
};

// Organization billing info
export interface OrganizationBilling {
  id: string;
  organizationId: string;
  subscriptionTier: SubscriptionTier;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  billingEmail?: string;
  billingName?: string;
  billingAddress?: OrganizationBillingAddress;
  paymentMethodLast4?: string;
  paymentMethodBrand?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  cancelAtPeriodEnd: boolean;
  trialEndsAt?: string;
}

// Invite status
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

// Organization invite
export interface OrganizationInvite {
  id: string;
  organizationId: string;
  email?: string;
  invitedUser?: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  role?: OrganizationRole;
  roleName?: string;
  invitedBy: {
    did: string;
    handle: string;
    displayName?: string;
  };
  message?: string;
  status: InviteStatus;
  expiresAt: string;
  createdAt: string;
}

// Content queue status
export type ContentQueueStatus = 'pending' | 'approved' | 'rejected' | 'revision_requested';

// Organization content queue item
export interface OrganizationContentQueueItem {
  id: string;
  organizationId: string;
  video: {
    uri: string;
    thumbnailUrl?: string;
    caption?: string;
    duration?: number;
  };
  submittedBy: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  submittedCaption?: string;
  status: ContentQueueStatus;
  reviewedBy?: {
    did: string;
    handle: string;
    displayName?: string;
  };
  reviewedAt?: string;
  reviewNotes?: string;
  revisionNotes?: string;
  priority: number;
  createdAt: string;
}

// Base organization (minimal info for lists)
export interface OrganizationBase {
  id: string;
  name: string;
  handle?: string;
  displayName?: string;
  type: OrganizationType;
  avatar?: string;
  verified: boolean;
}

// Full organization details
export interface Organization extends OrganizationBase {
  ownerDid: string;
  bio?: string;
  description?: string;
  website?: string;
  bannerImage?: string;
  location?: string;
  category?: string;
  socialLinks?: OrganizationSocialLinks;
  isPublic: boolean;
  memberCount: number;
  followerCount: number;
  videoCount: number;
  requireContentApproval: boolean;
  createdAt: string;
  updatedAt: string;
}

// Organization with user's membership info
export interface OrganizationWithMembership extends OrganizationBase {
  membership: {
    id: string;
    role: OrganizationRole;
    title?: string;
    canPublishOnBehalf: boolean;
    joinedAt: string;
  };
}

// Public organization profile (for /org/@handle page)
export interface OrganizationPublicProfile {
  id: string;
  handle: string;
  displayName: string;
  name: string;
  type: OrganizationType;
  avatar?: string;
  bannerImage?: string;
  bio?: string;
  website?: string;
  location?: string;
  category?: string;
  socialLinks?: OrganizationSocialLinks;
  verified: boolean;
  followerCount: number;
  videoCount: number;
  memberCount: number;
  isFollowing?: boolean; // Current user following this org
  isMember?: boolean; // Current user is a member
  createdAt: string;
}

// Organization activity types
export type OrganizationActivityAction =
  | 'org_created'
  | 'org_updated'
  | 'member_joined'
  | 'member_left'
  | 'member_removed'
  | 'member_suspended'
  | 'role_changed'
  | 'role_created'
  | 'role_updated'
  | 'role_deleted'
  | 'invite_sent'
  | 'invite_accepted'
  | 'invite_revoked'
  | 'content_submitted'
  | 'content_approved'
  | 'content_rejected'
  | 'billing_updated'
  | 'settings_updated';

// Organization activity log entry
export interface OrganizationActivity {
  id: string;
  organizationId: string;
  actor: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  action: OrganizationActivityAction;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

// Video with organization badge info
export interface VideoOrganizationBadge {
  organizationId: string;
  organizationHandle: string;
  organizationName: string;
  organizationAvatar?: string;
  organizationVerified: boolean;
}

// API request/response types

export interface CreateOrganizationRequest {
  name: string;
  handle?: string;
  type: OrganizationType;
  bio?: string;
  avatar?: string;
  isPublic?: boolean;
}

export interface UpdateOrganizationRequest {
  name?: string;
  handle?: string;
  displayName?: string;
  bio?: string;
  description?: string;
  avatar?: string;
  bannerImage?: string;
  website?: string;
  location?: string;
  category?: string;
  socialLinks?: Partial<OrganizationSocialLinks>;
  isPublic?: boolean;
  requireContentApproval?: boolean;
}

export interface CreateRoleRequest {
  organizationId: string;
  name: string;
  displayName: string;
  description?: string;
  permissions: OrgPermission[];
  color?: string;
}

export interface UpdateRoleRequest {
  displayName?: string;
  description?: string;
  permissions?: OrgPermission[];
  color?: string;
}

export interface CreateInviteRequest {
  organizationId: string;
  email?: string;
  did?: string;
  roleId?: string;
  roleName?: string;
  message?: string;
}

export interface UpdateMemberRequest {
  roleId?: string;
  title?: string;
  canPublishOnBehalf?: boolean;
}

export interface ReviewContentRequest {
  queueId: string;
  action: 'approve' | 'reject' | 'request_revision';
  notes?: string;
}

// Analytics types
export interface OrganizationAnalyticsOverview {
  period: string;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  followerGrowth: number;
  videoCount: number;
  topVideos: Array<{
    uri: string;
    thumbnailUrl?: string;
    caption?: string;
    views: number;
    likes: number;
  }>;
  viewsByDay: Array<{
    date: string;
    views: number;
  }>;
}

export interface OrganizationMemberAnalytics {
  memberId: string;
  user: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  videosPublished: number;
  totalViews: number;
  totalLikes: number;
  lastActivityAt?: string;
}

// ============================================
// Organization Type Configuration
// ============================================

// Handle validation rules
export interface HandleValidationRules {
  minLength: number;
  maxLength: number;
  allowedChars: string;
  reservedPrefixes?: string[];
}

// Content policies configuration
export interface OrgContentPolicies {
  requireApproval: boolean;
  approvalWorkflow?: string;
  autoModerationLevel?: 'none' | 'low' | 'medium' | 'high';
  allowedContentTypes?: string[];
  maxVideoDuration?: number;
}

// Custom field schema definition
export interface OrgCustomFieldSchema {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'date';
  required: boolean;
  options?: string[];
  validation?: { min?: number; max?: number; pattern?: string };
}

// Default role configuration
export interface OrgDefaultRole {
  name: string;
  displayName: string;
  description?: string;
  permissions: string[];
  isDefault?: boolean;
  color: string;
  priority: number;
}

// Subscription tier overrides
export interface OrgSubscriptionOverrides {
  free?: { memberLimit: number; features: string[] };
  starter?: { memberLimit: number; features: string[] };
  pro?: { memberLimit: number; features: string[] };
  enterprise?: { memberLimit: number; features: string[] };
}

// Organization type configuration interface
export interface OrganizationTypeConfig {
  id: OrganizationType;
  displayName: string;
  description?: string;
  icon?: string;

  // PLC Settings
  handleSuffix: string;
  verificationRequired: boolean;
  verificationWorkflow?: VerificationWorkflow;
  customDidServices?: Record<string, { type: string; endpoint: string }>;
  handleValidationRules?: HandleValidationRules;

  // Default Roles
  defaultRoles: OrgDefaultRole[];

  // Features
  enabledFeatures: string[];
  disabledFeatures: string[];

  // Subscription
  subscriptionOverrides?: OrgSubscriptionOverrides;

  // Content Policies
  contentPolicies?: OrgContentPolicies;

  // Custom Fields
  customFieldsSchema?: OrgCustomFieldSchema[];

  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Verification System
// ============================================

// Verification requirement types
export interface VerificationRequirement {
  id: string;
  label: string;
  description: string;
  type: 'document' | 'link' | 'attestation' | 'manual';
  required: boolean;
}

// Type-specific verification requirements
export const VERIFICATION_REQUIREMENTS: Partial<Record<OrganizationType, VerificationRequirement[]>> = {
  label: [
    { id: 'business_registration', label: 'Business Registration', description: 'Legal business entity documentation', type: 'document', required: true },
    { id: 'catalog_proof', label: 'Music Catalog Proof', description: 'Rights documentation for at least one release', type: 'document', required: true },
    { id: 'distributor_link', label: 'Distributor Relationship', description: 'Link to distributor account or agreement', type: 'link', required: false },
  ],
  brand: [
    { id: 'trademark', label: 'Trademark Registration', description: 'Trademark documentation for brand name', type: 'document', required: true },
    { id: 'website', label: 'Official Website', description: 'Link to official brand website', type: 'link', required: true },
    { id: 'social_verification', label: 'Social Media Verification', description: 'Verified social media accounts', type: 'attestation', required: false },
  ],
  enterprise: [
    { id: 'business_registration', label: 'Business Registration', description: 'Corporate registration documents', type: 'document', required: true },
    { id: 'authorized_rep', label: 'Authorized Representative', description: 'Letter from authorized representative', type: 'document', required: true },
    { id: 'domain_verification', label: 'Domain Verification', description: 'Proof of corporate domain ownership', type: 'attestation', required: true },
  ],
  nonprofit: [
    { id: '501c3', label: '501(c)(3) Status', description: 'IRS determination letter or equivalent', type: 'document', required: true },
    { id: 'mission_statement', label: 'Mission Statement', description: 'Official organizational mission', type: 'document', required: true },
  ],
  network: [
    { id: 'business_registration', label: 'Business Registration', description: 'Legal business entity documentation', type: 'document', required: true },
    { id: 'channel_ownership', label: 'Channel Ownership', description: 'Proof of channel ownership or authorization', type: 'document', required: true },
  ],
};

// Verification submission
export interface VerificationSubmission {
  organizationId: string;
  documents: Record<string, { url: string; type: string; uploadedAt: string }>;
  attestations?: Record<string, { confirmed: boolean; confirmedAt: string }>;
  submittedBy: string;
  submittedAt: string;
}

// ============================================
// Type-Specific Data Interfaces
// ============================================

// Label/Music - Artist
export interface LabelArtist {
  id: string;
  memberId?: string;
  stageName: string;
  legalName?: string;
  bio?: string;
  genres: string[];
  avatar?: string;
  socialLinks?: OrganizationSocialLinks;
  contractStatus: 'active' | 'pending' | 'expired' | 'terminated';
  contractStart?: string;
  contractEnd?: string;
  royaltyPercentage?: number;
  ipiNumber?: string; // Interested Parties Information number
}

// Label/Music - Catalog Entry
export interface CatalogEntry {
  id: string;
  organizationId: string;
  artistId: string;
  title: string;
  type: 'single' | 'ep' | 'album' | 'compilation';
  releaseDate?: string;
  isrc?: string;
  upc?: string;
  coverArt?: string;
  tracks: Array<{
    title: string;
    duration: number;
    isrc?: string;
    trackNumber: number;
  }>;
  distributors: string[];
  royaltySplits: Array<{
    recipientId: string;
    recipientType: 'artist' | 'member' | 'external';
    percentage: number;
  }>;
  status: 'draft' | 'pending' | 'released' | 'archived';
}

// Brand - Campaign
export interface BrandCampaign {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  startDate: string;
  endDate?: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
  budget?: number;
  currency?: string;
  targetAudience?: string[];
  hashtags: string[];
  guidelines?: string;
  influencerIds: string[];
  metrics?: {
    impressions: number;
    engagements: number;
    conversions: number;
    spend: number;
  };
}

// Brand - Influencer Connection
export interface InfluencerConnection {
  id: string;
  organizationId: string;
  influencerDid: string;
  influencer?: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    followerCount?: number;
  };
  status: 'pending' | 'active' | 'inactive' | 'terminated';
  tier: 'nano' | 'micro' | 'mid' | 'macro' | 'mega';
  contractType?: 'per_post' | 'retainer' | 'affiliate' | 'ambassador';
  rate?: number;
  currency?: string;
  campaigns: string[];
  notes?: string;
}

// Enterprise - Department
export interface EnterpriseDepartment {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  parentId?: string;
  headUserDid?: string;
  head?: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  memberCount: number;
  budget?: number;
  costCenter?: string;
  children?: EnterpriseDepartment[];
}

// Enterprise - Compliance Setting
export interface ComplianceSetting {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: 'policy' | 'requirement' | 'restriction';
  category: string;
  value: unknown;
  enforcementLevel: 'advisory' | 'warning' | 'blocking';
  appliesTo: string[]; // Department IDs or 'all'
  effectiveDate?: string;
  expirationDate?: string;
}

// Network - Channel
export interface NetworkChannel {
  id: string;
  organizationId: string;
  name: string;
  handle?: string;
  description?: string;
  avatar?: string;
  bannerImage?: string;
  managerId?: string;
  manager?: {
    did: string;
    handle: string;
    displayName?: string;
  };
  status: 'active' | 'inactive' | 'pending';
  followerCount: number;
  videoCount: number;
  category?: string;
}

// Network - Talent
export interface NetworkTalent {
  id: string;
  organizationId: string;
  userDid: string;
  user?: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    followerCount?: number;
  };
  contractStatus: 'active' | 'pending' | 'expired' | 'terminated';
  tier: 'emerging' | 'established' | 'featured' | 'exclusive';
  channelIds: string[];
  exclusivityLevel?: 'none' | 'partial' | 'full';
  notes?: string;
}

// Nonprofit - Donor
export interface NonprofitDonor {
  id: string;
  organizationId: string;
  userDid?: string;
  user?: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  externalName?: string;
  externalEmail?: string;
  donationType: 'one_time' | 'recurring' | 'major' | 'corporate';
  totalDonated: number;
  currency: string;
  firstDonationAt?: string;
  lastDonationAt?: string;
  status: 'active' | 'lapsed' | 'major_donor';
  isAnonymous: boolean;
  notes?: string;
}

// Nonprofit - Grant
export interface NonprofitGrant {
  id: string;
  organizationId: string;
  name: string;
  grantorName: string;
  description?: string;
  amount: number;
  currency: string;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'completed';
  applicationDeadline?: string;
  submittedAt?: string;
  decisionDate?: string;
  startDate?: string;
  endDate?: string;
  requirements?: string[];
  reportingSchedule?: string;
  notes?: string;
}

// Nonprofit - Volunteer
export interface NonprofitVolunteer {
  id: string;
  organizationId: string;
  userDid?: string;
  user?: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  externalName?: string;
  externalEmail?: string;
  status: 'active' | 'inactive' | 'pending';
  skills: string[];
  availability?: string;
  totalHours: number;
  programs: string[];
  startDate?: string;
  notes?: string;
}
