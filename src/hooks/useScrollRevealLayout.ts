/**
 * Scroll-reveal layout choreography for multi-section forms.
 *
 * Owns scroll-position tracking (active section), section measurement, and
 * scroll-focused-input-into-view. Generic — no domain logic.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  LayoutAnimation,
  Platform,
  UIManager,
  View as RNView,
  ScrollView as RNScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type LayoutChangeEvent,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type Measurable = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

export function animateFormLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

export function useScrollRevealLayout(sectionIds: readonly string[]) {
  const [activeSection, setActiveSection] = useState(sectionIds[0]);
  const activeSectionRef = useRef(sectionIds[0]);
  const sectionPositions = useRef<Record<string, number>>({});
  const scrollContentRef = useRef<RNView>(null);
  const sectionRefs = useRef<Partial<Record<string, RNView | null>>>({});
  const wrapRefs = useRef<Partial<Record<string, RNView | null>>>({});
  const scrollRef = useRef<RNScrollView>(null);
  const scrollYRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const focusedInputRef = useRef<Measurable | null>(null);
  const focusScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remeasureSections = useCallback(() => {
    const container = scrollContentRef.current;
    if (!container) return;
    for (const id of sectionIds) {
      const node = sectionRefs.current[id];
      if (!node) continue;
      node.measureLayout(
        container,
        (_x, y) => {
          sectionPositions.current[id] = y;
        },
        () => {}
      );
    }
  }, [sectionIds]);

  const scrollFocusedInputIntoView = useCallback(() => {
    if (focusScrollTimerRef.current) clearTimeout(focusScrollTimerRef.current);
    focusScrollTimerRef.current = setTimeout(() => {
      const input = focusedInputRef.current;
      if (!input) return;
      input.measureInWindow((_x, y, _w, h) => {
        const visibleBottom = Dimensions.get('window').height - keyboardHeightRef.current - 24;
        const overflow = y + h - visibleBottom;
        if (overflow > 0) {
          scrollRef.current?.scrollTo({ y: scrollYRef.current + overflow, animated: true });
        }
      });
    }, 250);
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      scrollYRef.current = y;

      const viewportAnchor = y + 160;

      let active = sectionIds[0];
      for (let i = sectionIds.length - 1; i >= 0; i--) {
        const pos = sectionPositions.current[sectionIds[i]];
        if (pos !== undefined && viewportAnchor >= pos) {
          active = sectionIds[i];
          break;
        }
      }
      if (activeSectionRef.current !== active) {
        activeSectionRef.current = active;
        setActiveSection(active);
      }
    },
    [sectionIds]
  );

  const handleSectionLayout = useCallback((id: string) => (e: LayoutChangeEvent) => {
    sectionPositions.current[id] = e.nativeEvent.layout.y;
  }, []);

  const bindSectionRef = useCallback(
    (id: string) => (node: RNView | null) => {
      sectionRefs.current[id] = node;
    },
    []
  );

  const registerRef = useCallback(
    (id: string) => (node: RNView | null) => {
      wrapRefs.current[id] = node;
    },
    []
  );

  const scrollToSection = useCallback((id: string) => {
    const y = sectionPositions.current[id];
    if (y !== undefined && scrollRef.current) {
      scrollRef.current.scrollTo({ y: Math.max(0, y - 120), animated: true });
    }
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardHeightRef.current = e.endCoordinates.height;
      scrollFocusedInputIntoView();
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardHeightRef.current = 0;
      focusedInputRef.current = null;
    });
    return () => {
      showSub.remove();
      hideSub.remove();
      if (focusScrollTimerRef.current) clearTimeout(focusScrollTimerRef.current);
    };
  }, [scrollFocusedInputIntoView]);

  const handleInputFocus = useCallback(
    (id: string) => {
      focusedInputRef.current = (wrapRefs.current[id] ?? null) as Measurable | null;
      scrollFocusedInputIntoView();
    },
    [scrollFocusedInputIntoView]
  );

  const handleInputBlur = useCallback(() => {
    focusedInputRef.current = null;
  }, []);

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
    focusedInputRef.current = null;
  }, []);

  return {
    activeSection,
    scrollRef,
    scrollContentRef,
    handleScroll,
    handleSectionLayout,
    bindSectionRef,
    registerRef,
    scrollToSection,
    remeasureSections,
    handleInputFocus,
    handleInputBlur,
    dismissKeyboard,
    animateFormLayout,
  };
}
