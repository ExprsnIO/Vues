/**
 * Moderation Service Types
 */

export type ContentType = 'text' | 'image' | 'video' | 'audio' | 'post' | 'comment' | 'message' | 'profile';
export type SourceService = 'timeline' | 'spark' | 'gallery' | 'live' | 'filevault';
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';
export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'flagged' | 'reviewing' | 'appealed' | 'escalated';
export type ModerationActionType = 'auto_approve' | 'approve' | 'reject' | 'hide' | 'remove' | 'warn' | 'flag' | 'escalate' | 'require_review';
export type AIProvider = 'claude' | 'openai' | 'deepseek' | 'local';
export type ReportReason = 'spam' | 'harassment' | 'hate_speech' | 'violence' | 'nsfw' | 'misinformation' | 'copyright' | 'impersonation' | 'other';
export type UserActionType = 'warn' | 'mute' | 'restrict' | 'suspend' | 'ban';

export interface ModerationScores {
  toxicity: number;
  nsfw: number;
  spam: number;
  violence: number;
  hateSpeech: number;
}

export interface ModerationContent {
  contentType: ContentType;
  contentId: string;
  sourceService: SourceService;
  userId: string;
  contentText?: string;
  contentUrl?: string;
  contentMetadata?: Record<string, unknown>;
  aiProvider?: AIProvider;
}

export interface ModerationResult {
  id: string;
  contentId: string;
  contentType: string;
  status: ModerationStatus;
  action: ModerationActionType | null;
  riskScore: number;
  riskLevel: RiskLevel;
  scores: ModerationScores;
  requiresReview: boolean;
  aiProvider: string | null;
  aiModel: string | null;
  approved: boolean;
  rejected: boolean;
  pending: boolean;
  processedAt: Date | null;
}

export interface AIAnalysisResult {
  provider: AIProvider;
  model: string;
  riskScore: number;
  toxicityScore: number;
  nsfwScore: number;
  spamScore: number;
  violenceScore: number;
  hateSpeechScore: number;
  explanation?: string;
  categories?: string[];
  rawResponse?: Record<string, unknown>;
}

export interface QueueItem {
  id: string;
  moderationItemId: string;
  priority: number;
  escalated: boolean;
  escalatedReason: string | null;
  status: string;
  assignedTo: string | null;
  queuedAt: Date;
  content: {
    id: string;
    type: string;
    text: string | null;
    url: string | null;
    riskScore: number;
    riskLevel: string;
    userId: string;
  };
}

export interface ModerationStats {
  overview: {
    totalModerated: number;
    autoApproved: number;
    autoRejected: number;
    manuallyReviewed: number;
    pendingReview: number;
    appealed: number;
  };
  queue: {
    pending: number;
    escalated: number;
    avgWaitTime: number;
  };
  riskDistribution: {
    safe: number;
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  aiProviders: {
    provider: string;
    requests: number;
    avgResponseTime: number;
    successRate: number;
  }[];
}
