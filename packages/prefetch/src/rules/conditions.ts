export type ConditionType =
  | 'user_activity'
  | 'time_since_last'
  | 'follower_count'
  | 'content_type'
  | 'geo_region'
  | 'device_type'
  | 'network_quality'
  | 'engagement_rate'
  | 'time_of_day'
  | 'feed_staleness'
  | 'pds_instance'
  | 'content_language'
  | 'user_tier'
  | 'video_duration';

export type ConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'contains' | 'between';

export interface RuleCondition {
  type: ConditionType;
  operator: ConditionOperator;
  value: string | number | boolean | string[] | number[];
}

export interface EvaluationContext {
  userId?: string;
  userActivity?: number;
  timeSinceLastPrefetch?: number;
  followerCount?: number;
  contentType?: string;
  geoRegion?: string;
  deviceType?: string;
  networkQuality?: 'high' | 'medium' | 'low';
  engagementRate?: number;
  currentHour?: number;
  feedStalenessMs?: number;
  pdsInstance?: string;
  contentLanguage?: string;
  userTier?: 'free' | 'premium' | 'creator';
  videoDuration?: number;
}

export function evaluateCondition(condition: RuleCondition, context: EvaluationContext): boolean {
  const value = getContextValue(condition.type, context);
  if (value === undefined) return false;
  return compareValues(value, condition.operator, condition.value);
}

function getContextValue(type: ConditionType, context: EvaluationContext): unknown {
  const map: Record<ConditionType, unknown> = {
    user_activity: context.userActivity,
    time_since_last: context.timeSinceLastPrefetch,
    follower_count: context.followerCount,
    content_type: context.contentType,
    geo_region: context.geoRegion,
    device_type: context.deviceType,
    network_quality: context.networkQuality,
    engagement_rate: context.engagementRate,
    time_of_day: context.currentHour,
    feed_staleness: context.feedStalenessMs,
    pds_instance: context.pdsInstance,
    content_language: context.contentLanguage,
    user_tier: context.userTier,
    video_duration: context.videoDuration,
  };
  return map[type];
}

function compareValues(actual: unknown, operator: ConditionOperator, expected: unknown): boolean {
  switch (operator) {
    case 'eq': return actual === expected;
    case 'neq': return actual !== expected;
    case 'gt': return (actual as number) > (expected as number);
    case 'gte': return (actual as number) >= (expected as number);
    case 'lt': return (actual as number) < (expected as number);
    case 'lte': return (actual as number) <= (expected as number);
    case 'in': return Array.isArray(expected) && expected.includes(actual);
    case 'not_in': return Array.isArray(expected) && !expected.includes(actual);
    case 'contains': return typeof actual === 'string' && actual.includes(expected as string);
    case 'between': {
      if (!Array.isArray(expected) || expected.length !== 2) return false;
      const num = actual as number;
      return num >= (expected[0] as number) && num <= (expected[1] as number);
    }
    default: return false;
  }
}
