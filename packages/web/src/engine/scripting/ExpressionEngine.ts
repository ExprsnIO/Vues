/**
 * Expression Engine for Vues
 * Main expression evaluator with context management and caching
 */

import { Sandbox, type ExecutionResult, type SafeContext, type SecurityLevel } from './Sandbox';
import { builtinFunctions, getBuiltinContext } from './builtin';

/**
 * Expression context provided during evaluation
 */
export interface ExpressionContext {
  // Time-based
  time: number;           // Current time in seconds
  frame: number;          // Current frame number
  fps: number;            // Frames per second
  duration: number;       // Total duration in seconds

  // Value context
  value?: unknown;        // Current interpolated value

  // Property context
  propertyName?: string;  // Name of the property being animated
  propertyPath?: string;  // Full path to the property

  // Layer/clip context
  clipId?: string;        // ID of the current clip
  clipStartTime?: number; // Clip start time in seconds
  clipEndTime?: number;   // Clip end time in seconds
  clipDuration?: number;  // Clip duration in seconds

  // Composition context
  width?: number;         // Composition width
  height?: number;        // Composition height

  // Custom variables
  variables?: Record<string, unknown>;
}

/**
 * Cached compiled expression
 */
interface CompiledExpression {
  fn: (ctx: SafeContext) => unknown;
  contextKeys: string[];
  lastUsed: number;
}

/**
 * Expression engine configuration
 */
export interface ExpressionEngineConfig {
  securityLevel?: SecurityLevel;
  timeout?: number;
  maxIterations?: number;
  maxCacheSize?: number;
  enableCaching?: boolean;
}

const DEFAULT_CONFIG: Required<ExpressionEngineConfig> = {
  securityLevel: 'strict',
  timeout: 1000,
  maxIterations: 10000,
  maxCacheSize: 100,
  enableCaching: true,
};

/**
 * Main expression evaluation engine
 */
export class ExpressionEngine {
  private sandbox: Sandbox;
  private config: Required<ExpressionEngineConfig>;
  private expressionCache: Map<string, CompiledExpression> = new Map();
  private builtins: Readonly<typeof builtinFunctions>;

  constructor(config?: ExpressionEngineConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sandbox = new Sandbox(
      {
        timeout: this.config.timeout,
        maxIterations: this.config.maxIterations,
      },
      this.config.securityLevel
    );
    this.builtins = getBuiltinContext();
  }

