'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { twMerge } from 'tailwind-merge';

interface Step2EditDetailsProps {
  title: string;
  description: string;
  tags: string[];
  onUpdate: (data: { title: string; description: string; tags: string[] }) => void;
  onNext: () => void;
  onBack: () => void;
}

interface TagSuggestion {
  tag: string;
  count: number;
}

// Mock trending tags - in production, fetch from API
const TRENDING_TAGS: TagSuggestion[] = [
  { tag: 'comedy', count: 15420 },
  { tag: 'dance', count: 12890 },
  { tag: 'tutorial', count: 11230 },
  { tag: 'cooking', count: 9870 },
  { tag: 'gaming', count: 8450 },
  { tag: 'fitness', count: 7320 },
  { tag: 'art', count: 6890 },
  { tag: 'music', count: 6210 },
];

export function Step2EditDetails({
  title,
  description,
  tags,
  onUpdate,
  onNext,
  onBack,
}: Step2EditDetailsProps) {
  const [localTitle, setLocalTitle] = useState(title);
  const [localDescription, setLocalDescription] = useState(description);
  const [localTags, setLocalTags] = useState<string[]>(tags);
  const [tagInput, setTagInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on input
  const filteredSuggestions = tagInput.trim()
    ? TRENDING_TAGS.filter(
        (t) =>
          t.tag.toLowerCase().includes(tagInput.toLowerCase()) &&
          !localTags.includes(t.tag)
      ).slice(0, 8)
    : TRENDING_TAGS.filter((t) => !localTags.includes(t.tag)).slice(0, 8);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        tagInputRef.current &&
        !tagInputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-save changes
  useEffect(() => {
    const timer = setTimeout(() => {
      onUpdate({
        title: localTitle,
        description: localDescription,
        tags: localTags,
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [localTitle, localDescription, localTags, onUpdate]);

  const handleAddTag = useCallback(
    (tag: string) => {
      const normalizedTag = tag.trim().toLowerCase().replace(/^#/, '');
      if (normalizedTag && !localTags.includes(normalizedTag) && localTags.length < 10) {
        setLocalTags([...localTags, normalizedTag]);
        setTagInput('');
        setShowSuggestions(false);
        tagInputRef.current?.focus();
      }
    },
    [localTags]
  );

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setLocalTags((prev) => prev.filter((t) => t !== tagToRemove));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (tagInput.trim()) {
          handleAddTag(tagInput);
        }
      } else if (e.key === 'Backspace' && !tagInput && localTags.length > 0) {
        handleRemoveTag(localTags[localTags.length - 1]);
      }
    },
    [tagInput, localTags, handleAddTag, handleRemoveTag]
  );

  const canProceed = localTitle.trim().length > 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Add details</h2>
        <p className="text-gray-400">Make your video discoverable</p>
      </div>

      <div className="space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            maxLength={100}
            placeholder="Give your video a catchy title"
            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <div className="flex justify-between mt-1">
            <p className="text-xs text-gray-500">
              A good title helps viewers find your video
            </p>
            <p className="text-xs text-gray-500">{localTitle.length}/100</p>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Description
          </label>
          <textarea
            value={localDescription}
            onChange={(e) => setLocalDescription(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="Tell viewers what your video is about..."
            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
          <div className="flex justify-between mt-1">
            <p className="text-xs text-gray-500">Add hashtags, mentions, or links</p>
            <p className="text-xs text-gray-500">{localDescription.length}/2000</p>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Tags
          </label>

          {/* Selected tags */}
          {localTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {localTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-white rounded-full text-sm"
                >
                  #{tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-red-400 transition-colors"
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Tag input with autocomplete */}
          <div className="relative">
            <div className="flex gap-2">
              <input
                ref={tagInputRef}
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={handleKeyDown}
                disabled={localTags.length >= 10}
                placeholder={
                  localTags.length >= 10
                    ? 'Maximum 10 tags reached'
                    : 'Add a tag...'
                }
                className="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={() => handleAddTag(tagInput)}
                disabled={!tagInput.trim() || localTags.length >= 10}
                className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
              >
                Add
              </button>
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-10 w-full mt-2 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl max-h-64 overflow-y-auto"
              >
                <div className="p-2">
                  <p className="text-xs font-medium text-gray-400 px-2 py-1 mb-1">
                    {tagInput ? 'Matching tags' : 'Trending tags'}
                  </p>
                  {filteredSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.tag}
                      onClick={() => handleAddTag(suggestion.tag)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-800 rounded-lg transition-colors text-left"
                    >
                      <span className="text-white">#{suggestion.tag}</span>
                      <span className="text-xs text-gray-500">
                        {suggestion.count.toLocaleString()} posts
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500 mt-1">
            Add up to 10 tags to help people discover your video{' '}
            <span className="text-gray-400">
              ({localTags.length}/10)
            </span>
          </p>
        </div>

        {/* Tips */}
        <div className="mt-8 p-4 bg-blue-900/20 border border-blue-700/30 rounded-lg">
          <div className="flex gap-3">
            <TipIcon className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-200 mb-2">
                Tips for better engagement
              </p>
              <ul className="text-xs text-blue-300 space-y-1">
                <li>Use descriptive titles that grab attention</li>
                <li>Add relevant tags to reach the right audience</li>
                <li>Include keywords that people might search for</li>
                <li>Keep descriptions clear and engaging</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-8 flex justify-between gap-3">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-lg transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="px-8 py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-zinc-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function TipIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
      />
    </svg>
  );
}
