/**
 * Standardized API Error Handling for Exprsn API
 *
 * This module provides a centralized error handling system with:
 * - Standard error response format
 * - Error factory functions for common HTTP errors
 * - XRPC-compatible error codes for AT Protocol compliance
 */

import { HTTPException } from 'hono/http-exception';

/**
 * Standard error response format
 */
export interface ApiErrorResponse {
  error: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  status: number;
}

/**
 * XRPC error codes for AT Protocol compatibility
 * Based on com.atproto.* and io.exprsn.* lexicons
 */
export enum XrpcErrorCode {
  // Generic errors (com.atproto.*)
  InvalidRequest = 'InvalidRequest',
  AuthenticationRequired = 'AuthenticationRequired',
  AuthorizationRequired = 'AuthorizationRequired',
  InvalidToken = 'InvalidToken',
  ExpiredToken = 'ExpiredToken',
  InvalidDid = 'InvalidDid',
  InvalidHandle = 'InvalidHandle',
  InvalidRecord = 'InvalidRecord',
  InvalidSwap = 'InvalidSwap',
  RecordNotFound = 'RecordNotFound',
  RepoNotFound = 'RepoNotFound',

  // Rate limiting
  RateLimitExceeded = 'RateLimitExceeded',

  // Content errors
  ContentNotFound = 'ContentNotFound',
  ContentBlocked = 'ContentBlocked',
  ContentTakedown = 'ContentTakedown',

  // User/account errors
  AccountNotFound = 'AccountNotFound',
  AccountSuspended = 'AccountSuspended',
  AccountTakedown = 'AccountTakedown',

  // Conflict errors
  AlreadyExists = 'AlreadyExists',
  DuplicateCreate = 'DuplicateCreate',

  // Exprsn-specific errors (io.exprsn.*)
  VideoNotFound = 'VideoNotFound',
  VideoProcessingFailed = 'VideoProcessingFailed',
  InvalidVideoFormat = 'InvalidVideoFormat',
  PaymentRequired = 'PaymentRequired',
  PaymentFailed = 'PaymentFailed',
  InsufficientBalance = 'InsufficientBalance',
  SubscriptionRequired = 'SubscriptionRequired',
  OrganizationNotFound = 'OrganizationNotFound',
  InsufficientPermissions = 'InsufficientPermissions',
  FeatureDisabled = 'FeatureDisabled',

  // Server errors
  InternalServerError = 'InternalServerError',
  UpstreamTimeout = 'UpstreamTimeout',
  UpstreamFailure = 'UpstreamFailure',
  NotImplemented = 'NotImplemented',
  MethodNotSupported = 'MethodNotSupported',
}

/**
 * API Error class that extends Hono's HTTPException
 */
export class ApiError extends HTTPException {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(status as 400 | 401 | 402 | 403 | 404 | 409 | 422 | 429 | 500 | 501 | 503 | 504, { message });
    this.code = code;
    this.details = details;
  }

  /**
   * Convert to standard error response format
   */
  toResponse(): ApiErrorResponse {
    return {
      error: this.message,
      code: this.code,
      message: this.message,
      details: this.details,
      status: this.status,
    };
  }
}

/**
 * Error factory functions
 */

/**
 * 400 Bad Request - Invalid request parameters
 */
export function badRequest(
  message = 'Invalid request',
  code: string = XrpcErrorCode.InvalidRequest,
  details?: Record<string, unknown>
): ApiError {
  return new ApiError(400, code, message, details);
}

/**
 * 401 Unauthorized - Authentication required
 */
export function unauthorized(
  message = 'Authentication required',
  code: string = XrpcErrorCode.AuthenticationRequired,
  details?: Record<string, unknown>
): ApiError {
  return new ApiError(401, code, message, details);
}

/**
 * 403 Forbidden - Insufficient permissions
 */
export function forbidden(
  message = 'Permission denied',
  code: string = XrpcErrorCode.InsufficientPermissions,
  details?: Record<string, unknown>
): ApiError {
  return new ApiError(403, code, message, details);
}

/**
 * 404 Not Found - Resource not found
 */
export function notFound(
  message = 'Resource not found',
  code: string = XrpcErrorCode.ContentNotFound,
  details?: Record<string, unknown>
): ApiError {
  return new ApiError(404, code, message, details);
}

/**
 * 409 Conflict - Resource already exists or conflict
 */
export function conflict(
  message = 'Resource already exists',
  code: string = XrpcErrorCode.AlreadyExists,
  details?: Record<string, unknown>
): ApiError {
  return new ApiError(409, code, message, details);
}

