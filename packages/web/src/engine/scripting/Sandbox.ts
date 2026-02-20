/**
 * Secure Sandbox for Expression Execution
 * Provides isolation, security checks, and resource limits
 */

export interface ExecutionError {
  type: 'syntax' | 'runtime' | 'security' | 'timeout' | 'iteration-limit';
  message: string;
  line?: number;
  column?: number;
  stack?: string;
}

export interface ExecutionResult<T = unknown> {
  success: boolean;
  value?: T;
  error?: ExecutionError;
  metrics: {
    executionTime: number;
    iterationCount: number;
  };
}

export interface SandboxOptions {
  timeout: number;
  maxIterations: number;
  maxCallDepth: number;
  allowAsync: boolean;
}

export interface SecurityPolicy {
  blockedPatterns: RegExp[];
  maxCodeLength: number;
}

export type SecurityLevel = 'strict' | 'standard' | 'permissive';

// Default options
const DEFAULT_OPTIONS: SandboxOptions = {
  timeout: 1000,
  maxIterations: 10000,
  maxCallDepth: 100,
  allowAsync: false,
};

// Security policies
const SECURITY_POLICIES: Record<SecurityLevel, SecurityPolicy> = {
  strict: {
    blockedPatterns: [
      /\beval\b/,
      /\bFunction\b/,
      /\bnew\s+Function\b/,
      /\b__proto__\b/,
      /\bprototype\b/,
      /\bconstructor\b/,
      /\brequire\b/,
      /\bimport\b/,
      /\bexport\b/,
      /\bprocess\b/,
      /\bglobal\b/,
      /\bwindow\b/,
      /\bdocument\b/,
      /\bfetch\b/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /\bWorker\b/,
      /\blocalStorage\b/,
      /\bsessionStorage\b/,
      /\bcookie\b/,
      /\balert\b/,
      /\bprompt\b/,
      /\bconfirm\b/,
    ],
    maxCodeLength: 10000,
  },
  standard: {
    blockedPatterns: [
      /\beval\b/,
      /\bFunction\b/,
      /\bnew\s+Function\b/,
      /\b__proto__\b/,
      /\brequire\b/,
      /\bimport\b/,
      /\bprocess\b/,
      /\bglobal\b/,
    ],
    maxCodeLength: 50000,
  },
  permissive: {
    blockedPatterns: [
      /\beval\b/,
      /\b__proto__\b/,
      /\brequire\b/,
      /\bprocess\b/,
    ],
    maxCodeLength: 100000,
  },
};

export interface SafeContext {
  [key: string]: unknown;
}

/**
 * Secure sandbox for executing user expressions
 */
export class Sandbox {
  private options: SandboxOptions;
  private policy: SecurityPolicy;
  private proxyCache: WeakMap<object, object> = new WeakMap();

  constructor(options?: Partial<SandboxOptions>, level: SecurityLevel = 'strict') {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.policy = SECURITY_POLICIES[level];
  }

  setOptions(options: Partial<SandboxOptions>): void {
    this.options = { ...this.options, ...options };
  }

  setSecurityLevel(level: SecurityLevel): void {
    this.policy = SECURITY_POLICIES[level];
  }

  /**
   * Validate code against security policy
   */
  validateSecurity(code: string): ExecutionError | null {
    if (code.length > this.policy.maxCodeLength) {
      return {
        type: 'security',
        message: `Code exceeds maximum length of ${this.policy.maxCodeLength} characters`,
      };
    }

    for (const pattern of this.policy.blockedPatterns) {
      if (pattern.test(code)) {
        return {
          type: 'security',
          message: `Blocked pattern detected: ${pattern.toString()}`,
        };
      }
    }

    return null;
  }

  /**
   * Create a safe proxy wrapper for objects
   */
  createProxy<T extends object>(target: T): T {
    const cached = this.proxyCache.get(target);
    if (cached) return cached as T;

    const handler: ProxyHandler<T> = {
      get: (obj, prop) => {
        // Block prototype access
        if (prop === '__proto__' || prop === 'constructor' || prop === 'prototype') {
          return undefined;
        }

        const value = Reflect.get(obj, prop);

        // Wrap functions
        if (typeof value === 'function') {
          return (...args: unknown[]) => {
            try {
              return value.apply(obj, args);
            } catch {
              throw new Error(`Method call failed: ${String(prop)}`);
            }
          };
        }

        // Recursively proxy nested objects
        if (value && typeof value === 'object') {
          return this.createProxy(value as object);
        }

        return value;
      },

      set: () => false,
      deleteProperty: () => false,
      defineProperty: () => false,
      setPrototypeOf: () => false,
    };

    const proxy = new Proxy(target, handler);
    this.proxyCache.set(target, proxy);
    return proxy;
  }

