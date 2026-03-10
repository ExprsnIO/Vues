'use client';

import Link from 'next/link';
import { isValidHandle } from '@/lib/mention-utils';

interface CommentTextProps {
  text: string;
}

/**
 * Renders comment text with clickable @mentions
 */
export function CommentText({ text }: CommentTextProps) {
  // Parse text for @mentions - regex captures the @ symbol and handle
  const parts = text.split(/(@[\w.-]+)/g);

  return (
    <p className="text-text-primary text-sm mt-1 whitespace-pre-wrap break-words">
      {parts.map((part, index) => {
        // Check if part is a mention and validate handle format
        if (part.startsWith('@')) {
          const handle = part.slice(1);

          // Only render as link if valid handle format
          if (isValidHandle(handle)) {
            return (
              <Link
                key={index}
                href={`/@${handle}`}
                className="text-accent hover:text-accent-hover font-medium hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {part}
              </Link>
            );
          }
        }

        // Regular text
        return <span key={index}>{part}</span>;
      })}
    </p>
  );
}
