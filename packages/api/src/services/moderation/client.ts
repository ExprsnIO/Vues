/**
 * Moderation Service Client
 *
 * Client for communicating with the Exprsn Moderator service.
 * Supports content moderation, queue management, appeals, and rules.
 */

export interface ModerationContent {
  contentType: 'text' | 'image' | 'video' | 'audio' | 'post' | 'comment' | 'message' | 'profile';
  contentId: string;
  sourceService: 'timeline' | 'spark' | 'gallery' | 'live' | 'filevault';
  userId: string;
  contentText?: string;
  contentUrl?: string;
  contentMetadata?: Record<string, unknown>;
  aiProvider?: 'claude' | 'openai' | 'deepseek';
}

export interface ModerationResult {
  id: string;
  contentId: string;
  contentType: string;
  riskScore: number;
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  toxicityScore: number;
  nsfwScore: number;
  spamScore: number;
  violenceScore: number;
  hateSpeechScore: number;
  status: 'pending' | 'approved' | 'rejected' | 'flagged' | 'reviewing' | 'appealed' | 'escalated';
  action: 'auto_approve' | 'approve' | 'reject' | 'hide' | 'remove' | 'warn' | 'flag' | 'escalate' | 'require_review';
  requiresReview: boolean;
  aiProvider: string;
  aiModel: string;
  processedAt: string;
}

export interface QueueItem {
  id: string;
  moderationItemId: string;
  priority: number;
  escalated: boolean;
  escalatedReason?: string;
  status: 'pending' | 'in_progress' | 'approved' | 'rejected';
  assignedTo?: string;
  queuedAt: string;
  completedAt?: string;
  content: {
    id: string;
    type: string;
    text?: string;
    url?: string;
    riskScore: number;
    riskLevel: string;
    userId: string;
  };
}

export interface Appeal {
  id: string;
  userId: string;
  moderationItemId?: string;
  userActionId?: string;
  reason: string;
  additionalInfo?: Record<string, unknown>;
  status: 'pending' | 'reviewing' | 'approved' | 'denied';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  submittedAt: string;
}

export interface ModerationRule {
  id: string;
  name: string;
  description?: string;
  appliesTo: string[];
  sourceServices: string[];
  conditions: Record<string, unknown>;
  thresholdScore?: number;
  action: string;
  enabled: boolean;
  priority: number;
}

export interface Report {
  id: string;
  userId: string;
  contentType: string;
  contentId: string;
  reason: 'spam' | 'harassment' | 'hate_speech' | 'violence' | 'nsfw' | 'misinformation' | 'copyright' | 'impersonation' | 'other';
  description?: string;
  evidence?: Record<string, unknown>;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed' | 'escalated';
  investigatedBy?: string;
  createdAt: string;
  resolvedAt?: string;
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

export interface AIAgent {
  id: string;
  name: string;
  type: string;
  provider: 'claude' | 'openai' | 'deepseek' | 'local';
  model: string;
  appliesTo: string[];
  priority: number;
  config: Record<string, unknown>;
  thresholdScores: Record<string, number>;
  enabled: boolean;
  status: string;
}

export class ModerationClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: { baseUrl?: string; apiKey?: string } = {}) {
    this.baseUrl = config.baseUrl || process.env.MODERATOR_URL || 'http://localhost:3007';
    this.apiKey = config.apiKey || process.env.MODERATOR_API_KEY;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  // ============================================
  // Content Moderation
  // ============================================

  async moderateContent(content: ModerationContent): Promise<ModerationResult> {
    return this.request('POST', '/api/moderate/content', content);
  }

  async getContentStatus(
    sourceService: string,
    contentType: string,
    contentId: string
  ): Promise<ModerationResult | null> {
    try {
      return await this.request('GET', `/api/moderate/status/${sourceService}/${contentType}/${contentId}`);
    } catch {
      return null;
    }
  }

  async batchModerate(items: ModerationContent[]): Promise<ModerationResult[]> {
    const response = await this.request<{ results: ModerationResult[] }>('POST', '/api/moderate/batch', { items });
    return response.results;
  }

  // ============================================
  // Review Queue
  // ============================================

