'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

export type CommentEmojiType = 'heart' | 'laugh' | 'wow' | 'sad' | 'angry' | 'clap';

interface CommentEmojiPickerProps {
  currentEmoji?: CommentEmojiType;
  counts: Record<CommentEmojiType, number>;
  onReact: (emoji: CommentEmojiType) => void;
  disabled?: boolean;
  compact?: boolean;
}

const EMOJIS: Array<{
  type: CommentEmojiType;
  emoji: string;
  label: string;
  color: string;
}> = [
  { type: 'heart', emoji: '❤️', label: 'Heart', color: 'text-red-500' },
  { type: 'laugh', emoji: '😂', label: 'Laugh', color: 'text-yellow-500' },
  { type: 'wow', emoji: '😮', label: 'Wow', color: 'text-blue-500' },
  { type: 'sad', emoji: '😢', label: 'Sad', color: 'text-blue-400' },
  { type: 'angry', emoji: '😡', label: 'Angry', color: 'text-red-600' },
  { type: 'clap', emoji: '👏', label: 'Clap', color: 'text-yellow-600' },
];

export function CommentEmojiPicker({
  currentEmoji,
  counts,
  onReact,
  disabled = false,
  compact = false,
}: CommentEmojiPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [animatingEmoji, setAnimatingEmoji] = useState<CommentEmojiType | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowPicker(false);
      }
    };
    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPicker]);

  const handleReact = useCallback(
    (emojiType: CommentEmojiType) => {
      if (disabled) return;

      // Trigger animation
      setAnimatingEmoji(emojiType);
      setTimeout(() => setAnimatingEmoji(null), 600);

      onReact(emojiType);
      setShowPicker(false);
    },
    [disabled, onReact]
  );

  // Get top reactions to display
  const topReactions = EMOJIS.filter((e) => counts[e.type] > 0)
    .sort((a, b) => counts[b.type] - counts[a.type])
    .slice(0, 3);

  const totalReactions = Object.values(counts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="relative" ref={pickerRef}>
      <div className="flex items-center gap-1">
        {/* Show top reactions inline */}
        {topReactions.length > 0 && !compact && (
          <div className="flex items-center gap-0.5 mr-1">
            {topReactions.map((emoji) => (
              <button
                key={emoji.type}
                onClick={() => handleReact(emoji.type)}
                disabled={disabled}
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full hover:bg-surface transition-all',
                  currentEmoji === emoji.type && 'bg-surface ring-1 ring-accent/30',
                  animatingEmoji === emoji.type && 'animate-bounce',
                  disabled && 'cursor-not-allowed opacity-50'
                )}
                title={emoji.label}
              >
                <span className="inline-block">{emoji.emoji}</span>
                <span className="text-text-muted ml-0.5">{counts[emoji.type]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Reaction button */}
        <button
          onClick={() => setShowPicker(!showPicker)}
          onMouseEnter={() => !disabled && setShowPicker(true)}
          disabled={disabled}
          className={cn(
            'text-text-muted hover:text-text-primary text-xs font-medium px-2 py-1 rounded-md hover:bg-surface transition-colors flex items-center gap-1',
            disabled && 'cursor-not-allowed opacity-50',
            showPicker && 'bg-surface text-text-primary'
          )}
        >
          {currentEmoji ? (
            <>
              <span className="text-base">
                {EMOJIS.find((e) => e.type === currentEmoji)?.emoji}
              </span>
              {!compact && <span>React</span>}
            </>
          ) : (
            <>
              <span className="text-base">😊</span>
              {!compact && <span>React</span>}
            </>
          )}
        </button>

        {/* Total count for compact mode */}
        {compact && totalReactions > 0 && (
          <span className="text-text-muted text-xs">
            {totalReactions}
          </span>
        )}
      </div>

      {/* Emoji picker popup */}
      {showPicker && !disabled && (
        <div className="absolute left-0 bottom-full mb-2 p-2 bg-surface border border-border rounded-lg shadow-lg z-20 flex gap-1">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji.type}
              onClick={() => handleReact(emoji.type)}
              className={cn(
                'text-2xl p-2 rounded-lg hover:bg-surface-hover transition-all transform hover:scale-110',
                currentEmoji === emoji.type && 'ring-2 ring-accent bg-surface-hover'
              )}
              title={emoji.label}
            >
              <span className="inline-block">{emoji.emoji}</span>
            </button>
          ))}
        </div>
      )}

      {/* Floating animation */}
      {animatingEmoji && (
        <div className="absolute left-0 bottom-full pointer-events-none">
          <div className="text-2xl animate-float-up">
            {EMOJIS.find((e) => e.type === animatingEmoji)?.emoji}
          </div>
        </div>
      )}
    </div>
  );
}
