'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface UserMention {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
}

export function MentionInput({
  value,
  onChange,
  onKeyDown,
  placeholder = 'Add a comment...',
  maxLength = 500,
  autoFocus = false,
  textareaRef: externalRef,
}: MentionInputProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef || internalRef;
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<UserMention[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [isSearching, setIsSearching] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [value, textareaRef]);

  // Search for users when @ is typed
  useEffect(() => {
    if (mentionQuery.length > 0) {
      setIsSearching(true);
      const debounce = setTimeout(async () => {
        try {
          const result = await api.searchUsers(mentionQuery, { limit: 5 });
          setSuggestions(result.users);
        } catch (error) {
          console.error('Failed to search users:', error);
          setSuggestions([]);
        } finally {
          setIsSearching(false);
        }
      }, 300);
      return () => clearTimeout(debounce);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [mentionQuery]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);

      const textarea = e.target;
      const cursorPos = textarea.selectionStart;

      // Check if we're typing after an @
      const textBeforeCursor = newValue.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');

      if (lastAtIndex !== -1) {
        const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
        // Only show suggestions if there's no space after @
        if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
          setMentionStart(lastAtIndex);
          setMentionQuery(textAfterAt);
          setShowSuggestions(true);
          setSelectedIndex(0);
        } else {
          setShowSuggestions(false);
          setMentionQuery('');
        }
      } else {
        setShowSuggestions(false);
        setMentionQuery('');
      }
    },
    [onChange]
  );

  const insertMention = useCallback(
    (user: UserMention) => {
      if (mentionStart === -1) return;

      const textarea = textareaRef.current;
      if (!textarea) return;

      const mention = `@${user.handle}`;
      const beforeMention = value.slice(0, mentionStart);
      const afterMention = value.slice(textarea.selectionStart);
      const newValue = beforeMention + mention + ' ' + afterMention;

      onChange(newValue);
      setShowSuggestions(false);
      setMentionQuery('');
      setMentionStart(-1);

      // Set cursor position after mention
      setTimeout(() => {
        const newCursorPos = mentionStart + mention.length + 1;
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    [mentionStart, onChange, value, textareaRef]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showSuggestions && suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          insertMention(suggestions[selectedIndex]);
          return;
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setShowSuggestions(false);
          setMentionQuery('');
          return;
        }
      }

      onKeyDown?.(e);
    },
    [showSuggestions, suggestions, selectedIndex, insertMention, onKeyDown]
  );

  return (
    <div className="relative flex-1">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={1}
        autoFocus={autoFocus}
        className="w-full bg-surface text-text-primary placeholder-text-muted rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
        style={{
          minHeight: '36px',
          maxHeight: '120px',
        }}
      />
      <span className="absolute right-2 bottom-1 text-text-muted text-xs pointer-events-none">
        {value.length}/{maxLength}
      </span>

      {/* Mention suggestions popup */}
      {showSuggestions && (suggestions.length > 0 || isSearching) && (
        <div
          ref={suggestionsRef}
          className="absolute left-0 bottom-full mb-1 w-full max-w-sm bg-surface border border-border rounded-lg shadow-lg overflow-hidden z-50"
        >
          {isSearching ? (
            <div className="px-4 py-3 text-text-muted text-sm">Searching...</div>
          ) : suggestions.length > 0 ? (
            suggestions.map((user, index) => (
              <button
                key={user.did}
                onClick={() => insertMention(user)}
                className={cn(
                  'w-full px-4 py-2 flex items-center gap-3 hover:bg-surface-hover transition-colors text-left',
                  selectedIndex === index && 'bg-surface-hover'
                )}
              >
                <div className="w-8 h-8 rounded-full bg-surface-hover overflow-hidden flex-shrink-0">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.handle}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-primary font-medium text-sm">
                      {user.handle[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-text-primary text-sm font-medium truncate">
                    {user.displayName || user.handle}
                  </div>
                  <div className="text-text-muted text-xs truncate">@{user.handle}</div>
                </div>
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-text-muted text-sm">No users found</div>
          )}
        </div>
      )}
    </div>
  );
}
