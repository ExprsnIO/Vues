export type NotificationType = 'email' | 'webhook';

export type NotificationEvent =
  | 'render.started'
  | 'render.progress'
  | 'render.complete'
  | 'render.failed'
  | 'batch.complete'
  | 'quota.warning'
  | 'quota.exceeded';

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
