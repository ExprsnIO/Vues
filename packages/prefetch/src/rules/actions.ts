export type ActionType =
  | 'prefetch_timeline'
  | 'prefetch_video_segments'
  | 'promote_cache_tier'
  | 'increase_ttl'
  | 'skip_prefetch'
  | 'prefetch_profile'
  | 'prefetch_comments'
  | 'batch_prefetch'
  | 'edge_replicate'
  | 'warm_federation';

export interface RuleAction {
  type: ActionType;
  params: Record<string, unknown>;
}

export interface ActionResult {
  type: ActionType;
  success: boolean;
  message?: string;
}

export function getDefaultActionParams(type: ActionType): Record<string, unknown> {
  switch (type) {
    case 'prefetch_timeline': return { limit: 20, priority: 'medium' };
    case 'prefetch_video_segments': return { lookahead: 3, quality: 'auto' };
    case 'promote_cache_tier': return { targetTier: 'hot' };
    case 'increase_ttl': return { multiplier: 2 };
    case 'skip_prefetch': return { reason: 'rule_match' };
    case 'prefetch_profile': return { includeAvatar: true };
    case 'prefetch_comments': return { limit: 10 };
    case 'batch_prefetch': return { batchSize: 50, priority: 'low' };
    case 'edge_replicate': return { regions: ['us-east', 'eu-west'] };
    case 'warm_federation': return { remotePDS: [] };
    default: return {};
  }
}