  /**
   * Update engine configuration
   */
  setConfig(config: Partial<ExpressionEngineConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.securityLevel) {
      this.sandbox.setSecurityLevel(config.securityLevel);
    }
    if (config.timeout || config.maxIterations) {
      this.sandbox.setOptions({
        timeout: this.config.timeout,
        maxIterations: this.config.maxIterations,
      });
    }
  }

  /**
   * Build safe context from expression context
   */
  private buildContext(ctx: ExpressionContext): SafeContext {
    // Merge builtins with expression context
    const context: SafeContext = {
      ...this.builtins,

      // Time context
      time: ctx.time,
      frame: ctx.frame,
      fps: ctx.fps,
      duration: ctx.duration,

      // Value
      value: ctx.value,

      // Property info
      propertyName: ctx.propertyName,
      propertyPath: ctx.propertyPath,

      // Clip context
      clipId: ctx.clipId,
      clipStartTime: ctx.clipStartTime ?? 0,
      clipEndTime: ctx.clipEndTime ?? ctx.duration,
      clipDuration: ctx.clipDuration ?? ctx.duration,

      // Composition
      width: ctx.width ?? 1920,
      height: ctx.height ?? 1080,

      // Convenience functions that depend on context
      toComp: (layerTime: number) => layerTime + (ctx.clipStartTime ?? 0),
      fromComp: (compTime: number) => compTime - (ctx.clipStartTime ?? 0),

      // Convenience accessors
      thisProperty: ctx.value,
      thisLayer: {
        startTime: ctx.clipStartTime ?? 0,
        duration: ctx.clipDuration ?? ctx.duration,
      },

      // Spread custom variables
      ...(ctx.variables || {}),
    };

    return this.sandbox.createSafeContext(context);
  }

  /**
   * Compile an expression to a function
   */
  private compile(expression: string): (ctx: SafeContext) => unknown {
    // Check cache first
    if (this.config.enableCaching) {
      const cached = this.expressionCache.get(expression);
      if (cached) {
        cached.lastUsed = Date.now();
        return cached.fn;
      }
    }

    // Validate security
    const securityError = this.sandbox.validateSecurity(expression);
    if (securityError) {
      throw new Error(`Security violation: ${securityError.message}`);
    }

    // Get context keys for the function
    const contextKeys = Object.keys(this.builtins);

    // Additional context keys
    const additionalKeys = [
      'time', 'frame', 'fps', 'duration', 'value',
      'propertyName', 'propertyPath', 'clipId',
      'clipStartTime', 'clipEndTime', 'clipDuration',
      'width', 'height', 'toComp', 'fromComp',
      'thisProperty', 'thisLayer',
    ];

    const allKeys = [...new Set([...contextKeys, ...additionalKeys])];

    // Create function body
    const funcBody = `
      "use strict";
      const { ${allKeys.join(', ')} } = __ctx__;
      return (${expression});
    `;

    // Compile the function
    // eslint-disable-next-line no-new-func
    const fn = new Function('__ctx__', funcBody) as (ctx: SafeContext) => unknown;

    // Cache if enabled
    if (this.config.enableCaching) {
      this.cacheExpression(expression, fn, allKeys);
    }

    return fn;
  }

  /**
   * Cache a compiled expression
   */
  private cacheExpression(
    expression: string,
    fn: (ctx: SafeContext) => unknown,
    contextKeys: string[]
  ): void {
    // Evict old entries if cache is full
    if (this.expressionCache.size >= this.config.maxCacheSize) {
      this.evictOldestCacheEntry();
    }

    this.expressionCache.set(expression, {
      fn,
      contextKeys,
      lastUsed: Date.now(),
    });
  }

  /**
   * Evict the oldest cache entry
   */
  private evictOldestCacheEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, value] of this.expressionCache) {
      if (value.lastUsed < oldestTime) {
        oldestTime = value.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.expressionCache.delete(oldestKey);
    }
  }

  /**
   * Evaluate an expression
   */
  evaluate<T = unknown>(expression: string, context: ExpressionContext): ExecutionResult<T> {
    const startTime = performance.now();

    try {
      // Build safe context
      const safeContext = this.buildContext(context);

      // Use sandbox for simple expressions
      const result = this.sandbox.evaluateExpression<T>(expression, safeContext);

      return result;
    } catch (error) {
      return {
        success: false,
        error: {
          type: 'runtime',
          message: error instanceof Error ? error.message : String(error),
        },
        metrics: {
          executionTime: performance.now() - startTime,
          iterationCount: 0,
        },
      };
    }
  }

  /**
   * Evaluate an expression with value coercion
   */
  evaluateNumber(expression: string, context: ExpressionContext, defaultValue: number = 0): number {
    const result = this.evaluate<number>(expression, context);

    if (!result.success || result.value === undefined || result.value === null) {
      return defaultValue;
    }

    if (typeof result.value === 'number') {
      return isFinite(result.value) ? result.value : defaultValue;
    }

    const num = Number(result.value);
    return isFinite(num) ? num : defaultValue;
  }

  /**
   * Evaluate an expression expecting a vector result
   */
  evaluateVector(
    expression: string,
    context: ExpressionContext,
    defaultValue: { x: number; y: number } = { x: 0, y: 0 }
  ): { x: number; y: number } {
    const result = this.evaluate(expression, context);

    if (!result.success || result.value === undefined || result.value === null) {
      return defaultValue;
    }

    const value = result.value;

    // Array format [x, y]
    if (Array.isArray(value) && value.length >= 2) {
      return {
        x: typeof value[0] === 'number' ? value[0] : defaultValue.x,
        y: typeof value[1] === 'number' ? value[1] : defaultValue.y,
      };
    }

    // Object format {x, y}
    if (
      typeof value === 'object' &&
      'x' in value &&
      'y' in value
    ) {
      const obj = value as { x: unknown; y: unknown };
      return {
        x: typeof obj.x === 'number' ? obj.x : defaultValue.x,
        y: typeof obj.y === 'number' ? obj.y : defaultValue.y,
      };
    }

    return defaultValue;
  }

  /**
   * Evaluate an expression expecting a color result
   */
  evaluateColor(
    expression: string,
    context: ExpressionContext,
    defaultValue: string = '#000000'
  ): string {
    const result = this.evaluate(expression, context);

    if (!result.success || result.value === undefined || result.value === null) {
      return defaultValue;
    }

    const value = result.value;

    // String format (hex, rgb, etc.)
    if (typeof value === 'string') {
      return value;
    }

    // RGB object format
    if (
      typeof value === 'object' &&
      'r' in value &&
      'g' in value &&
      'b' in value
    ) {
      const rgb = value as { r: number; g: number; b: number };
      const toHex = (n: number) => {
        const hex = Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      };
      return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
    }

    return defaultValue;
  }

  /**
   * Validate an expression without evaluating
   */
  validate(expression: string): { valid: boolean; error?: string } {
    // Check security first
    const securityError = this.sandbox.validateSecurity(expression);
    if (securityError) {
      return { valid: false, error: securityError.message };
    }

    // Try to compile
    try {
      this.compile(expression);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Clear the expression cache
   */
  clearCache(): void {
    this.expressionCache.clear();
    this.sandbox.clearCache();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.expressionCache.size,
      maxSize: this.config.maxCacheSize,
    };
  }
}

// Default singleton instance
export const expressionEngine = new ExpressionEngine();
