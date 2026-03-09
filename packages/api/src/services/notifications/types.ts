export type NotificationType = 'email' | 'webhook';

export type NotificationEvent =
  | 'render.started'
  | 'render.progress'
  | 'render.complete'
  | 'render.failed'
  | 'batch.complete'
  | 'quota.warning'
  | 'quota.exceeded'
  // User engagement events
  | 'user.welcome'
  | 'user.follow'
  | 'video.like'
  | 'video.comment'
  | 'auth.password_reset'
  | 'org.invite';

export interface NotificationPayload {
  event: NotificationEvent;
  userDid: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface RenderCompletePayload extends NotificationPayload {
  event: 'render.complete';
  data: {
    jobId: string;
    projectId: string;
    projectName?: string;
    outputUrl: string;
    outputKey: string;
    fileSize: number;
    duration: number;
    format: string;
    quality: string;
    resolution: { width: number; height: number };
  };
}

export interface RenderFailedPayload extends NotificationPayload {
  event: 'render.failed';
  data: {
    jobId: string;
    projectId: string;
    projectName?: string;
    errorMessage: string;
    errorDetails?: Record<string, unknown>;
    retryUrl?: string;
  };
}

// User engagement payloads
export interface WelcomePayload extends NotificationPayload {
  event: 'user.welcome';
  data: {
    handle: string;
    displayName?: string;
    email: string;
  };
}

export interface FollowPayload extends NotificationPayload {
  event: 'user.follow';
  data: {
    followerDid: string;
    followerHandle: string;
    followerDisplayName?: string;
    followerAvatar?: string;
  };
}

export interface VideoLikePayload extends NotificationPayload {
  event: 'video.like';
  data: {
    videoUri: string;
    videoTitle?: string;
    videoThumbnail?: string;
    likerDid: string;
    likerHandle: string;
    likerDisplayName?: string;
    likerAvatar?: string;
    totalLikes: number;
  };
}

export interface VideoCommentPayload extends NotificationPayload {
  event: 'video.comment';
  data: {
    videoUri: string;
    videoTitle?: string;
    videoThumbnail?: string;
    commentUri: string;
    commentText: string;
    commenterDid: string;
    commenterHandle: string;
    commenterDisplayName?: string;
    commenterAvatar?: string;
  };
}

export interface PasswordResetPayload extends NotificationPayload {
  event: 'auth.password_reset';
  data: {
    resetToken: string;
    resetUrl: string;
    expiresAt: string;
  };
}

export interface OrgInvitePayload extends NotificationPayload {
  event: 'org.invite';
  data: {
    organizationId: string;
    organizationName: string;
    organizationLogo?: string;
    inviterDid: string;
    inviterHandle: string;
    inviterDisplayName?: string;
    role: string;
    inviteToken: string;
    acceptUrl: string;
    expiresAt: string;
  };
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  duration: number;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface NotificationResult {
  type: NotificationType;
  success: boolean;
  error?: string;
  details?: Record<string, unknown>;
}
