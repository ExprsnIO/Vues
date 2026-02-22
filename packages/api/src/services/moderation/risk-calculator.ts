/**
 * Risk Calculator
 * Calculates overall risk scores and determines actions
 */

import type { ModerationScores, RiskLevel, ModerationActionType } from './types.js';

// Weights for different score types
const SCORE_WEIGHTS = {
  toxicity: 0.25,
  nsfw: 0.20,
  spam: 0.15,
  violence: 0.25,
  hateSpeech: 0.15,
};

// Risk level thresholds
const RISK_THRESHOLDS = {
  safe: 20,
  low: 40,
  medium: 60,
  high: 80,
  critical: 100,
};

// Action thresholds
const ACTION_THRESHOLDS = {
  auto_approve: 20,
  flag: 40,
  require_review: 60,
  hide: 75,
  reject: 85,
};

/**
 * Calculate overall risk score from individual scores
 */
export function calculateOverallRisk(scores: ModerationScores): number {
  const weightedSum =
    (scores.toxicity * SCORE_WEIGHTS.toxicity) +
    (scores.nsfw * SCORE_WEIGHTS.nsfw) +
    (scores.spam * SCORE_WEIGHTS.spam) +
    (scores.violence * SCORE_WEIGHTS.violence) +
    (scores.hateSpeech * SCORE_WEIGHTS.hateSpeech);

  // Also consider the maximum individual score
  const maxScore = Math.max(
    scores.toxicity,
    scores.nsfw,
    scores.spam,
    scores.violence,
    scores.hateSpeech
  );

  // Final score is weighted average with max score influence
  const finalScore = (weightedSum * 0.7) + (maxScore * 0.3);

  return Math.round(Math.min(100, Math.max(0, finalScore)));
}

/**
 * Get risk level from score
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score < RISK_THRESHOLDS.safe) return 'safe';
  if (score < RISK_THRESHOLDS.low) return 'low';
  if (score < RISK_THRESHOLDS.medium) return 'medium';
  if (score < RISK_THRESHOLDS.high) return 'high';
  return 'critical';
}

/**
 * Determine if manual review is required
 */
export function requiresManualReview(
  riskScore: number,
  scores: ModerationScores
): boolean {
  // Review required for medium+ risk
  if (riskScore >= ACTION_THRESHOLDS.require_review) {
    return true;
  }

  // Review required if any individual score is high
  const highThreshold = 70;
  if (
    scores.toxicity >= highThreshold ||
    scores.violence >= highThreshold ||
    scores.hateSpeech >= highThreshold
  ) {
    return true;
  }

  return false;
}

/**
 * Determine action based on risk score
 */
export function determineAction(
  riskScore: number,
  options: { requiresReview?: boolean } = {}
): ModerationActionType {
  if (options.requiresReview) {
    return 'require_review';
  }

  if (riskScore < ACTION_THRESHOLDS.auto_approve) {
    return 'auto_approve';
  }

  if (riskScore < ACTION_THRESHOLDS.flag) {
    return 'approve';
  }

  if (riskScore < ACTION_THRESHOLDS.require_review) {
    return 'flag';
  }

  if (riskScore < ACTION_THRESHOLDS.hide) {
    return 'require_review';
  }

  if (riskScore < ACTION_THRESHOLDS.reject) {
    return 'hide';
  }

  return 'reject';
}

/**
 * Calculate queue priority (higher = more urgent)
 */
export function calculatePriority(
  riskScore: number,
  options: { hasReports?: boolean; isEscalated?: boolean } = {}
): number {
  let priority = Math.round(riskScore / 10); // Base priority 0-10

  if (options.hasReports) {
    priority += 3;
  }

  if (options.isEscalated) {
    priority += 5;
  }

  return Math.min(15, priority); // Cap at 15
}

/**
 * Get status from action
 */
export function getStatusFromAction(action: ModerationActionType): string {
  const statusMap: Record<ModerationActionType, string> = {
    auto_approve: 'approved',
    approve: 'approved',
    reject: 'rejected',
    hide: 'flagged',
    remove: 'rejected',
    warn: 'flagged',
    flag: 'flagged',
    escalate: 'escalated',
    require_review: 'reviewing',
  };

  return statusMap[action] || 'pending';
}
