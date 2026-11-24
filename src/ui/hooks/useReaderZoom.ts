import { useReaderStore } from '@stores/useReaderStore';
import { type ReaderInteractionMode, useReaderUIStore } from '@stores/useReaderUIStore';
import { useTypographyStore } from '@stores/useTypographyStore';
import { hasResizeObserver, hasWindow, safeScrollBy, useIsomorphicLayoutEffect } from '@utils/dom';
import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  EMPTY,
  filter,
  finalize,
  fromEvent,
  merge,
  type Subscription,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';

export interface ZoomActions {
  readonly increaseZoom: (step: number) => void;
  readonly decreaseZoom: (step: number) => void;
  readonly setZoomLevel: (zoom: number) => void;
}

export interface ZoomFocalPoint {
  readonly clientX: number;
  readonly clientY: number;
}

export interface FocalScrollAdjustmentInput {
  readonly focalViewportCoord: number;
  readonly prevWrapperEdge: number;
  readonly newWrapperEdge: number;
  readonly prevZoom: number;
  readonly newZoom: number;
}

export interface ZoomViewportDimensions {
  readonly width: number;
  readonly height: number;
}

export interface ReaderGestureStreamDeps {
  readonly targetWindow: Window;
  readonly container: HTMLElement | null;
  readonly getZoomLevel: () => number;
  readonly setInteractionMode: (mode: ReaderInteractionMode) => void;
  readonly onWheelZoom: (deltaY: number, focalPoint: ZoomFocalPoint) => void;
  readonly onKeyboardZoom: (key: string) => boolean;
  readonly onPinchZoom: (
    initialZoom: number,
    initialDistance: number,
    currentDistance: number,
    focalPoint: ZoomFocalPoint
  ) => void;
  readonly onModifierChange?: (pressed: boolean) => void;
}

export interface UseReaderZoomOptions {
  readonly isPdf: boolean;
  readonly scrollContainerRef: RefObject<HTMLElement | null>;
  readonly contentAreaRef: RefObject<HTMLDivElement | null>;
}

export interface UseReaderZoomReturn {
  readonly wrapperRef: RefObject<HTMLDivElement | null>;
  readonly wrapperStyle: CSSProperties;
  readonly contentStyle: CSSProperties;
  readonly gestureClassName: string;
}

const DRAG_THRESHOLD_PX = 3;

export function calculateWheelZoomDelta(deltaY: number): {
  readonly direction: 'in' | 'out';
  readonly step: number;
} {
  const delta = Math.abs(deltaY);
  const step = Math.min(0.25, Math.max(0.04, delta * 0.005));
  return {
    direction: deltaY < 0 ? 'in' : 'out',
    step,
  };
}

export function handleKeyboardZoomKey(key: string, actions: ZoomActions): boolean {
  if (key === '=' || key === '+') {
    actions.increaseZoom(0.1);
    return true;
  }
  if (key === '-' || key === '_') {
    actions.decreaseZoom(0.1);
    return true;
  }
  if (key === '0') {
    actions.setZoomLevel(1.0);
    return true;
  }
  return false;
}

export function calculatePinchZoomRatio(
  initialPinchZoom: number,
  initialPinchDistance: number,
  currentDistance: number
): number {
  if (initialPinchDistance <= 0) return initialPinchZoom;
  return initialPinchZoom * (currentDistance / initialPinchDistance);
}

/**
 * Computes the scroll delta required along a single axis so the document point
 * under the pointer or pinch midpoint stays stationary after GPU zoom scaling.
 */
export function calculateFocalScrollDelta({
  focalViewportCoord,
  prevWrapperEdge,
  newWrapperEdge,
  prevZoom,
  newZoom,
}: FocalScrollAdjustmentInput): number {
  if (prevZoom <= 0) return 0;
  const contentCoord = (focalViewportCoord - prevWrapperEdge) / prevZoom;
  const projectedScreenCoord = newWrapperEdge + contentCoord * newZoom;
  return projectedScreenCoord - focalViewportCoord;
}

/**
 * Applies focal scroll deltas to both X and Y axes of the unified scroll container.
 * Falls back to window vertical scrolling when no container ref is mounted.
 */
export function applyFocalScrollDeltas(
  container: HTMLElement | null,
  deltaX: number,
  deltaY: number
): void {
  if (container) {
    if (Math.abs(deltaX) > 0.5) {
      container.scrollLeft += deltaX;
    }
    if (Math.abs(deltaY) > 0.5) {
      container.scrollTop += deltaY;
    }
    return;
  }

  if (Math.abs(deltaY) > 0.5) {
    safeScrollBy(0, deltaY);
  }
}