  /**
   * Create a safe context with proxied APIs
   */
  createSafeContext(apis: Record<string, unknown>): SafeContext {
    const context: SafeContext = {};

    for (const [key, value] of Object.entries(apis)) {
      if (value && typeof value === 'object') {
        context[key] = this.createProxy(value as object);
      } else if (typeof value === 'function') {
        context[key] = (...args: unknown[]) => {
          return (value as (...args: unknown[]) => unknown)(...args);
        };
      } else {
        context[key] = value;
      }
    }

    return Object.freeze(context);
  }

  /**
   * Add iteration guards to prevent infinite loops
   */
  private addIterationGuards(code: string, maxIterations: number): string {
    const guardVar = `__guard_${Date.now()}`;

    const guardCode = `
      let ${guardVar} = 0;
      const __checkIteration = () => {
        if (++${guardVar} > ${maxIterations}) {
          throw new Error('Maximum iteration limit exceeded');
        }
      };
    `;

    let guarded = code;

    // Add checks to loops
    guarded = guarded.replace(
      /\bfor\s*\([^)]*\)\s*\{/g,
      (match) => `${match} __checkIteration();`
    );

    guarded = guarded.replace(
      /\bwhile\s*\([^)]*\)\s*\{/g,
      (match) => `${match} __checkIteration();`
    );

    guarded = guarded.replace(
      /\bdo\s*\{/g,
      (match) => `${match} __checkIteration();`
    );

    return guardCode + guarded;
  }

  /**
   * Evaluate a simple expression
   */
  evaluateExpression<T = unknown>(
    expression: string,
    context: SafeContext
  ): ExecutionResult<T> {
    const startTime = performance.now();

    const securityError = this.validateSecurity(expression);
    if (securityError) {
      return {
        success: false,
        error: securityError,
        metrics: { executionTime: performance.now() - startTime, iterationCount: 0 },
      };
    }

    try {
      const contextKeys = Object.keys(context);
      const funcBody = `
        "use strict";
        const { ${contextKeys.join(', ')} } = __ctx__;
        return (${expression});
      `;

      // eslint-disable-next-line no-new-func
      const fn = new Function('__ctx__', funcBody);
      const value = fn(context) as T;

      return {
        success: true,
        value,
        metrics: { executionTime: performance.now() - startTime, iterationCount: 0 },
      };
    } catch (error) {
      return {
        success: false,
        error: this.parseError(error),
        metrics: { executionTime: performance.now() - startTime, iterationCount: 0 },
      };
    }
  }

  /**
   * Execute a full script with guards and timeout
   */
  async executeScript<T = unknown>(
    script: string,
    context: SafeContext
  ): Promise<ExecutionResult<T>> {
    const startTime = performance.now();

    const securityError = this.validateSecurity(script);
    if (securityError) {
      return {
        success: false,
        error: securityError,
        metrics: { executionTime: performance.now() - startTime, iterationCount: 0 },
      };
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve({
          success: false,
          error: {
            type: 'timeout',
            message: `Script exceeded ${this.options.timeout}ms timeout`,
          },
          metrics: { executionTime: this.options.timeout, iterationCount: 0 },
        });
      }, this.options.timeout);

      try {
        const guardedScript = this.addIterationGuards(script, this.options.maxIterations);
        const contextKeys = Object.keys(context);

        const funcBody = `
          "use strict";
          return (async function(__ctx__) {
            const { ${contextKeys.join(', ')} } = __ctx__;
            ${guardedScript}
          })(__ctx__);
        `;

        // eslint-disable-next-line no-new-func
        const fn = new Function('__ctx__', funcBody);

        Promise.resolve(fn(context))
          .then((value) => {
            clearTimeout(timeoutId);
            resolve({
              success: true,
              value: value as T,
              metrics: { executionTime: performance.now() - startTime, iterationCount: 0 },
            });
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            resolve({
              success: false,
              error: this.parseError(error),
              metrics: { executionTime: performance.now() - startTime, iterationCount: 0 },
            });
          });
      } catch (error) {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: this.parseError(error),
          metrics: { executionTime: performance.now() - startTime, iterationCount: 0 },
        });
      }
    });
  }

  private parseError(error: unknown): ExecutionError {
    if (error instanceof Error) {
      const stackMatch = error.stack?.match(/<anonymous>:(\d+):(\d+)/);
      const lineStr = stackMatch?.[1];
      const colStr = stackMatch?.[2];
      const line = lineStr ? parseInt(lineStr, 10) - 3 : undefined;
      const column = colStr ? parseInt(colStr, 10) : undefined;

      let type: ExecutionError['type'] = 'runtime';
      if (error instanceof SyntaxError) {
        type = 'syntax';
      } else if (error.message.includes('iteration limit')) {
        type = 'iteration-limit';
      }

      return { type, message: error.message, line, column, stack: error.stack };
    }

    return { type: 'runtime', message: String(error) };
  }

  clearCache(): void {
    this.proxyCache = new WeakMap();
  }
}

// Default singleton
export const sandbox = new Sandbox();