  async getQueue(options: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ items: QueueItem[]; total: number }> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));

    return this.request('GET', `/api/queue/pending?${params}`);
  }

  async approveContent(itemId: string, moderatorId: string, notes?: string): Promise<ModerationResult> {
    return this.request('POST', `/api/queue/${itemId}/approve`, { moderatorId, notes });
  }

  async rejectContent(itemId: string, moderatorId: string, notes?: string): Promise<ModerationResult> {
    return this.request('POST', `/api/queue/${itemId}/reject`, { moderatorId, notes });
  }

  async assignToModerator(queueId: string, moderatorId: string): Promise<QueueItem> {
    return this.request('POST', `/api/queue/${queueId}/assign`, { moderatorId });
  }

  async escalateItem(queueId: string, reason: string): Promise<QueueItem> {
    return this.request('POST', `/api/queue/${queueId}/escalate`, { reason });
  }

  async getQueueStats(): Promise<{ pending: number; escalated: number; inProgress: number }> {
    return this.request('GET', '/api/queue/stats');
  }

  // ============================================
  // Appeals
  // ============================================

  async getAppeals(options: {
    status?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ appeals: Appeal[]; total: number }> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.userId) params.set('userId', options.userId);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));

    return this.request('GET', `/api/appeals?${params}`);
  }

  async getAppeal(appealId: string): Promise<Appeal> {
    return this.request('GET', `/api/appeals/${appealId}`);
  }

  async approveAppeal(appealId: string, reviewerId: string, notes?: string): Promise<Appeal> {
    return this.request('POST', `/api/appeals/${appealId}/approve`, { reviewerId, notes });
  }

  async denyAppeal(appealId: string, reviewerId: string, notes?: string): Promise<Appeal> {
    return this.request('POST', `/api/appeals/${appealId}/deny`, { reviewerId, notes });
  }

  // ============================================
  // Rules
  // ============================================

  async getRules(options: {
    enabled?: boolean;
    appliesTo?: string;
    limit?: number;
  } = {}): Promise<{ rules: ModerationRule[] }> {
    const params = new URLSearchParams();
    if (options.enabled !== undefined) params.set('enabled', String(options.enabled));
    if (options.appliesTo) params.set('appliesTo', options.appliesTo);
    if (options.limit) params.set('limit', String(options.limit));

    return this.request('GET', `/api/rules?${params}`);
  }

  async createRule(rule: Omit<ModerationRule, 'id'>): Promise<ModerationRule> {
    return this.request('POST', '/api/rules', rule);
  }

  async updateRule(ruleId: string, updates: Partial<ModerationRule>): Promise<ModerationRule> {
    return this.request('PUT', `/api/rules/${ruleId}`, updates);
  }

  async deleteRule(ruleId: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/api/rules/${ruleId}`);
  }

  // ============================================
  // Reports
  // ============================================

  async getReports(options: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ reports: Report[]; total: number }> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));

    return this.request('GET', `/api/reports?${params}`);
  }

  async getReport(reportId: string): Promise<Report> {
    return this.request('GET', `/api/reports/${reportId}`);
  }

  async resolveReport(reportId: string, resolution: {
    action: 'dismiss' | 'warn' | 'remove' | 'ban';
    notes?: string;
    investigatorId: string;
  }): Promise<Report> {
    return this.request('POST', `/api/reports/${reportId}/resolve`, resolution);
  }

  // ============================================
  // User Actions
  // ============================================

  async warnUser(userId: string, reason: string, expiresIn?: number): Promise<{ id: string }> {
    return this.request('POST', '/api/actions/warn', { userId, reason, expiresIn });
  }

  async suspendUser(userId: string, duration: number, reason: string): Promise<{ id: string }> {
    return this.request('POST', '/api/actions/suspend', { userId, duration, reason });
  }

  async banUser(userId: string, reason: string, permanent?: boolean): Promise<{ id: string }> {
    return this.request('POST', '/api/actions/ban', { userId, reason, permanent });
  }

  async restrictUser(userId: string, type: string, duration: number): Promise<{ id: string }> {
    return this.request('POST', '/api/actions/restrict', { userId, type, duration });
  }

  // ============================================
  // Stats & Metrics
  // ============================================

  async getStats(): Promise<ModerationStats> {
    const [overview, queue, agents] = await Promise.all([
      this.request<ModerationStats['overview']>('GET', '/api/metrics/overview'),
      this.request<ModerationStats['queue']>('GET', '/api/metrics/queue'),
      this.request<{ agents: ModerationStats['aiProviders'] }>('GET', '/api/metrics/agents'),
    ]);

    return {
      overview,
      queue,
      riskDistribution: { safe: 0, low: 0, medium: 0, high: 0, critical: 0 },
      aiProviders: agents.agents || [],
    };
  }

  // ============================================
  // AI Agents Configuration
  // ============================================

  async getAgents(): Promise<{ agents: AIAgent[] }> {
    return this.request('GET', '/api/setup/agents');
  }

  async createAgent(agent: Omit<AIAgent, 'id' | 'status'>): Promise<AIAgent> {
    return this.request('POST', '/api/setup/agents', agent);
  }

  async updateAgent(agentId: string, updates: Partial<AIAgent>): Promise<AIAgent> {
    return this.request('PUT', `/api/setup/agents/${agentId}`, updates);
  }

  async toggleAgent(agentId: string, enabled: boolean): Promise<AIAgent> {
    return this.request('PUT', `/api/setup/agents/${agentId}`, { enabled });
  }

  // ============================================
  // System Health
  // ============================================

  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: {
      database: boolean;
      redis: boolean;
      aiProviders: { claude: boolean; openai: boolean; deepseek: boolean };
    };
  }> {
    return this.request('GET', '/api/setup/status');
  }
}

// Singleton instance
let moderationClient: ModerationClient | null = null;

export function getModerationClient(): ModerationClient {
  if (!moderationClient) {
    moderationClient = new ModerationClient();
  }
  return moderationClient;
}

export function initializeModerationClient(config: { baseUrl?: string; apiKey?: string }): ModerationClient {
  moderationClient = new ModerationClient(config);
  return moderationClient;
}
