'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'exprsn_search_history';
const MAX_HISTORY_ITEMS = 10;

export interface SearchHistoryItem {
  query: string;
  type: 'videos' | 'users' | 'sounds' | 'all';
  timestamp: number;
}

export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SearchHistoryItem[];
        setHistory(parsed);
      }
    } catch (error) {
      console.error('Failed to load search history:', error);
      setHistory([]);
    }
  }, []);

  // Add a search to history
  const addSearch = useCallback((query: string, type: 'videos' | 'users' | 'sounds' | 'all' = 'all') => {
    if (!query.trim()) return;

    setHistory((prev) => {
      // Remove duplicate if exists
      const filtered = prev.filter((item) =>
        !(item.query.toLowerCase() === query.toLowerCase() && item.type === type)
      );

      // Add new item at the beginning
      const newHistory = [
        { query: query.trim(), type, timestamp: Date.now() },
        ...filtered,
      ].slice(0, MAX_HISTORY_ITEMS);

      // Save to localStorage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
      } catch (error) {
        console.error('Failed to save search history:', error);
      }

      return newHistory;
    });
  }, []);

  // Remove a specific item from history
  const removeItem = useCallback((index: number) => {
    setHistory((prev) => {
      const newHistory = prev.filter((_, i) => i !== index);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
      } catch (error) {
        console.error('Failed to update search history:', error);
      }

      return newHistory;
    });
  }, []);

  // Clear all history
  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear search history:', error);
    }
  }, []);

  return {
    history,
    addSearch,
    removeItem,
    clearHistory,
  };
}
