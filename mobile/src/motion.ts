import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  type ViewStyle,
} from 'react-native';

import { withAlpha } from './theme';

/**
 * Mirrors the OS "Reduce Motion" setting.
 *
 * Every animation in the app routes through this. Motion in this product only
 * ever carries meaning (press feedback, a state change arriving), so when the
 * user asks for less motion we drop to an instant state swap rather than
 * shipping a slower or decorative animation.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => {
        /* Setting unavailable on this platform; default to full motion. */
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => {
        if (active) setReduced(value);
      },
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

/**
 * Tactile press feedback for a single control: a short scale dip on press-in.
 * `Pressable` already carries the colour/opacity change; this adds the physical
 * layer that makes a tap confirm itself on a noisy floor.
 */
export function usePressFeedback(scaleTo = 0.97) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  const animate = useCallback(
    (to: number) => {
      if (reduced) return;
      Animated.timing(progress, {
        toValue: to,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    },
    [progress, reduced],
  );

  const onPressIn = useCallback(() => animate(1), [animate]);
  const onPressOut = useCallback(() => animate(0), [animate]);

  const animatedStyle: ViewStyle = {
    transform: [
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [1, scaleTo],
        }),
      },
    ],
  };

  return { onPressIn, onPressOut, animatedStyle, reduced };
}

/**
 * Material ripple for Android, an inert object on iOS so call sites can spread
 * it unconditionally instead of branching on `Platform.OS` per control.
 */
export function ripple(color: string, borderless = false) {
  if (Platform.OS !== 'android') return {};
  return { android_ripple: { color: withAlpha(color, 0.18), borderless } };
}

/**
 * One-shot entrance for content that appears after a state change (a success or
 * error banner, a freshly opened sheet). Uses opacity only so it can run on the
 * native driver without touching layout.
 */
export function useEnter(duration = 180) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      value.setValue(1);
      return;
    }
    const animation = Animated.timing(value, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [duration, reduced, value]);

  return { opacity: value, reduced };
}