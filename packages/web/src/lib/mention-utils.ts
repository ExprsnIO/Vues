/**
 * Utilities for parsing and rendering @mentions in text
 */

/**
 * Parse text and extract all @mentions
 * Returns array of handles found in text
 */
export function extractMentions(text: string): string[] {
  const mentionRegex = /@([\w.-]+)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

/**
 * Check if a string contains any @mentions
 */
export function hasMentions(text: string): boolean {
  return /@[\w.-]+/.test(text);
}

/**
 * Replace @mentions in text with formatted links (for server-side rendering)
 */
export function formatMentionsAsHTML(text: string): string {
  return text.replace(
    /@([\w.-]+)/g,
    '<a href="/@$1" class="text-accent hover:text-accent-hover font-medium">@$1</a>'
  );
}

/**
 * Validate a handle format
 */
export function isValidHandle(handle: string): boolean {
  // Handle must be 3-50 characters, alphanumeric plus dots and hyphens
  return /^[\w.-]{3,50}$/.test(handle);
}

/**
 * Extract and validate mentions from text
 * Returns only valid mentions
 */
export function extractValidMentions(text: string): string[] {
  const mentions = extractMentions(text);
  return mentions.filter(isValidHandle);
}

/**
 * Count mentions in text
 */
export function countMentions(text: string): number {
  return extractMentions(text).length;
}
