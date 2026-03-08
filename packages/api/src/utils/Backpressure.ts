/**
 * Backpressure Management
 * Controls flow of data to prevent overwhelming consumers
 */

/**
 * Backpressure state
 */
export enum BackpressureState {
  NORMAL = 'normal',
  WARNING = 'warning',
  CRITICAL = 'critical',
  PAUSED = 'paused',
}

/**
 * Backpressure options
 */
export interface BackpressureOptions {
  // Name for logging
  name: string;
  // Maximum items in buffer
  maxBufferSize?: number;
  // Warning threshold (percentage of max)
  warningThreshold?: number;
  // Critical threshold (percentage of max)
  criticalThreshold?: number;
  // Callback when state changes
  onStateChange?: (state: BackpressureState, bufferSize: number) => void;
  // Callback when buffer is full
  onBufferFull?: () => void;
}

const DEFAULT_OPTIONS = {
  maxBufferSize: 10000,
  warningThreshold: 0.7,
  criticalThreshold: 0.9,
};

/**
 * Backpressure Controller
 *
 * Manages flow control for data processing pipelines.
 * Provides signals when buffer is getting full.
 */
export class BackpressureController<T> {
  private name: string;
  private buffer: T[] = [];
  private maxBufferSize: number;
  private warningThreshold: number;
  private criticalThreshold: number;
  private state: BackpressureState = BackpressureState.NORMAL;
  private onStateChange?: (state: BackpressureState, bufferSize: number) => void;
  private onBufferFull?: () => void;
  private paused = false;
  private processing = false;

  // Metrics
  private totalReceived = 0;
  private totalProcessed = 0;
  private totalDropped = 0;

  constructor(options: BackpressureOptions) {
    this.name = options.name;
    this.maxBufferSize = options.maxBufferSize ?? DEFAULT_OPTIONS.maxBufferSize;
    this.warningThreshold = options.warningThreshold ?? DEFAULT_OPTIONS.warningThreshold;
    this.criticalThreshold = options.criticalThreshold ?? DEFAULT_OPTIONS.criticalThreshold;
    this.onStateChange = options.onStateChange;
    this.onBufferFull = options.onBufferFull;
  }

  /**
   * Add item to buffer
   * Returns false if buffer is full and item was dropped
   */
  push(item: T): boolean {
    this.totalReceived++;

    if (this.paused || this.buffer.length >= this.maxBufferSize) {
      this.totalDropped++;
      return false;
    }

    this.buffer.push(item);
    this.updateState();
    return true;
  }

  /**
   * Add multiple items to buffer
   * Returns number of items actually added
   */
  pushMany(items: T[]): number {
    let added = 0;
    for (const item of items) {
      if (this.push(item)) {
        added++;
      }
    }
    return added;
  }

  /**
   * Get next item from buffer
   */
  pop(): T | undefined {
    const item = this.buffer.shift();
    if (item !== undefined) {
      this.totalProcessed++;
      this.updateState();
    }
    return item;
  }

  /**
   * Get multiple items from buffer
   */
  popMany(count: number): T[] {
    const items = this.buffer.splice(0, count);
    this.totalProcessed += items.length;
    this.updateState();
    return items;
  }

  /**
   * Peek at next item without removing
   */
  peek(): T | undefined {
    return this.buffer[0];
  }

  /**
   * Process items with a handler function
   */
  async process(
    handler: (items: T[]) => Promise<void>,
    batchSize: number = 100
  ): Promise<number> {
    if (this.processing || this.buffer.length === 0) {
      return 0;
    }

    this.processing = true;
    let processed = 0;

    try {
      while (this.buffer.length > 0 && !this.paused) {
        const batch = this.popMany(batchSize);
        await handler(batch);
        processed += batch.length;
      }
    } finally {
      this.processing = false;
    }

    return processed;
  }

