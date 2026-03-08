/**
 * Social Services
 * Services for social features including mentions and hashtags
 */

export {
  MentionService,
  createMentionService,
  type ParsedMention,
  type ResolvedMention,
  type MentionSuggestion,
  type MentionServiceConfig,
} from './MentionService.js';

export {
  HashtagService,
  createHashtagService,
  type ParsedHashtag,
  type TrendingHashtag,
  type HashtagDetails,
  type HashtagServiceConfig,
} from './HashtagService.js';
