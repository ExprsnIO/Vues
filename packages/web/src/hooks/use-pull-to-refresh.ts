import { useEffect, useRef, useState, useCallback } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number; // Distance in pixels to trigger refresh
  resistance?: number; // Pull resistance factor (higher = harder to pull)
  enabled?: boolean;
}

interface UsePullToRefreshReturn {
  isPulling: boolean;
  isRefreshing: boolean;
  pullDistance: number;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  resistance = 2.5,
  enabled = true,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const startY = useRef(0);
  const currentY = useRef(0);
  const scrollElement = useRef<HTMLElement | null>(null);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled || isRefreshing) return;

      const element = e.target as HTMLElement;
      scrollElement.current = element.closest('.snap-feed') as HTMLElement;

      // Only allow pull-to-refresh when at the top of the scroll container
      if (scrollElement.current && scrollElement.current.scrollTop === 0) {
        startY.current = e.touches[0].clientY;
        currentY.current = startY.current;
      }
    },
    [enabled, isRefreshing]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!enabled || isRefreshing || !scrollElement.current || startY.current === 0) return;

      currentY.current = e.touches[0].clientY;
      const diff = currentY.current - startY.current;

      // Only track downward pulls when at the top
      if (diff > 0 && scrollElement.current.scrollTop === 0) {
        e.preventDefault();
        setIsPulling(true);

        // Apply resistance to the pull
        const distance = Math.min(diff / resistance, threshold * 1.5);
        setPullDistance(distance);
      }
    },
    [enabled, isRefreshing, threshold, resistance]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!enabled || isRefreshing || !isPulling) {
      setIsPulling(false);
      setPullDistance(0);
      startY.current = 0;
      return;
    }

    const diff = currentY.current - startY.current;
    const distance = diff / resistance;

    setIsPulling(false);
    startY.current = 0;

    if (distance >= threshold) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } catch (error) {
        console.error('Refresh failed:', error);
      } finally {
        // Add a small delay for better UX
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
        }, 300);
      }
    } else {
      setPullDistance(0);
    }
  }, [enabled, isRefreshing, isPulling, threshold, resistance, onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    isPulling,
    isRefreshing,
    pullDistance,
  };
}