/**
 * 422 Unprocessable Entity - Validation error
 */
export function validationError(
  message = 'Validation failed',
  details?: Record<string, unknown>
): ApiError {
  return new ApiError(422, XrpcErrorCode.InvalidRequest, message, details);
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export function rateLimited(
  message = 'Rate limit exceeded',
  details?: Record<string, unknown>
): ApiError {
  return new ApiError(429, XrpcErrorCode.RateLimitExceeded, message, details);
}

/**
 * 402 Payment Required - Payment needed
 */
export function paymentRequired(
  message = 'Payment required',
  details?: Record<string, unknown>
): ApiError {
  return new ApiError(402, XrpcErrorCode.PaymentRequired, message, details);
}

/**
 * 500 Internal Server Error - Generic server error
 */
export function internalError(
  message = 'Internal server error',
  details?: Record<string, unknown>
): ApiError {
  return new ApiError(500, XrpcErrorCode.InternalServerError, message, details);
}

/**
 * 501 Not Implemented - Feature not implemented
 */
export function notImplemented(
  message = 'Not implemented',
  details?: Record<string, unknown>
): ApiError {
  return new ApiError(501, XrpcErrorCode.NotImplemented, message, details);
}

/**
 * 503 Service Unavailable - Service temporarily unavailable
 */
export function serviceUnavailable(
  message = 'Service unavailable',
  details?: Record<string, unknown>
): ApiError {
  return new ApiError(503, XrpcErrorCode.UpstreamFailure, message, details);
}

/**
 * 504 Gateway Timeout - Upstream timeout
 */
export function gatewayTimeout(
  message = 'Gateway timeout',
  details?: Record<string, unknown>
): ApiError {
  return new ApiError(504, XrpcErrorCode.UpstreamTimeout, message, details);
}

/**
 * Specialized error factories for common Exprsn scenarios
 */

export function videoNotFound(uri?: string): ApiError {
  return notFound(
    'Video not found',
    XrpcErrorCode.VideoNotFound,
    uri ? { uri } : undefined
  );
}

export function userNotFound(did?: string): ApiError {
  return notFound(
    'User not found',
    XrpcErrorCode.AccountNotFound,
    did ? { did } : undefined
  );
}

export function organizationNotFound(id?: string): ApiError {
  return notFound(
    'Organization not found',
    XrpcErrorCode.OrganizationNotFound,
    id ? { organizationId: id } : undefined
  );
}

export function invalidToken(): ApiError {
  return unauthorized('Invalid or expired token', XrpcErrorCode.InvalidToken);
}

export function insufficientPermissions(resource?: string): ApiError {
  return forbidden(
    'Insufficient permissions',
    XrpcErrorCode.InsufficientPermissions,
    resource ? { resource } : undefined
  );
}

export function accountSuspended(): ApiError {
  return forbidden('Account suspended', XrpcErrorCode.AccountSuspended);
}

export function contentBlocked(): ApiError {
  return forbidden('Content blocked', XrpcErrorCode.ContentBlocked);
}

export function alreadyExists(resource: string): ApiError {
  return conflict(`${resource} already exists`, XrpcErrorCode.AlreadyExists, {
    resource,
  });
}

export function subscriptionRequired(): ApiError {
  return paymentRequired('Subscription required', {
    reason: 'This content requires an active subscription',
  });
}

export function insufficientBalance(): ApiError {
  return new ApiError(
    402,
    XrpcErrorCode.InsufficientBalance,
    'Insufficient balance'
  );
}

/**
 * Convert generic Error to ApiError
 */
export function fromError(error: unknown, fallbackMessage?: string): ApiError {
  // Already an ApiError
  if (error instanceof ApiError) {
    return error;
  }

  // Hono HTTPException
  if (error instanceof HTTPException) {
    return new ApiError(
      error.status,
      XrpcErrorCode.InternalServerError,
      error.message
    );
  }

  // Standard Error
  if (error instanceof Error) {
    const message = fallbackMessage || error.message || 'An error occurred';
    return internalError(message, {
      originalError: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }

  // Unknown error type
  return internalError(fallbackMessage || 'An unexpected error occurred', {
    error: String(error),
  });
}

/**
 * Helper to check if error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Format error for XRPC response
 * XRPC errors should be in format: { error: code, message: description }
 */
export function toXrpcError(error: ApiError): {
  error: string;
  message: string;
} {
  return {
    error: error.code,
    message: error.message,
  };
}
