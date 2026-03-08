/**
 * Domain Services
 * Services for multi-domain administration
 */

export {
  BrandingService,
  createBrandingService,
  type DomainBranding,
  type ThemePreset,
} from './BrandingService.js';

export {
  FeatureFlagsService,
  createFeatureFlagsService,
  type FeatureFlag,
  type DomainFeatureOverride,
  type FeatureEvaluation,
} from './FeatureFlagsService.js';

export {
  RBACService,
  createRBACService,
  type Permission,
  type Role,
  type UserRole,
  type Group,
  type GroupMembership,
} from './RBACService.js';

export {
  AnalyticsService,
  createAnalyticsService,
  type AnalyticsPeriod,
  type DomainOverview,
  type UserMetrics,
  type ContentMetrics,
  type EngagementMetrics,
  type GrowthMetrics,
  type ModerationMetrics,
  type TimeSeriesPoint,
} from './AnalyticsService.js';

export {
  ServiceHealthService,
  createServiceHealthService,
  type ServiceType,
  type ServiceStatus,
  type Service,
  type HealthCheckResult,
  type ServiceMetrics,
  type FailoverConfig,
} from './ServiceHealthService.js';
