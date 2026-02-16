'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

interface CommentInputProps {
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  isSubmitting?: boolean;
  autoFocus?: boolean;
}

export function CommentInput({
  onSubmit,
  onCancel,
  placeholder = 'Add a comment...',
  isSubmitting = false,
  autoFocus = false,
}: CommentInputProps) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = useCallback(() => {
    if (!text.trim() || isSubmitting) return;
    onSubmit(text.trim());
    setText('');
  }, [text, isSubmitting, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape' && onCancel) {
        onCancel();
      }
    },
    [handleSubmit, onCancel]
  );

  if (!user) {
    return (
      <div className="text-center py-2 text-text-muted text-sm">
        <a href="/login" className="text-accent hover:text-accent-hover font-medium">
          Log in
        </a>{' '}
        to comment
      </div>
    );
  }

  return (
    <div className="flex gap-3 items-end">
      {/* User avatar */}
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
          <span className="text-text-primary font-medium text-sm">
            {user.handle[0]?.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Input area */}
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={500}
          rows={1}
          className="w-full bg-surface text-text-primary placeholder-text-muted rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
          style={{
            minHeight: '36px',
            maxHeight: '120px',
          }}
        />
        <span className="absolute right-2 bottom-1 text-text-muted text-xs">
          {text.length}/500
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-text-muted hover:text-text-primary text-sm font-medium rounded-lg"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || isSubmitting}
          className="px-4 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-text-inverse text-sm font-medium rounded-lg transition-colors"
        >
          {isSubmitting ? 'Posting...' : 'Post'}
        </button>
      </div>
    </div>
  );
}
