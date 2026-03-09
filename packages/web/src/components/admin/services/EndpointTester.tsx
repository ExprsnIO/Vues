// @ts-nocheck
'use client';

import { useState } from 'react';
import { Badge, FormField, Input } from '@/components/admin/ui';

interface TestResult {
  success: boolean;
  status?: number;
  statusText?: string;
  responseTime: number;
  headers?: Record<string, string>;
  body?: string;
  error?: string;
}

interface EndpointTesterProps {
  defaultEndpoint?: string;
  defaultMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
  onTest?: (endpoint: string, method: string, headers?: Record<string, string>, body?: string) => Promise<TestResult>;
}

export function EndpointTester({
  defaultEndpoint = '',
  defaultMethod = 'GET',
  onTest,
}: EndpointTesterProps) {
  const [endpoint, setEndpoint] = useState(defaultEndpoint);
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'>(defaultMethod);
  const [headers, setHeaders] = useState('');
  const [body, setBody] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const runTest = async () => {
    if (!endpoint) return;

    setIsTesting(true);
    setResult(null);

    try {
      let parsedHeaders: Record<string, string> | undefined;
      if (headers.trim()) {
        try {
          parsedHeaders = JSON.parse(headers);
        } catch {
          setResult({ success: false, error: 'Invalid JSON in headers', responseTime: 0 });
          setIsTesting(false);
          return;
        }
      }

      if (onTest) {
        const testResult = await onTest(endpoint, method, parsedHeaders, body || undefined);
        setResult(testResult);
      } else {
        // Default fetch-based test
        const startTime = performance.now();
        try {
          const response = await fetch(endpoint, {
            method,
            headers: {
              'Content-Type': 'application/json',
              ...parsedHeaders,
            },
            body: method !== 'GET' && method !== 'HEAD' && body ? body : undefined,
          });
          const endTime = performance.now();
          const responseBody = await response.text();

          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });

          setResult({
            success: response.ok,
            status: response.status,
            statusText: response.statusText,
            responseTime: Math.round(endTime - startTime),
            headers: responseHeaders,
            body: responseBody,
          });
        } catch (err) {
          const endTime = performance.now();
          setResult({
            success: false,
            responseTime: Math.round(endTime - startTime),
            error: err instanceof Error ? err.message : 'Request failed',
          });
        }
      }
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-text-primary">Endpoint Tester</h4>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-accent hover:underline"
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced
        </button>
      </div>

      <div className="flex gap-2">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as any)}
          className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="HEAD">HEAD</option>
        </select>
        <Input
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://api.example.com/health"
          className="flex-1"
        />
        <button
          onClick={runTest}
          disabled={!endpoint || isTesting}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
        >
          {isTesting ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            'Test'
          )}
        </button>
      </div>

      {showAdvanced && (
        <div className="space-y-3 pt-3 border-t border-border">
          <FormField label="Headers (JSON)">
            <textarea
              value={headers}
              onChange={(e) => setHeaders(e.target.value)}
              placeholder='{"Authorization": "Bearer token"}'
              rows={3}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </FormField>

          {method !== 'GET' && method !== 'HEAD' && (
            <FormField label="Request Body">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='{"key": "value"}'
                rows={4}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </FormField>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${result.success ? 'bg-green-500' : 'bg-red-500'}`} />
              {result.status && (
                <Badge variant={result.success ? 'success' : 'danger'}>
                  {result.status} {result.statusText}
                </Badge>
              )}
            </div>
            <span className={`text-sm font-medium ${
              result.responseTime < 100 ? 'text-green-500' :
              result.responseTime < 500 ? 'text-yellow-500' : 'text-red-500'
            }`}>
              {result.responseTime}ms
            </span>
          </div>

          {result.error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-500">{result.error}</p>
            </div>
          )}

          {result.headers && Object.keys(result.headers).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-muted uppercase">Response Headers</p>
              <div className="p-3 bg-surface-hover rounded-lg overflow-x-auto">
                <pre className="text-xs font-mono text-text-muted">
                  {Object.entries(result.headers).map(([key, value]) => (
                    <div key={key}>
                      <span className="text-text-primary">{key}:</span> {value}
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          )}

          {result.body && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-muted uppercase">Response Body</p>
              <div className="p-3 bg-surface-hover rounded-lg overflow-x-auto max-h-64">
                <pre className="text-xs font-mono text-text-primary whitespace-pre-wrap">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(result.body), null, 2);
                    } catch {
                      return result.body;
                    }
                  })()}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EndpointTester;
