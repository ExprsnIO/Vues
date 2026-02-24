import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { organizations, organizationMembers, organizationTypeConfigs } from '../db/schema.js';
import { authMiddleware } from '../auth/middleware.js';
import {
  OrganizationVerificationService,
  LabelFeatureService,
  BrandFeatureService,
  EnterpriseFeatureService,
} from '../services/organization/index.js';
import type { OrganizationType, OrgTypeFeature } from '@exprsn/shared';
import { DEFAULT_TYPE_FEATURES, ORG_TYPE_PERMISSIONS } from '@exprsn/shared';

export const orgFeaturesRoutes = new Hono();

// ============================================
// Helper Functions
// ============================================

/**
 * Check if user has permission for organization
 */
async function checkOrgPermission(
  userDid: string,
  organizationId: string,
  requiredPermission?: string
): Promise<{ member: typeof organizationMembers.$inferSelect; org: typeof organizations.$inferSelect } | null> {
  const org = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org[0]) return null;

  // Check if user is owner
  if (org[0].ownerDid === userDid) {
    const member = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userDid, userDid)
        )
      )
      .limit(1);

    return { member: member[0], org: org[0] };
  }

  // Check member and permissions
  const member = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userDid, userDid),
        eq(organizationMembers.status, 'active')
      )
    )
    .limit(1);

  if (!member[0]) return null;

  // Check required permission
  if (requiredPermission) {
    const permissions = (member[0].permissions as string[]) || [];
    if (!permissions.includes(requiredPermission)) {
      return null;
    }
  }

  return { member: member[0], org: org[0] };
}

/**
 * Check if organization type supports a feature
 */
async function checkOrgTypeFeature(
  organizationId: string,
  feature: string
): Promise<void> {
  const org = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org[0]) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  const orgType = org[0].type as OrganizationType;

  // Check database config first
  const typeConfig = await db
    .select()
    .from(organizationTypeConfigs)
    .where(eq(organizationTypeConfigs.id, orgType))
    .limit(1);

  let enabledFeatures: string[] = [];
  let disabledFeatures: string[] = [];

  if (typeConfig[0]) {
    enabledFeatures = (typeConfig[0].enabledFeatures as string[]) || [];
    disabledFeatures = (typeConfig[0].disabledFeatures as string[]) || [];
  }

  // Check if explicitly disabled
  if (disabledFeatures.includes(feature)) {
    throw new HTTPException(400, {
      message: `Feature '${feature}' is not available for ${orgType} organizations`,
    });
  }

  // Check if enabled (either explicitly or by default)
  const defaultFeatures = DEFAULT_TYPE_FEATURES[orgType] || [];
  if (!enabledFeatures.includes(feature) && !defaultFeatures.includes(feature as OrgTypeFeature)) {
    throw new HTTPException(400, {
      message: `Feature '${feature}' is not available for ${orgType} organizations`,
    });
  }
}

// ============================================
// Verification Endpoints
// ============================================

