/**
 * Observability Service
 * Comprehensive logging, metrics, and tracing for production monitoring
 */

// Structured logging levels
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  domainId?: string;
  requestId?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
}

export interface MetricDefinition {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  description: string;
  labels?: string[];
  buckets?: number[];
}

export interface MetricValue {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp?: number;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  service: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'ok' | 'error' | 'timeout';
  attributes?: Record<string, any>;
  events?: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, any>;
}

export interface TracingContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

// Prometheus metrics format
interface PrometheusMetric {
  name: string;
  type: string;
  help: string;
  values: Array<{
    labels: Record<string, string>;
    value: number;
    timestamp?: number;
  }>;
}

// Core metric definitions
const CORE_METRICS: MetricDefinition[] = [
  // HTTP metrics
  {
    name: 'http_requests_total',
    type: 'counter',
    description: 'Total number of HTTP requests',
    labels: ['method', 'path', 'status', 'domain'],
  },
  {
    name: 'http_request_duration_seconds',
    type: 'histogram',
    description: 'HTTP request duration in seconds',
    labels: ['method', 'path', 'status', 'domain'],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  },
  {
    name: 'http_request_size_bytes',
    type: 'histogram',
    description: 'HTTP request size in bytes',
    labels: ['method', 'path'],
    buckets: [100, 1000, 10000, 100000, 1000000],
  },
  {
    name: 'http_response_size_bytes',
    type: 'histogram',
    description: 'HTTP response size in bytes',
    labels: ['method', 'path'],
    buckets: [100, 1000, 10000, 100000, 1000000],
  },

  // Video metrics
  {
    name: 'video_uploads_total',
    type: 'counter',
    description: 'Total number of video uploads',
    labels: ['domain', 'status'],
  },
  {
    name: 'video_views_total',
    type: 'counter',
    description: 'Total number of video views',
    labels: ['domain'],
  },
  {
    name: 'video_processing_duration_seconds',
    type: 'histogram',
    description: 'Video processing duration in seconds',
    labels: ['domain', 'resolution'],
    buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  },
  {
    name: 'video_size_bytes',
    type: 'histogram',
    description: 'Video file size in bytes',
    labels: ['domain'],
    buckets: [1e6, 1e7, 5e7, 1e8, 5e8, 1e9],
  },

  // User metrics
  {
    name: 'active_users',
    type: 'gauge',
    description: 'Number of active users',
    labels: ['domain', 'period'],
  },
  {
    name: 'user_sessions_total',
    type: 'counter',
    description: 'Total number of user sessions',
    labels: ['domain'],
  },
  {
    name: 'user_registrations_total',
    type: 'counter',
    description: 'Total number of user registrations',
    labels: ['domain', 'method'],
  },

  // Moderation metrics
  {
    name: 'moderation_reports_total',
    type: 'counter',
    description: 'Total number of moderation reports',
    labels: ['domain', 'type', 'status'],
  },
  {
    name: 'moderation_actions_total',
    type: 'counter',
    description: 'Total number of moderation actions',
    labels: ['domain', 'action', 'automated'],
  },
  {
    name: 'moderation_queue_size',
    type: 'gauge',
    description: 'Current moderation queue size',
    labels: ['domain', 'priority'],
  },
  {
    name: 'moderation_sla_breaches_total',
    type: 'counter',
    description: 'Total number of SLA breaches',
    labels: ['domain', 'type'],
  },

  // Federation metrics
  {
    name: 'federation_events_total',
    type: 'counter',
    description: 'Total number of federation events',
    labels: ['direction', 'type', 'status'],
  },
  {
    name: 'federation_latency_seconds',
    type: 'histogram',
    description: 'Federation event latency in seconds',
    labels: ['direction', 'type'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  },

  // Database metrics
  {
    name: 'db_query_duration_seconds',
    type: 'histogram',
    description: 'Database query duration in seconds',
    labels: ['operation', 'table'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  },
  {
    name: 'db_connections_active',
    type: 'gauge',
    description: 'Number of active database connections',
  },
  {
    name: 'db_connections_idle',
    type: 'gauge',
    description: 'Number of idle database connections',
  },

  // Cache metrics
  {
    name: 'cache_hits_total',
    type: 'counter',
    description: 'Total number of cache hits',
    labels: ['cache'],
  },
  {
    name: 'cache_misses_total',
    type: 'counter',
    description: 'Total number of cache misses',
    labels: ['cache'],
  },
  {
    name: 'cache_size_bytes',
    type: 'gauge',
    description: 'Current cache size in bytes',
    labels: ['cache'],
  },

  // Error metrics
  {
    name: 'errors_total',
    type: 'counter',
    description: 'Total number of errors',
    labels: ['type', 'service', 'domain'],
  },

  // System metrics
  {
    name: 'process_cpu_seconds_total',
    type: 'counter',
    description: 'Total CPU time spent in seconds',
  },
  {
    name: 'process_memory_bytes',
    type: 'gauge',
    description: 'Process memory usage in bytes',
    labels: ['type'],
  },
  {
    name: 'nodejs_event_loop_lag_seconds',
    type: 'gauge',
    description: 'Node.js event loop lag in seconds',
  },
];

export class ObservabilityService {
  private serviceName: string;
  private environment: string;
  private logLevel: LogLevel;
  private metrics: Map<string, PrometheusMetric> = new Map();
  private histogramBuckets: Map<string, number[]> = new Map();
  private spans: Map<string, Span> = new Map();
  private logHandlers: ((entry: LogEntry) => void)[] = [];
  private metricsHandlers: ((metrics: PrometheusMetric[]) => void)[] = [];
  private spanHandlers: ((span: Span) => void)[] = [];

  constructor(options: {
    serviceName: string;
    environment?: string;
    logLevel?: LogLevel;
  }) {
    this.serviceName = options.serviceName;
    this.environment = options.environment || 'development';
    this.logLevel = options.logLevel || 'info';

    // Initialize core metrics
    for (const metric of CORE_METRICS) {
      this.registerMetric(metric);
    }
  }

  // ==================== LOGGING ====================

  /**
   * Add a log handler
   */
  onLog(handler: (entry: LogEntry) => void): void {
    this.logHandlers.push(handler);
  }

  /**
   * Create a structured log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'message' | 'service'>>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.serviceName,
      ...context,
    };
  }

  /**
   * Check if level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  /**
   * Emit log entry
   */
  private emitLog(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    // Console output in structured JSON
    const output = JSON.stringify(entry);
    switch (entry.level) {
      case 'error':
      case 'fatal':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }

    // Call handlers
    for (const handler of this.logHandlers) {
      try {
        handler(entry);
      } catch {
        // Ignore handler errors
      }
    }
  }

  trace(message: string, context?: Partial<LogEntry>): void {
    this.emitLog(this.createLogEntry('trace', message, context));
  }

  debug(message: string, context?: Partial<LogEntry>): void {
    this.emitLog(this.createLogEntry('debug', message, context));
  }

  info(message: string, context?: Partial<LogEntry>): void {
    this.emitLog(this.createLogEntry('info', message, context));
  }

  warn(message: string, context?: Partial<LogEntry>): void {
    this.emitLog(this.createLogEntry('warn', message, context));
  }

  error(message: string, error?: Error, context?: Partial<LogEntry>): void {
    this.emitLog(
      this.createLogEntry('error', message, {
        ...context,
        error: error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : undefined,
      })
    );
  }

  fatal(message: string, error?: Error, context?: Partial<LogEntry>): void {
    this.emitLog(
      this.createLogEntry('fatal', message, {
        ...context,
        error: error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : undefined,
      })
    );
  }

  // ==================== METRICS ====================

  /**
   * Register a metric definition
   */
  registerMetric(definition: MetricDefinition): void {
    this.metrics.set(definition.name, {
      name: definition.name,
      type: definition.type,
      help: definition.description,
      values: [],
    });

    if (definition.buckets) {
      this.histogramBuckets.set(definition.name, definition.buckets);
    }
  }

  /**
   * Increment a counter
   */
  incrementCounter(name: string, labels?: Record<string, string>, value: number = 1): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'counter') return;

    const key = this.labelsToKey(labels || {});
    const existing = metric.values.find(v => this.labelsToKey(v.labels) === key);

    if (existing) {
      existing.value += value;
    } else {
      metric.values.push({ labels: labels || {}, value });
    }
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'gauge') return;

    const key = this.labelsToKey(labels || {});
    const existing = metric.values.find(v => this.labelsToKey(v.labels) === key);

    if (existing) {
      existing.value = value;
    } else {
      metric.values.push({ labels: labels || {}, value });
    }
  }

  /**
   * Observe a histogram value
   */
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'histogram') return;

    const buckets = this.histogramBuckets.get(name) || [0.1, 0.5, 1, 5, 10];
    const key = this.labelsToKey(labels || {});

    // Create bucket entries if they don't exist
    for (const bucket of [...buckets, Infinity]) {
      const bucketKey = `${key}_le_${bucket}`;
      const existing = metric.values.find(
        v => this.labelsToKey({ ...v.labels, le: String(bucket) }) === bucketKey
      );

      if (existing) {
        if (value <= bucket) {
          existing.value += 1;
        }
      } else {
        metric.values.push({
          labels: { ...(labels || {}), le: String(bucket) },
          value: value <= bucket ? 1 : 0,
        });
      }
    }

    // Sum
    const sumKey = `${key}_sum`;
    const sumExisting = metric.values.find(v => this.labelsToKey(v.labels) === sumKey && v.labels._type === 'sum');
    if (sumExisting) {
      sumExisting.value += value;
    } else {
      metric.values.push({ labels: { ...(labels || {}), _type: 'sum' }, value });
    }

    // Count
    const countKey = `${key}_count`;
    const countExisting = metric.values.find(v => this.labelsToKey(v.labels) === countKey && v.labels._type === 'count');
    if (countExisting) {
      countExisting.value += 1;
    } else {
      metric.values.push({ labels: { ...(labels || {}), _type: 'count' }, value: 1 });
    }
  }

  /**
   * Get Prometheus-formatted metrics
   */
  getPrometheusMetrics(): string {
    const lines: string[] = [];

    for (const [name, metric] of this.metrics) {
      lines.push(`# HELP ${name} ${metric.help}`);
      lines.push(`# TYPE ${name} ${metric.type}`);

      for (const value of metric.values) {
        const labelParts: string[] = [];
        for (const [k, v] of Object.entries(value.labels)) {
          if (k !== '_type' && k !== 'le') {
            labelParts.push(`${k}="${v}"`);
          }
        }

        let metricName = name;
        if (value.labels._type === 'sum') {
          metricName = `${name}_sum`;
        } else if (value.labels._type === 'count') {
          metricName = `${name}_count`;
        } else if (value.labels.le !== undefined) {
          metricName = `${name}_bucket`;
          labelParts.push(`le="${value.labels.le}"`);
        }

        const labelsStr = labelParts.length > 0 ? `{${labelParts.join(',')}}` : '';
        lines.push(`${metricName}${labelsStr} ${value.value}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    for (const metric of this.metrics.values()) {
      metric.values = [];
    }
  }

  // ==================== TRACING ====================

  /**
   * Generate a trace ID
   */
  generateTraceId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Generate a span ID
   */
  generateSpanId(): string {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Start a new span
   */
  startSpan(
    name: string,
    options?: {
      traceId?: string;
      parentSpanId?: string;
      attributes?: Record<string, any>;
    }
  ): Span {
    const span: Span = {
      traceId: options?.traceId || this.generateTraceId(),
      spanId: this.generateSpanId(),
      parentSpanId: options?.parentSpanId,
      name,
      service: this.serviceName,
      startTime: Date.now(),
      status: 'ok',
      attributes: options?.attributes,
      events: [],
    };

    this.spans.set(span.spanId, span);
    return span;
  }

  /**
   * End a span
   */
  endSpan(spanId: string, status?: 'ok' | 'error' | 'timeout'): Span | undefined {
    const span = this.spans.get(spanId);
    if (!span) return undefined;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    if (status) span.status = status;

    this.spans.delete(spanId);

    // Emit to handlers
    for (const handler of this.spanHandlers) {
      try {
        handler(span);
      } catch {
        // Ignore handler errors
      }
    }

    return span;
  }

  /**
   * Add event to span
   */
  addSpanEvent(spanId: string, name: string, attributes?: Record<string, any>): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.events = span.events || [];
    span.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
  }

  /**
   * Set span attributes
   */
  setSpanAttributes(spanId: string, attributes: Record<string, any>): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.attributes = { ...span.attributes, ...attributes };
  }

  /**
   * Create child span
   */
  createChildSpan(parentSpan: Span, name: string, attributes?: Record<string, any>): Span {
    return this.startSpan(name, {
      traceId: parentSpan.traceId,
      parentSpanId: parentSpan.spanId,
      attributes,
    });
  }

  /**
   * Add span handler
   */
  onSpan(handler: (span: Span) => void): void {
    this.spanHandlers.push(handler);
  }

  /**
   * Get tracing context for propagation
   */
  getTracingContext(span: Span): TracingContext {
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
    };
  }

  /**
   * Extract tracing context from headers
   */
  extractTracingContext(headers: Record<string, string | undefined>): TracingContext | null {
    // W3C Trace Context format
    const traceparent = headers['traceparent'];
    if (traceparent) {
      const parts = traceparent.split('-');
      if (parts.length >= 3) {
        return {
          traceId: parts[1],
          spanId: parts[2],
          parentSpanId: parts[2],
        };
      }
    }

    // Legacy format
    const traceId = headers['x-trace-id'];
    const spanId = headers['x-span-id'];
    if (traceId && spanId) {
      return { traceId, spanId, parentSpanId: spanId };
    }

    return null;
  }

  /**
   * Create propagation headers
   */
  createPropagationHeaders(context: TracingContext): Record<string, string> {
    return {
      'traceparent': `00-${context.traceId}-${context.spanId}-01`,
      'x-trace-id': context.traceId,
      'x-span-id': context.spanId,
    };
  }

  // ==================== UTILITIES ====================

  /**
   * Create request logger middleware data
   */
  createRequestLog(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    options?: {
      requestId?: string;
      userId?: string;
      domainId?: string;
      traceId?: string;
      spanId?: string;
      error?: Error;
    }
  ): void {
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    this.emitLog(
      this.createLogEntry(level, `${method} ${path} ${statusCode}`, {
        requestId: options?.requestId,
        userId: options?.userId,
        domainId: options?.domainId,
        traceId: options?.traceId,
        spanId: options?.spanId,
        duration,
        error: options?.error
          ? {
              name: options.error.name,
              message: options.error.message,
              stack: options.error.stack,
            }
          : undefined,
        metadata: {
          method,
          path,
          statusCode,
        },
      })
    );

    // Record metrics
    const pathLabel = this.normalizePath(path);
    this.incrementCounter('http_requests_total', {
      method,
      path: pathLabel,
      status: String(statusCode),
      domain: options?.domainId || 'unknown',
    });

    this.observeHistogram('http_request_duration_seconds', duration / 1000, {
      method,
      path: pathLabel,
      status: String(statusCode),
      domain: options?.domainId || 'unknown',
    });
  }

  /**
   * Time an async operation
   */
  async timeAsync<T>(
    name: string,
    fn: () => Promise<T>,
    options?: {
      labels?: Record<string, string>;
      metricName?: string;
    }
  ): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      const duration = Date.now() - start;
      if (options?.metricName) {
        this.observeHistogram(options.metricName, duration / 1000, options.labels);
      }
      this.debug(`${name} completed`, { duration, metadata: options?.labels });
    }
  }

  /**
   * Wrap function with tracing
   */
  withTracing<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options?: {
      parentSpan?: Span;
      attributes?: Record<string, any>;
    }
  ): Promise<T> {
    const span = options?.parentSpan
      ? this.createChildSpan(options.parentSpan, name, options?.attributes)
      : this.startSpan(name, { attributes: options?.attributes });

    return fn(span)
      .then(result => {
        this.endSpan(span.spanId, 'ok');
        return result;
      })
      .catch(error => {
        this.setSpanAttributes(span.spanId, {
          error: true,
          'error.message': error.message,
        });
        this.endSpan(span.spanId, 'error');
        throw error;
      });
  }

  // Private helpers

  private labelsToKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
  }

  private normalizePath(path: string): string {
    // Replace IDs with placeholders for better metric aggregation
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/[0-9]+/g, '/:id')
      .replace(/\/did:[^/]+/g, '/:did');
  }
}

export function createObservabilityService(options: {
  serviceName: string;
  environment?: string;
  logLevel?: LogLevel;
}): ObservabilityService {
  return new ObservabilityService(options);
}