/**
 * Pure helper computing the outer scroll-spacer style and GPU-scaled content style.
 */
export function computeZoomViewportStyles(
  _isPdf: boolean,
  zoomLevel: number,
  baseSize: ZoomViewportDimensions
): { readonly wrapperStyle: CSSProperties; readonly contentStyle: CSSProperties } {
  const baseWidthCss = 'min(calc(100vw - 2rem), 60vw)';
  const isScaled = zoomLevel !== 1;

  const wrapperStyle: CSSProperties = {
    width: isScaled && baseSize.width > 0 ? `${baseSize.width * zoomLevel}px` : baseWidthCss,
    height: isScaled && baseSize.height > 0 ? `${baseSize.height * zoomLevel}px` : undefined,
  };

  const contentStyle: CSSProperties = {
    transform: isScaled ? `scale(${zoomLevel})` : undefined,
    transformOrigin: 'top left',
    willChange: isScaled ? 'transform' : undefined,
    width: baseWidthCss,
  };

  return { wrapperStyle, contentStyle };
}

/**
 * Maps the current interaction mode to cursor override utility classes.
 */
export function getGestureContainerClass(mode: ReaderInteractionMode): string {
  if (mode === 'panning') return 'reader-cursor-grabbing';
  if (mode === 'grabReady') return 'reader-cursor-grab';
  return '';
}

function isZoomOrGrabModifierKey(key: string): boolean {
  return key === 'Control' || key === 'Meta';
}

/**
 * Creates a unified RxJS event stream handling wheel zoom, keyboard zoom,
 * two-finger pinch zoom, and Ctrl+Drag 2D grab-to-pan without competing listeners.
 */
export function createReaderGestureStream(deps: ReaderGestureStreamDeps): Subscription {
  const {
    targetWindow,
    container,
    getZoomLevel,
    setInteractionMode,
    onWheelZoom,
    onKeyboardZoom,
    onPinchZoom,
    onModifierChange,
  } = deps;

  let suppressNextClick = false;
  let isModifierPressed = false;

  const updateModifierState = (pressed: boolean) => {
    isModifierPressed = pressed;
    onModifierChange?.(pressed);
  };

  const restoreRestingMode = () => {
    setInteractionMode(isModifierPressed && getZoomLevel() > 1 ? 'grabReady' : 'idle');
  };

  const wheel$ = fromEvent<WheelEvent>(targetWindow, 'wheel', { passive: false }).pipe(
    filter((e) => e.ctrlKey || e.metaKey),
    tap((e) => {
      e.preventDefault();
      onWheelZoom(e.deltaY, { clientX: e.clientX, clientY: e.clientY });
    })
  );

  const keyDown$ = fromEvent<KeyboardEvent>(targetWindow, 'keydown').pipe(
    tap((e) => {
      if (isZoomOrGrabModifierKey(e.key)) {
        updateModifierState(true);
      }
      if ((e.ctrlKey || e.metaKey) && onKeyboardZoom(e.key)) {
        e.preventDefault();
      }
    })
  );

  const keyUp$ = fromEvent<KeyboardEvent>(targetWindow, 'keyup').pipe(
    filter((e) => isZoomOrGrabModifierKey(e.key)),
    tap(() => updateModifierState(false))
  );

  const blur$ = fromEvent(targetWindow, 'blur').pipe(tap(() => updateModifierState(false)));

  const touchStart$ = fromEvent<TouchEvent>(targetWindow, 'touchstart', { passive: true });
  const touchMove$ = fromEvent<TouchEvent>(targetWindow, 'touchmove', { passive: false });
  const touchEnd$ = fromEvent<TouchEvent>(targetWindow, 'touchend', { passive: true });

  const pinch$ = touchStart$.pipe(
    filter((e) => e.touches.length === 2),
    switchMap((startEvent) => {
      const t1 = startEvent.touches[0];
      const t2 = startEvent.touches[1];
      if (!t1 || !t2) return EMPTY;

      const initialDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      if (initialDistance <= 0) return EMPTY;

      const initialZoom = getZoomLevel();
      setInteractionMode('pinching');

      return touchMove$.pipe(
        filter((moveEvent) => moveEvent.touches.length === 2),
        tap((moveEvent) => {
          const m1 = moveEvent.touches[0];
          const m2 = moveEvent.touches[1];
          if (!m1 || !m2) return;

          moveEvent.preventDefault();
          const currentDistance = Math.hypot(m1.clientX - m2.clientX, m1.clientY - m2.clientY);
          onPinchZoom(initialZoom, initialDistance, currentDistance, {
            clientX: (m1.clientX + m2.clientX) / 2,
            clientY: (m1.clientY + m2.clientY) / 2,
          });
        }),
        takeUntil(touchEnd$.pipe(filter((endEvent) => endEvent.touches.length < 2))),
        finalize(restoreRestingMode)
      );
    })
  );

  const pointerMove$ = fromEvent<PointerEvent>(targetWindow, 'pointermove');
  const pointerUp$ = merge(
    fromEvent<PointerEvent>(targetWindow, 'pointerup'),
    fromEvent<PointerEvent>(targetWindow, 'pointercancel')
  );

  const grabPan$ = container
    ? fromEvent<PointerEvent>(container, 'pointerdown').pipe(
        filter((e) => e.button === 0 && (e.ctrlKey || e.metaKey) && getZoomLevel() > 1),
        tap((startEvent) => {
          // Prevent starting a new browser text selection while preserving any existing selection.
          startEvent.preventDefault();
        }),
        switchMap((startEvent) => {
          suppressNextClick = false;
          let lastX = startEvent.clientX;
          let lastY = startEvent.clientY;
          let isGrabbing = false;

          return pointerMove$.pipe(
            tap((moveEvent) => {
              if (!isGrabbing) {
                const distance = Math.hypot(
                  moveEvent.clientX - startEvent.clientX,
                  moveEvent.clientY - startEvent.clientY
                );
                if (distance < DRAG_THRESHOLD_PX) {
                  return;
                }
                isGrabbing = true;
                suppressNextClick = true;
                setInteractionMode('panning');
              }

              container.scrollLeft -= moveEvent.clientX - lastX;
              container.scrollTop -= moveEvent.clientY - lastY;
              lastX = moveEvent.clientX;
              lastY = moveEvent.clientY;
            }),
            takeUntil(pointerUp$),
            finalize(restoreRestingMode)
          );
        })
      )
    : EMPTY;

  const suppressDragClick$ = container
    ? fromEvent<MouseEvent>(container, 'click', { capture: true }).pipe(
        filter(() => suppressNextClick),
        tap((e) => {
          suppressNextClick = false;
          e.stopPropagation();
        })
      )
    : EMPTY;

  return merge(wheel$, keyDown$, keyUp$, blur$, pinch$, grabPan$, suppressDragClick$).subscribe();
}