// Get verification requirements
orgFeaturesRoutes.get('/io.exprsn.org.verification.requirements', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');
  if (!organizationId) {
    throw new HTTPException(400, { message: 'organizationId is required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId);
  if (!access) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const requirements = await OrganizationVerificationService.getRequirements(
    access.org.type as OrganizationType
  );

  return c.json({ requirements });
});

// Get verification status
orgFeaturesRoutes.get('/io.exprsn.org.verification.status', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');
  if (!organizationId) {
    throw new HTTPException(400, { message: 'organizationId is required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId);
  if (!access) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const status = await OrganizationVerificationService.getVerificationStatus(organizationId);
  return c.json(status);
});

// Submit for verification
orgFeaturesRoutes.post('/io.exprsn.org.verification.submit', authMiddleware, async (c) => {
  const body = await c.req.json();
  const { organizationId, documents, attestations, notes } = body;

  if (!organizationId || !documents) {
    throw new HTTPException(400, { message: 'organizationId and documents are required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, 'org.settings.manage');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await OrganizationVerificationService.submitForVerification({
    organizationId,
    submittedBy: c.get('did'),
    documents,
    attestations,
    notes,
  });

  return c.json({ success: true });
});

// ============================================
// Label/Music Endpoints
// ============================================

// List artists
orgFeaturesRoutes.get('/io.exprsn.org.label.artists.list', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');
  if (!organizationId) {
    throw new HTTPException(400, { message: 'organizationId is required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.VIEW_ARTISTS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'artist_management');

  const status = c.req.query('status') as 'active' | 'pending' | 'expired' | 'terminated' | undefined;
  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');

  const artists = await LabelFeatureService.getArtists(organizationId, { status, limit, offset });
  return c.json({ artists });
});

// Get artist
orgFeaturesRoutes.get('/io.exprsn.org.label.artists.get', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');
  const artistId = c.req.query('artistId');

  if (!organizationId || !artistId) {
    throw new HTTPException(400, { message: 'organizationId and artistId are required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.VIEW_ARTISTS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'artist_management');

  const artist = await LabelFeatureService.getArtist(organizationId, artistId);
  if (!artist) {
    throw new HTTPException(404, { message: 'Artist not found' });
  }

  return c.json({ artist });
});

// Add artist
orgFeaturesRoutes.post('/io.exprsn.org.label.artists.add', authMiddleware, async (c) => {
  const body = await c.req.json();
  const { organizationId, ...artistData } = body;

  if (!organizationId || !artistData.stageName) {
    throw new HTTPException(400, { message: 'organizationId and stageName are required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.MANAGE_ARTISTS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'artist_management');

  const artist = await LabelFeatureService.addArtist(organizationId, artistData, c.get('did'));
  return c.json({ artist });
});

// Update artist
orgFeaturesRoutes.post('/io.exprsn.org.label.artists.update', authMiddleware, async (c) => {
  const body = await c.req.json();
  const { organizationId, artistId, ...updates } = body;

  if (!organizationId || !artistId) {
    throw new HTTPException(400, { message: 'organizationId and artistId are required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.MANAGE_ARTISTS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'artist_management');

  const artist = await LabelFeatureService.updateArtist(organizationId, artistId, updates, c.get('did'));
  return c.json({ artist });
});

// Remove artist
orgFeaturesRoutes.post('/io.exprsn.org.label.artists.remove', authMiddleware, async (c) => {
  const body = await c.req.json();
  const { organizationId, artistId } = body;

  if (!organizationId || !artistId) {
    throw new HTTPException(400, { message: 'organizationId and artistId are required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.MANAGE_ARTISTS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'artist_management');

  await LabelFeatureService.removeArtist(organizationId, artistId, c.get('did'));
  return c.json({ success: true });
});

// List catalog
orgFeaturesRoutes.get('/io.exprsn.org.label.catalog.list', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');
  if (!organizationId) {
    throw new HTTPException(400, { message: 'organizationId is required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.VIEW_CATALOG);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'catalog_management');

  const artistId = c.req.query('artistId');
  const type = c.req.query('type') as 'single' | 'ep' | 'album' | 'compilation' | undefined;
  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');

  const entries = await LabelFeatureService.getCatalog(organizationId, { artistId, type, limit, offset });
  return c.json({ entries });
});

// Add catalog entry
orgFeaturesRoutes.post('/io.exprsn.org.label.catalog.add', authMiddleware, async (c) => {
  const body = await c.req.json();
  const { organizationId, ...entryData } = body;

  if (!organizationId || !entryData.title || !entryData.artistId) {
    throw new HTTPException(400, { message: 'organizationId, title, and artistId are required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.MANAGE_CATALOG);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'catalog_management');

  const entry = await LabelFeatureService.addCatalogEntry(organizationId, entryData, c.get('did'));
  return c.json({ entry });
});

// Get label stats
orgFeaturesRoutes.get('/io.exprsn.org.label.stats', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');
  if (!organizationId) {
    throw new HTTPException(400, { message: 'organizationId is required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.VIEW_ARTISTS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  const stats = await LabelFeatureService.getLabelStats(organizationId);
  return c.json({ stats });
});

// ============================================
// Brand Endpoints
// ============================================

// List campaigns
orgFeaturesRoutes.get('/io.exprsn.org.brand.campaigns.list', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');
  if (!organizationId) {
    throw new HTTPException(400, { message: 'organizationId is required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.VIEW_CAMPAIGNS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'campaign_management');

  const status = c.req.query('status') as 'draft' | 'active' | 'paused' | 'completed' | 'cancelled' | undefined;
  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');

  const campaigns = await BrandFeatureService.getCampaigns(organizationId, { status, limit, offset });
  return c.json({ campaigns });
});

// Create campaign
orgFeaturesRoutes.post('/io.exprsn.org.brand.campaigns.create', authMiddleware, async (c) => {
  const body = await c.req.json();
  const { organizationId, ...campaignData } = body;

  if (!organizationId || !campaignData.name) {
    throw new HTTPException(400, { message: 'organizationId and name are required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.MANAGE_CAMPAIGNS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'campaign_management');

  const campaign = await BrandFeatureService.createCampaign(organizationId, campaignData, c.get('did'));
  return c.json({ campaign });
});

// Update campaign
orgFeaturesRoutes.post('/io.exprsn.org.brand.campaigns.update', authMiddleware, async (c) => {
  const body = await c.req.json();
  const { organizationId, campaignId, ...updates } = body;

  if (!organizationId || !campaignId) {
    throw new HTTPException(400, { message: 'organizationId and campaignId are required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.MANAGE_CAMPAIGNS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'campaign_management');

  const campaign = await BrandFeatureService.updateCampaign(organizationId, campaignId, updates, c.get('did'));
  return c.json({ campaign });
});

// List influencer connections
orgFeaturesRoutes.get('/io.exprsn.org.brand.influencers.list', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');
  if (!organizationId) {
    throw new HTTPException(400, { message: 'organizationId is required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.VIEW_INFLUENCERS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'influencer_connections');

  const status = c.req.query('status') as 'pending' | 'active' | 'inactive' | 'terminated' | undefined;
  const tier = c.req.query('tier') as 'nano' | 'micro' | 'mid' | 'macro' | 'mega' | undefined;
  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');

  const connections = await BrandFeatureService.getInfluencerConnections(organizationId, { status, tier, limit, offset });
  return c.json({ connections });
});

// Connect influencer
orgFeaturesRoutes.post('/io.exprsn.org.brand.influencers.connect', authMiddleware, async (c) => {
  const body = await c.req.json();
  const { organizationId, ...connectionData } = body;

  if (!organizationId || !connectionData.influencerDid) {
    throw new HTTPException(400, { message: 'organizationId and influencerDid are required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.MANAGE_INFLUENCERS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'influencer_connections');

  const connection = await BrandFeatureService.connectInfluencer(organizationId, connectionData, c.get('did'));
  return c.json({ connection });
});

// Get brand stats
orgFeaturesRoutes.get('/io.exprsn.org.brand.stats', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');
  if (!organizationId) {
    throw new HTTPException(400, { message: 'organizationId is required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.VIEW_CAMPAIGNS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  const stats = await BrandFeatureService.getBrandStats(organizationId);
  return c.json({ stats });
});

// ============================================
// Enterprise Endpoints
// ============================================

// Get department hierarchy
orgFeaturesRoutes.get('/io.exprsn.org.enterprise.departments.hierarchy', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');
  if (!organizationId) {
    throw new HTTPException(400, { message: 'organizationId is required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.VIEW_DEPARTMENTS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'department_hierarchy');

  const hierarchy = await EnterpriseFeatureService.getDepartmentHierarchy(organizationId);
  return c.json({ hierarchy });
});

// List departments (flat)
orgFeaturesRoutes.get('/io.exprsn.org.enterprise.departments.list', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');
  if (!organizationId) {
    throw new HTTPException(400, { message: 'organizationId is required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.VIEW_DEPARTMENTS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'department_hierarchy');

  const parentId = c.req.query('parentId') || undefined;
  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');

  const departments = await EnterpriseFeatureService.getDepartments(organizationId, {
    parentId: parentId === 'null' ? null : parentId,
    limit,
    offset,
  });
  return c.json({ departments });
});

// Create department
orgFeaturesRoutes.post('/io.exprsn.org.enterprise.departments.create', authMiddleware, async (c) => {
  const body = await c.req.json();
  const { organizationId, ...deptData } = body;

  if (!organizationId || !deptData.name) {
    throw new HTTPException(400, { message: 'organizationId and name are required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.MANAGE_DEPARTMENTS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'department_hierarchy');

  const department = await EnterpriseFeatureService.createDepartment(organizationId, deptData, c.get('did'));
  return c.json({ department });
});

// Update department
orgFeaturesRoutes.post('/io.exprsn.org.enterprise.departments.update', authMiddleware, async (c) => {
  const body = await c.req.json();
  const { organizationId, departmentId, ...updates } = body;

  if (!organizationId || !departmentId) {
    throw new HTTPException(400, { message: 'organizationId and departmentId are required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.MANAGE_DEPARTMENTS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'department_hierarchy');

  const department = await EnterpriseFeatureService.updateDepartment(organizationId, departmentId, updates, c.get('did'));
  return c.json({ department });
});

// Delete department
orgFeaturesRoutes.post('/io.exprsn.org.enterprise.departments.delete', authMiddleware, async (c) => {
  const body = await c.req.json();
  const { organizationId, departmentId, reassignChildrenTo } = body;

  if (!organizationId || !departmentId) {
    throw new HTTPException(400, { message: 'organizationId and departmentId are required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.MANAGE_DEPARTMENTS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'department_hierarchy');

  await EnterpriseFeatureService.deleteDepartment(organizationId, departmentId, c.get('did'), reassignChildrenTo);
  return c.json({ success: true });
});

// List compliance settings
orgFeaturesRoutes.get('/io.exprsn.org.enterprise.compliance.list', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');
  if (!organizationId) {
    throw new HTTPException(400, { message: 'organizationId is required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.VIEW_COMPLIANCE);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'compliance_settings');

  const category = c.req.query('category');
  const type = c.req.query('type') as 'policy' | 'requirement' | 'restriction' | undefined;
  const departmentId = c.req.query('departmentId');
  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');

  const settings = await EnterpriseFeatureService.getComplianceSettings(organizationId, {
    category,
    type,
    departmentId,
    limit,
    offset,
  });
  return c.json({ settings });
});

// Create compliance setting
orgFeaturesRoutes.post('/io.exprsn.org.enterprise.compliance.create', authMiddleware, async (c) => {
  const body = await c.req.json();
  const { organizationId, ...settingData } = body;

  if (!organizationId || !settingData.name || !settingData.category || !settingData.type) {
    throw new HTTPException(400, { message: 'organizationId, name, category, and type are required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.MANAGE_COMPLIANCE);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'compliance_settings');

  const setting = await EnterpriseFeatureService.createComplianceSetting(organizationId, settingData, c.get('did'));
  return c.json({ setting });
});

// Update compliance setting
orgFeaturesRoutes.post('/io.exprsn.org.enterprise.compliance.update', authMiddleware, async (c) => {
  const body = await c.req.json();
  const { organizationId, settingId, ...updates } = body;

  if (!organizationId || !settingId) {
    throw new HTTPException(400, { message: 'organizationId and settingId are required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.MANAGE_COMPLIANCE);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await checkOrgTypeFeature(organizationId, 'compliance_settings');

  const setting = await EnterpriseFeatureService.updateComplianceSetting(organizationId, settingId, updates, c.get('did'));
  return c.json({ setting });
});

// Get enterprise stats
orgFeaturesRoutes.get('/io.exprsn.org.enterprise.stats', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');
  if (!organizationId) {
    throw new HTTPException(400, { message: 'organizationId is required' });
  }

  const access = await checkOrgPermission(c.get('did'), organizationId, ORG_TYPE_PERMISSIONS.VIEW_DEPARTMENTS);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  const stats = await EnterpriseFeatureService.getEnterpriseStats(organizationId);
  return c.json({ stats });
});

// ============================================
// Type Configuration Endpoints
// ============================================

// Get type configuration
orgFeaturesRoutes.get('/io.exprsn.org.type.config', authMiddleware, async (c) => {
  const orgType = c.req.query('type') as OrganizationType;
  if (!orgType) {
    throw new HTTPException(400, { message: 'type is required' });
  }

  const config = await db
    .select()
    .from(organizationTypeConfigs)
    .where(eq(organizationTypeConfigs.id, orgType))
    .limit(1);

  if (!config[0]) {
    // Return defaults
    return c.json({
      config: {
        id: orgType,
        displayName: orgType.charAt(0).toUpperCase() + orgType.slice(1),
        handleSuffix: 'org.exprsn',
        enabledFeatures: DEFAULT_TYPE_FEATURES[orgType] || [],
        disabledFeatures: [],
        verificationRequired: false,
      },
    });
  }

  return c.json({ config: config[0] });
});

// List all type configurations
orgFeaturesRoutes.get('/io.exprsn.org.type.configs', async (c) => {
  const configs = await db
    .select()
    .from(organizationTypeConfigs)
    .where(eq(organizationTypeConfigs.isActive, true));

  return c.json({ configs });
});

export default orgFeaturesRoutes;
