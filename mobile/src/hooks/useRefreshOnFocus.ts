import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Refetch when a screen regains focus.
 *
 * React Query's `refetchOnWindowFocus` only fires on web. On native the tab
 * switcher never tells the query cache anything, so screens would keep showing
 * whatever was loaded the first time. Screens converted to hooks call this to
 * keep the behaviour the old `useFocusEffect(load)` pattern had.
 *
 * The first focus after mount is skipped: the query has already started
 * fetching and a second request would just duplicate it.
 */
export function useRefreshOnFocus(refetch: () => unknown): void {
  const isFirstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      void refetch();
    }, [refetch]),
  );
}