/**
 * ViewModel hook managing GPU-composited reader zoom, gesture streams,
 * 2D grab-to-pan cursor state, and focal-point scroll compensation.
 */
export function useReaderZoom({
  isPdf,
  scrollContainerRef,
  contentAreaRef,
}: UseReaderZoomOptions): UseReaderZoomReturn {
  const bookHash = useReaderStore((s) => s.document.bookHash);
  const zoomLevel = useTypographyStore((s) => s.zoomLevel);
  const settledZoomLevel = useTypographyStore((s) => s.settledZoomLevel);
  const increaseZoom = useTypographyStore((s) => s.increaseZoom);
  const decreaseZoom = useTypographyStore((s) => s.decreaseZoom);
  const setZoomLevel = useTypographyStore((s) => s.setZoomLevel);
  const setSettledZoomLevel = useTypographyStore((s) => s.setSettledZoomLevel);
  const interactionMode = useReaderUIStore((s) => s.interactionMode);
  const setInteractionMode = useReaderUIStore((s) => s.setInteractionMode);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const isModifierPressedRef = useRef(false);
  const zoomLevelRef = useRef(zoomLevel);
  zoomLevelRef.current = zoomLevel;

  const [baseSize, setBaseSize] = useState<ZoomViewportDimensions>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    if (zoomLevel === settledZoomLevel) return;
    const timer = setTimeout(() => setSettledZoomLevel(zoomLevel), 150);
    return () => clearTimeout(timer);
  }, [zoomLevel, settledZoomLevel, setSettledZoomLevel]);

  const prevZoomRef = useRef(zoomLevel);
  const pendingFocalRef = useRef<ZoomFocalPoint | null>(null);
  const prevWrapperRectRef = useRef<{ left: number; top: number } | null>(null);

  // Always start every book session at 100% zoom
  useEffect(() => {
    if (bookHash) {
      setZoomLevel(1.0);
      setSettledZoomLevel(1.0);
    }
  }, [bookHash, setZoomLevel, setSettledZoomLevel]);

  // Sync grabReady cursor availability when zoomLevel changes
  useEffect(() => {
    const currentMode = useReaderUIStore.getState().interactionMode;
    if (currentMode === 'panning' || currentMode === 'pinching') {
      return;
    }
    const nextMode = isModifierPressedRef.current && zoomLevel > 1 ? 'grabReady' : 'idle';
    if (currentMode !== nextMode) {
      setInteractionMode(nextMode);
    }
  }, [zoomLevel, setInteractionMode]);

  // Track unscaled content dimensions so outer wrapper can size scrollbars without inner reflow
  useEffect(() => {
    const contentEl = contentAreaRef.current;
    if (!contentEl || !hasResizeObserver()) {
      return;
    }

    const updateBaseSize = () => {
      const width = contentEl.offsetWidth;
      const height = contentEl.offsetHeight;
      setBaseSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height }
      );
    };

    updateBaseSize();
    const observer = new ResizeObserver(updateBaseSize);
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, [contentAreaRef]);

  const captureFocalPoint = useCallback((focalPoint: ZoomFocalPoint) => {
    pendingFocalRef.current = focalPoint;
    if (!prevWrapperRectRef.current && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      prevWrapperRectRef.current = { left: rect.left, top: rect.top };
    }
  }, []);

  // Unified RxJS gesture stream: wheel zoom, keyboard zoom, pinch-to-zoom, and Ctrl+Drag pan
  useEffect(() => {
    if (!hasWindow()) return;

    const subscription = createReaderGestureStream({
      targetWindow: window,
      container: scrollContainerRef.current,
      getZoomLevel: () => zoomLevelRef.current,
      setInteractionMode,
      onWheelZoom: (deltaY, focalPoint) => {
        captureFocalPoint(focalPoint);
        const { direction, step } = calculateWheelZoomDelta(deltaY);
        if (direction === 'in') {
          increaseZoom(step);
        } else {
          decreaseZoom(step);
        }
      },
      onKeyboardZoom: (key) =>
        handleKeyboardZoomKey(key, { increaseZoom, decreaseZoom, setZoomLevel }),
      onPinchZoom: (initialZoom, initialDistance, currentDistance, focalPoint) => {
        captureFocalPoint(focalPoint);
        setZoomLevel(calculatePinchZoomRatio(initialZoom, initialDistance, currentDistance));
      },
      onModifierChange: (pressed) => {
        if (isModifierPressedRef.current !== pressed) {
          isModifierPressedRef.current = pressed;
          const currentMode = useReaderUIStore.getState().interactionMode;
          if (currentMode !== 'panning' && currentMode !== 'pinching') {
            setInteractionMode(pressed && zoomLevelRef.current > 1 ? 'grabReady' : 'idle');
          }
        }
      },
    });

    return () => {
      subscription.unsubscribe();
      setInteractionMode('idle');
    };
  }, [
    scrollContainerRef,
    setInteractionMode,
    captureFocalPoint,
    increaseZoom,
    decreaseZoom,
    setZoomLevel,
  ]);

  // Keep the document point under the pointer/pinch stationary after GPU zoom scaling
  useIsomorphicLayoutEffect(() => {
    const prevZoom = prevZoomRef.current;
    prevZoomRef.current = zoomLevel;

    const focal = pendingFocalRef.current;
    const prevRect = prevWrapperRectRef.current;
    pendingFocalRef.current = null;
    prevWrapperRectRef.current = null;

    if (prevZoom === zoomLevel || !focal || !prevRect || !wrapperRef.current) {
      return;
    }

    const newRect = wrapperRef.current.getBoundingClientRect();
    const deltaX = calculateFocalScrollDelta({
      focalViewportCoord: focal.clientX,
      prevWrapperEdge: prevRect.left,
      newWrapperEdge: newRect.left,
      prevZoom,
      newZoom: zoomLevel,
    });
    const deltaY = calculateFocalScrollDelta({
      focalViewportCoord: focal.clientY,
      prevWrapperEdge: prevRect.top,
      newWrapperEdge: newRect.top,
      prevZoom,
      newZoom: zoomLevel,
    });

    applyFocalScrollDeltas(scrollContainerRef.current, deltaX, deltaY);
  }, [zoomLevel, scrollContainerRef]);

  const { wrapperStyle, contentStyle } = useMemo(
    () => computeZoomViewportStyles(isPdf, zoomLevel, baseSize),
    [isPdf, zoomLevel, baseSize]
  );

  const gestureClassName = useMemo(
    () => getGestureContainerClass(interactionMode),
    [interactionMode]
  );

  return {
    wrapperRef,
    wrapperStyle,
    contentStyle,
    gestureClassName,
  };
}
