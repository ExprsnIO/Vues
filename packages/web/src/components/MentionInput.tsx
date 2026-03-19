'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  className?: string;
  onSubmit?: () => void;
}

interface TriggerState {
  type: '@' | '#';
  startIndex: number;
  query: string;
}

interface DropdownItem {
  label: string;
  secondary?: string;
  avatar?: string;
  insertText: string;
}

const DROPDOWN_MAX = 6;

export function MentionInput({
  value,
  onChange,
  placeholder,
  maxLength,
  multiline = false,
  className = '',
  onSubmit,
}: MentionInputProps) {
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [trigger, setTrigger] = useState<TriggerState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  // Typeahead query — only fires when there's an active trigger
  const { data: typeaheadData } = useQuery({
    queryKey: ['typeahead', trigger?.type, trigger?.query],
    queryFn: () =>
      api.searchTypeahead(trigger!.query, trigger!.type === '@' ? 'users' : 'tags'),
    enabled: !!trigger && trigger.query.length >= 1,
    staleTime: 10_000,
  });

  const dropdownItems: DropdownItem[] = (typeaheadData?.results ?? [])
    .slice(0, DROPDOWN_MAX)
    .map((r) => {
      if (trigger?.type === '@') {
        return {
          label: r.displayName || `@${r.handle}`,
          secondary: r.handle ? `@${r.handle}` : undefined,
          avatar: r.avatar,
          insertText: `@${r.handle}`,
        };
      }
      return {
        label: `#${r.tag}`,
        secondary: r.videoCount !== undefined ? `${r.videoCount} videos` : undefined,
        insertText: `#${r.tag}`,
      };
    });

  // Reset selected index whenever results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [typeaheadData]);

  // Detect trigger character from current cursor position
  const detectTrigger = useCallback((text: string, cursorPos: number) => {
    const before = text.slice(0, cursorPos);
    // Walk backwards from cursor looking for @ or # not preceded by a word char
    const match = before.match(/(?:^|[\s\n])([#@])(\w*)$/);
    if (!match) {
      setTrigger(null);
      return;
    }
    const fullMatch = match[0];
    const triggerChar = match[1] as '@' | '#';
    const query = match[2];
    const startIndex = cursorPos - query.length - 1;
    setTrigger({ type: triggerChar, startIndex, query });
    updateDropdownPosition(cursorPos);
  }, []);

  const updateDropdownPosition = (cursorPos: number) => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Simple position: anchor to bottom-left of the input element.
    // For a more precise caret position a hidden mirror element would be needed,
    // but this gives a clean, predictable UX.
    setDropdownPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const newValue = e.target.value;
    if (maxLength && newValue.length > maxLength) return;
    onChange(newValue);
    detectTrigger(newValue, e.target.selectionStart ?? newValue.length);
  };

  const insertItem = useCallback(
    (item: DropdownItem) => {
      if (!trigger) return;
      const el = inputRef.current;
      const cursorPos = el?.selectionStart ?? value.length;

      // Replace from the trigger character up to the cursor
      const before = value.slice(0, trigger.startIndex);
      const after = value.slice(cursorPos);
      const newValue = `${before}${item.insertText} ${after}`;
      onChange(newValue);

      // Move cursor after inserted text + space
      const newCursor = trigger.startIndex + item.insertText.length + 1;
      requestAnimationFrame(() => {
        if (el) {
          el.focus();
          el.setSelectionRange(newCursor, newCursor);
        }
      });

      setTrigger(null);
    },
    [trigger, value, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (trigger && dropdownItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, dropdownItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertItem(dropdownItems[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setTrigger(null);
        return;
      }
    }

    if (!multiline && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setTrigger(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Render highlighted value as overlay is complex in plain inputs — instead we render a
  // read-only highlighted div behind the transparent textarea/input for the highlights.
  const renderHighlighted = (text: string) => {
    const parts: React.ReactNode[] = [];
    const regex = /(@\w+|#\w+)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      const isMention = m[1].startsWith('@');
      parts.push(
        <mark
          key={m.index}
          className={
            isMention
              ? 'bg-transparent text-blue-400 font-medium'
              : 'bg-transparent text-accent font-medium'
          }
        >
          {m[1]}
        </mark>
      );
      last = m.index + m[1].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    // Append a zero-width space so the div height matches even on empty last line
    parts.push('\u200B');
    return parts;
  };

  const sharedClasses = `w-full bg-transparent resize-none outline-none text-text-primary placeholder-text-muted ${className}`;

  const isOpen = !!trigger && dropdownItems.length > 0;

  return (
    <div className="relative">
      {/* Highlight mirror layer */}
      <div
        aria-hidden
        className={`absolute inset-0 pointer-events-none overflow-hidden whitespace-pre-wrap break-words text-sm leading-6 px-3 py-2 ${sharedClasses}`}
        style={{ color: 'transparent' }}
      >
        {renderHighlighted(value)}
      </div>

      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={3}
          className={`relative text-sm leading-6 px-3 py-2 ${sharedClasses}`}
          style={{ caretColor: 'white' }}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          className={`relative text-sm leading-6 px-3 py-2 ${sharedClasses}`}
          style={{ caretColor: 'white' }}
        />
      )}

      {/* Autocomplete dropdown */}
      {isOpen && dropdownPos && (
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left }}
          className="z-50 min-w-[200px] max-w-xs bg-surface border border-border rounded-lg shadow-xl overflow-hidden"
        >
          <div className="py-1">
            {dropdownItems.map((item, idx) => (
              <button
                key={item.insertText}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent blur on input
                  insertItem(item);
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                  idx === selectedIndex ? 'bg-surface-hover' : 'hover:bg-surface-hover'
                }`}
              >
                {/* Avatar / icon */}
                {trigger?.type === '@' ? (
                  <div className="w-7 h-7 rounded-full bg-surface-hover flex-shrink-0 overflow-hidden">
                    {item.avatar ? (
                      <img src={item.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-xs font-semibold text-text-muted">
                        {item.label[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-accent/20 flex-shrink-0 flex items-center justify-center">
                    <span className="text-accent text-sm font-bold">#</span>
                  </div>
                )}

                <div className="min-w-0">
                  <p className="text-sm text-text-primary font-medium truncate">{item.label}</p>
                  {item.secondary && (
                    <p className="text-xs text-text-muted truncate">{item.secondary}</p>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Hint */}
          <div className="px-3 py-1.5 border-t border-border">
            <p className="text-xs text-text-muted">
              {String.fromCharCode(8593)}{String.fromCharCode(8595)} navigate &nbsp;&middot;&nbsp; Enter select &nbsp;&middot;&nbsp; Esc close
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