  /**
   * Update backpressure state based on buffer size
   */
  private updateState(): void {
    const fillRatio = this.buffer.length / this.maxBufferSize;
    let newState: BackpressureState;

    if (this.paused) {
      newState = BackpressureState.PAUSED;
    } else if (fillRatio >= this.criticalThreshold) {
      newState = BackpressureState.CRITICAL;
      if (fillRatio >= 1 && this.onBufferFull) {
        this.onBufferFull();
      }
    } else if (fillRatio >= this.warningThreshold) {
      newState = BackpressureState.WARNING;
    } else {
      newState = BackpressureState.NORMAL;
    }

    if (newState !== this.state) {
      this.state = newState;
      console.log(
        `[Backpressure:${this.name}] State changed to ${newState} (buffer: ${this.buffer.length}/${this.maxBufferSize})`
      );
      if (this.onStateChange) {
        this.onStateChange(newState, this.buffer.length);
      }
    }
  }

  /**
   * Pause accepting new items
   */
  pause(): void {
    this.paused = true;
    this.updateState();
    console.log(`[Backpressure:${this.name}] Paused`);
  }

  /**
   * Resume accepting new items
   */
  resume(): void {
    this.paused = false;
    this.updateState();
    console.log(`[Backpressure:${this.name}] Resumed`);
  }

  /**
   * Clear buffer
   */
  clear(): void {
    const dropped = this.buffer.length;
    this.buffer = [];
    this.totalDropped += dropped;
    this.updateState();
    console.log(`[Backpressure:${this.name}] Cleared ${dropped} items`);
  }

  /**
   * Check if should accept more items
   */
  shouldAccept(): boolean {
    return !this.paused && this.buffer.length < this.maxBufferSize;
  }

  /**
   * Get current state
   */
  getState(): BackpressureState {
    return this.state;
  }

  /**
   * Get buffer size
   */
  size(): number {
    return this.buffer.length;
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  /**
   * Get fill percentage
   */
  getFillPercentage(): number {
    return this.buffer.length / this.maxBufferSize;
  }

  /**
   * Get metrics
   */
  getMetrics(): {
    name: string;
    state: BackpressureState;
    bufferSize: number;
    maxBufferSize: number;
    fillPercentage: number;
    totalReceived: number;
    totalProcessed: number;
    totalDropped: number;
    dropRate: number;
  } {
    const dropRate = this.totalReceived > 0
      ? this.totalDropped / this.totalReceived
      : 0;

    return {
      name: this.name,
      state: this.state,
      bufferSize: this.buffer.length,
      maxBufferSize: this.maxBufferSize,
      fillPercentage: this.getFillPercentage(),
      totalReceived: this.totalReceived,
      totalProcessed: this.totalProcessed,
      totalDropped: this.totalDropped,
      dropRate,
    };
  }
}

/**
 * Rate limiter for backpressure
 */
export class RateLimiter {
  private name: string;
  private maxPerSecond: number;
  private tokens: number;
  private lastRefill: number;
  private maxBurst: number;

  constructor(options: {
    name: string;
    maxPerSecond: number;
    maxBurst?: number;
  }) {
    this.name = options.name;
    this.maxPerSecond = options.maxPerSecond;
    this.maxBurst = options.maxBurst ?? options.maxPerSecond * 2;
    this.tokens = this.maxBurst;
    this.lastRefill = Date.now();
  }

  /**
   * Try to acquire a token
   */
  tryAcquire(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Wait until a token is available
   */
  async acquire(): Promise<void> {
    while (!this.tryAcquire()) {
      const waitTime = Math.ceil(1000 / this.maxPerSecond);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = (elapsed / 1000) * this.maxPerSecond;

    this.tokens = Math.min(this.maxBurst, this.tokens + newTokens);
    this.lastRefill = now;
  }

  /**
   * Get available tokens
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Reset rate limiter
   */
  reset(): void {
    this.tokens = this.maxBurst;
    this.lastRefill = Date.now();
  }
}
