'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { expressionEngine } from '@/engine/scripting';
import type { ExpressionContext } from '@/engine/scripting/ExpressionEngine';

interface ExpressionEditorProps {
  expression: string;
  onExpressionChange: (expression: string) => void;
  context?: Partial<ExpressionContext>;
  placeholder?: string;
  compact?: boolean;
}

/**
 * Expression editor with validation and preview
 */
export function ExpressionEditor({
  expression,
  onExpressionChange,
  context,
  placeholder = 'Enter expression (e.g., wiggle(5, 10))',
  compact = false,
}: ExpressionEditorProps) {
  const [localExpression, setLocalExpression] = useState(expression);
  const [isValid, setIsValid] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewValue, setPreviewValue] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Validate expression when it changes
  useEffect(() => {
    if (!localExpression.trim()) {
      setIsValid(true);
      setErrorMessage(null);
      setPreviewValue(null);
      return;
    }

    const validation = expressionEngine.validate(localExpression);
    setIsValid(validation.valid);
    setErrorMessage(validation.error || null);

    // Try to evaluate for preview
    if (validation.valid && context) {
      try {
        const result = expressionEngine.evaluate(localExpression, {
          time: context.time ?? 0,
          frame: context.frame ?? 0,
          fps: context.fps ?? 30,
          duration: context.duration ?? 10,
          width: context.width ?? 1080,
          height: context.height ?? 1920,
          value: context.value,
          propertyName: context.propertyName,
          ...context,
        });

        if (result.success) {
          const val = result.value;
          if (typeof val === 'number') {
            setPreviewValue(val.toFixed(2));
          } else if (typeof val === 'object' && val !== null) {
            setPreviewValue(JSON.stringify(val));
          } else {
            setPreviewValue(String(val));
          }
        } else {
          setPreviewValue(null);
        }
      } catch {
        setPreviewValue(null);
      }
    }
  }, [localExpression, context]);

  // Debounced update
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setLocalExpression(value);
  }, []);

  // Commit on blur
  const handleBlur = useCallback(() => {
    if (localExpression !== expression) {
      onExpressionChange(localExpression);
    }
  }, [localExpression, expression, onExpressionChange]);

  // Insert snippet at cursor
  const insertSnippet = useCallback((snippet: string) => {
    const input = inputRef.current;
    if (!input) return;

    const start = input.selectionStart;
    const end = input.selectionEnd;
    const newValue = localExpression.substring(0, start) + snippet + localExpression.substring(end);
    setLocalExpression(newValue);
    onExpressionChange(newValue);

    // Restore focus and cursor position
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + snippet.length, start + snippet.length);
    }, 0);
  }, [localExpression, onExpressionChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-text-muted">Expression</label>
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="text-xs text-accent hover:text-accent-hover"
        >
          {showHelp ? 'Hide Help' : 'Show Help'}
        </button>
      </div>

      <div className="relative">
        <textarea
          ref={inputRef}
          value={localExpression}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={`w-full bg-surface border rounded-lg px-3 py-2 text-sm font-mono resize-none outline-none transition-colors ${
            compact ? 'h-10' : 'h-20'
          } ${
            !localExpression.trim()
              ? 'border-border'
              : isValid
              ? 'border-green-500/50'
              : 'border-red-500/50'
          } focus:border-accent`}
          spellCheck={false}
        />

        {/* Status indicator */}
        {localExpression.trim() && (
          <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${isValid ? 'bg-green-500' : 'bg-red-500'}`} />
        )}
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">
          {errorMessage}
        </div>
      )}

      {/* Preview value */}
      {previewValue && isValid && (
        <div className="text-xs text-green-400 bg-green-500/10 rounded px-2 py-1">
          Preview: {previewValue}
        </div>
      )}

      {/* Help panel */}
      {showHelp && (
        <div className="bg-surface border border-border rounded-lg p-3 space-y-3">
          <div className="text-xs text-text-muted mb-2">Quick Insert:</div>

          {/* Common functions */}
          <div className="grid grid-cols-2 gap-1">
            {[
              { label: 'wiggle()', snippet: 'wiggle(5, 10)', desc: 'Random motion' },
              { label: 'loopIn()', snippet: 'loopIn("cycle")', desc: 'Loop before' },
              { label: 'loopOut()', snippet: 'loopOut("cycle")', desc: 'Loop after' },
              { label: 'ease()', snippet: 'ease(time, 0, 1, 0, 100)', desc: 'Smooth interpolation' },
              { label: 'sin()', snippet: 'sin(time * 2 * Math.PI)', desc: 'Sine wave' },
              { label: 'cos()', snippet: 'cos(time * 2 * Math.PI)', desc: 'Cosine wave' },
              { label: 'random()', snippet: 'random(0, 100)', desc: 'Random value' },
              { label: 'noise()', snippet: 'noise(time)', desc: 'Perlin noise' },
            ].map(({ label, snippet, desc }) => (
              <button
                key={label}
                type="button"
                onClick={() => insertSnippet(snippet)}
                className="text-left px-2 py-1.5 bg-background rounded hover:bg-surface-hover transition-colors"
              >
                <div className="text-xs font-mono text-accent">{label}</div>
                <div className="text-[10px] text-text-muted">{desc}</div>
              </button>
            ))}
          </div>

          {/* Variables */}
          <div className="border-t border-border pt-2 mt-2">
            <div className="text-xs text-text-muted mb-1">Available Variables:</div>
            <div className="flex flex-wrap gap-1">
              {['time', 'frame', 'fps', 'duration', 'value', 'width', 'height'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertSnippet(v)}
                  className="px-2 py-0.5 bg-background rounded text-xs font-mono text-text-primary hover:bg-accent hover:text-white transition-colors"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Examples */}
          <div className="border-t border-border pt-2 mt-2">
            <div className="text-xs text-text-muted mb-1">Examples:</div>
            <div className="space-y-1 text-[10px] font-mono text-text-muted">
              <div className="cursor-pointer hover:text-text-primary" onClick={() => insertSnippet('value + sin(time * 2) * 50')}>
                <span className="text-accent">Oscillate:</span> value + sin(time * 2) * 50
              </div>
              <div className="cursor-pointer hover:text-text-primary" onClick={() => insertSnippet('wiggle(3, 20)')}>
                <span className="text-accent">Shake:</span> wiggle(3, 20)
              </div>
              <div className="cursor-pointer hover:text-text-primary" onClick={() => insertSnippet('time < 1 ? ease(time, 0, 1, 0, 100) : 100')}>
                <span className="text-accent">Animate in:</span> time &lt; 1 ? ease(...) : 100
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact expression toggle for keyframe items
 */
export function ExpressionToggle({
  hasExpression,
  expression,
  onToggle,
  onEdit,
}: {
  hasExpression: boolean;
  expression?: string;
  onToggle: () => void;
  onEdit: (expression: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (!hasExpression && !isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="p-1 text-text-muted hover:text-accent transition-colors"
        title="Add expression"
      >
        <ExpressionIcon className="w-4 h-4" />
      </button>
    );
  }

  if (isEditing) {
    return (
      <div className="absolute right-0 top-full mt-1 w-64 z-10">
        <div className="bg-background-alt border border-border rounded-lg p-2 shadow-lg">
          <ExpressionEditor
            expression={expression || ''}
            onExpressionChange={(expr) => {
              onEdit(expr);
              if (!expr.trim()) {
                setIsEditing(false);
              }
            }}
            compact
          />
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-xs text-text-muted hover:text-text-primary"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className="p-1 text-accent hover:text-accent-hover transition-colors"
      title={expression ? `Edit: ${expression}` : 'Edit expression'}
    >
      <ExpressionIcon className="w-4 h-4" />
    </button>
  );
}

function ExpressionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 17l6-6-6-6" />
      <path d="M12 19h8" />
    </svg>
  );
}
