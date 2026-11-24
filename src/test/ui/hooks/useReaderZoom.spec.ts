import {
  calculateFocalScrollDelta,
  calculatePinchZoomRatio,
  calculateWheelZoomDelta,
  computeZoomViewportStyles,
  createReaderGestureStream,
  getGestureContainerClass,
  handleKeyboardZoomKey,
} from '@hooks/useReaderZoom';
import { describe, expect, it, vi } from 'vitest';

function createMockEventTarget() {
  const listeners = new Map<string, Set<EventListener>>();

  return {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const fn = typeof listener === 'function' ? listener : listener.handleEvent.bind(listener);
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)?.add(fn);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const fn = typeof listener === 'function' ? listener : listener.handleEvent.bind(listener);
      listeners.get(type)?.delete(fn);
    },
    dispatch(type: string, event: Record<string, unknown>) {
      const set = listeners.get(type);
      if (!set) return;
      for (const fn of set) {
        fn(event as unknown as Event);
      }
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

describe('useReaderZoom logic', () => {
  describe('calculateWheelZoomDelta', () => {
    it('zooms in on negative deltaY and clamps step', () => {
      const result = calculateWheelZoomDelta(-100);
      expect(result.direction).toBe('in');
      expect(result.step).toBe(0.25);
    });

    it('zooms out on positive deltaY and clamps min/max step', () => {
      const result = calculateWheelZoomDelta(500);
      expect(result.direction).toBe('out');
      expect(result.step).toBe(0.25);
    });

    it('enforces minimum step size of 0.04', () => {
      const result = calculateWheelZoomDelta(1);
      expect(result.step).toBe(0.04);
    });
  });

  describe('handleKeyboardZoomKey', () => {
    it('triggers increaseZoom on + or =', () => {
      const actions = {
        increaseZoom: vi.fn(),
        decreaseZoom: vi.fn(),
        setZoomLevel: vi.fn(),
      };

      expect(handleKeyboardZoomKey('+', actions)).toBe(true);
      expect(actions.increaseZoom).toHaveBeenCalledWith(0.1);

      expect(handleKeyboardZoomKey('=', actions)).toBe(true);
      expect(actions.increaseZoom).toHaveBeenCalledTimes(2);
    });

    it('triggers decreaseZoom on - or _', () => {
      const actions = {
        increaseZoom: vi.fn(),
        decreaseZoom: vi.fn(),
        setZoomLevel: vi.fn(),
      };

      expect(handleKeyboardZoomKey('-', actions)).toBe(true);
      expect(actions.decreaseZoom).toHaveBeenCalledWith(0.1);

      expect(handleKeyboardZoomKey('_', actions)).toBe(true);
      expect(actions.decreaseZoom).toHaveBeenCalledTimes(2);
    });

    it('resets zoom to 1.0 on 0', () => {
      const actions = {
        increaseZoom: vi.fn(),
        decreaseZoom: vi.fn(),
        setZoomLevel: vi.fn(),
      };

      expect(handleKeyboardZoomKey('0', actions)).toBe(true);
      expect(actions.setZoomLevel).toHaveBeenCalledWith(1.0);
    });

    it('returns false for unrecognized keys', () => {
      const actions = {
        increaseZoom: vi.fn(),
        decreaseZoom: vi.fn(),
        setZoomLevel: vi.fn(),
      };

      expect(handleKeyboardZoomKey('a', actions)).toBe(false);
      expect(actions.increaseZoom).not.toHaveBeenCalled();
    });
  });

  describe('calculatePinchZoomRatio', () => {
    it('scales zoom level proportionally to finger distance ratio', () => {
      const zoom = calculatePinchZoomRatio(1.0, 100, 200);
      expect(zoom).toBe(2.0);

      const zoomIn = calculatePinchZoomRatio(1.5, 200, 100);
      expect(zoomIn).toBe(0.75);
    });

    it('returns initial zoom if initial distance is zero or negative', () => {
      expect(calculatePinchZoomRatio(1.2, 0, 100)).toBe(1.2);
      expect(calculatePinchZoomRatio(1.2, -10, 100)).toBe(1.2);
    });
  });

  describe('calculateFocalScrollDelta', () => {
    it('computes scroll adjustment to keep focal point stationary on zoom in', () => {
      const delta = calculateFocalScrollDelta({
        focalViewportCoord: 600,
        prevWrapperEdge: 200,
        newWrapperEdge: 0,
        prevZoom: 1.0,
        newZoom: 2.0,
      });

      expect(delta).toBe(200);
    });

    it('returns 0 when prevZoom is zero or negative', () => {
      expect(
        calculateFocalScrollDelta({
          focalViewportCoord: 400,
          prevWrapperEdge: 100,
          newWrapperEdge: 100,
          prevZoom: 0,
          newZoom: 1.5,
        })
      ).toBe(0);
    });
  });

  describe('computeZoomViewportStyles', () => {
    it('returns unscaled base styles at zoomLevel 1.0', () => {
      const { wrapperStyle, contentStyle } = computeZoomViewportStyles(true, 1.0, {
        width: 768,
        height: 2000,
      });

      expect(wrapperStyle.width).toBe('min(calc(100vw - 2rem), 60vw)');
      expect(wrapperStyle.height).toBeUndefined();
      expect(contentStyle.transform).toBeUndefined();
      expect(contentStyle.willChange).toBeUndefined();
      expect(contentStyle.transformOrigin).toBe('top left');
      expect(contentStyle.width).toBe('min(calc(100vw - 2rem), 60vw)');
    });

    it('returns GPU scale and scaled spacer dimensions when zoomed', () => {
      const { wrapperStyle, contentStyle } = computeZoomViewportStyles(false, 1.5, {
        width: 600,
        height: 1000,
      });

      expect(wrapperStyle.width).toBe('900px');
      expect(wrapperStyle.height).toBe('1500px');
      expect(contentStyle.transform).toBe('scale(1.5)');
      expect(contentStyle.willChange).toBe('transform');
      expect(contentStyle.transformOrigin).toBe('top left');
      expect(contentStyle.width).toBe('min(calc(100vw - 2rem), 60vw)');
    });
  });

  describe('getGestureContainerClass', () => {
    it('maps interaction modes to cursor override classes without select-none', () => {
      expect(getGestureContainerClass('idle')).toBe('');
      expect(getGestureContainerClass('pinching')).toBe('');
      expect(getGestureContainerClass('grabReady')).toBe('reader-cursor-grab');
      expect(getGestureContainerClass('panning')).toBe('reader-cursor-grabbing');
    });
  });

  describe('createReaderGestureStream', () => {
    it('handles ctrl+wheel zoom and ignores plain wheel events', () => {
      const mockWindow = createMockEventTarget();
      const onWheelZoom = vi.fn();

      const sub = createReaderGestureStream({
        targetWindow: mockWindow as unknown as Window,
        container: null,
        getZoomLevel: () => 1.0,
        setInteractionMode: vi.fn(),
        onWheelZoom,
        onKeyboardZoom: vi.fn(() => false),
        onPinchZoom: vi.fn(),
      });

      const plainPrevent = vi.fn();
      mockWindow.dispatch('wheel', {
        ctrlKey: false,
        metaKey: false,
        preventDefault: plainPrevent,
      });
      expect(onWheelZoom).not.toHaveBeenCalled();
      expect(plainPrevent).not.toHaveBeenCalled();

      const ctrlPrevent = vi.fn();
      mockWindow.dispatch('wheel', {
        ctrlKey: true,
        metaKey: false,
        deltaY: -100,
        clientX: 300,
        clientY: 400,
        preventDefault: ctrlPrevent,
      });
      expect(ctrlPrevent).toHaveBeenCalledTimes(1);
      expect(onWheelZoom).toHaveBeenCalledWith(-100, { clientX: 300, clientY: 400 });

      sub.unsubscribe();
      expect(mockWindow.listenerCount('wheel')).toBe(0);
    });

    it('handles ctrl+keyboard zoom shortcuts', () => {
      const mockWindow = createMockEventTarget();
      const onKeyboardZoom = vi.fn((key: string) => key === '+');

      const sub = createReaderGestureStream({
        targetWindow: mockWindow as unknown as Window,
        container: null,
        getZoomLevel: () => 1.0,
        setInteractionMode: vi.fn(),
        onWheelZoom: vi.fn(),
        onKeyboardZoom,
        onPinchZoom: vi.fn(),
      });

      const preventDefault = vi.fn();
      mockWindow.dispatch('keydown', { ctrlKey: true, metaKey: false, key: '+', preventDefault });
      expect(onKeyboardZoom).toHaveBeenCalledWith('+');
      expect(preventDefault).toHaveBeenCalledTimes(1);

      sub.unsubscribe();
    });

    it('handles two-finger pinch zoom stream cleanly', () => {
      const mockWindow = createMockEventTarget();
      const setInteractionMode = vi.fn();
      const onPinchZoom = vi.fn();

      const sub = createReaderGestureStream({
        targetWindow: mockWindow as unknown as Window,
        container: null,
        getZoomLevel: () => 1.0,
        setInteractionMode,
        onWheelZoom: vi.fn(),
        onKeyboardZoom: vi.fn(() => false),
        onPinchZoom,
      });

      mockWindow.dispatch('touchstart', {
        touches: [
          { clientX: 0, clientY: 0 },
          { clientX: 100, clientY: 0 },
        ],
      });
      expect(setInteractionMode).toHaveBeenCalledWith('pinching');

      const preventDefault = vi.fn();
      mockWindow.dispatch('touchmove', {
        touches: [
          { clientX: 0, clientY: 0 },
          { clientX: 200, clientY: 0 },
        ],
        preventDefault,
      });
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(onPinchZoom).toHaveBeenCalledWith(1.0, 100, 200, { clientX: 100, clientY: 0 });

      mockWindow.dispatch('touchend', { touches: [{ clientX: 0, clientY: 0 }] });
      expect(setInteractionMode).toHaveBeenLastCalledWith('idle');

      sub.unsubscribe();
    });

    it('pans both X and Y axes on Ctrl+Drag, prevents default pointerdown selection, and suppresses trailing click', () => {
      const mockWindow = createMockEventTarget();
      const mockContainer = Object.assign(createMockEventTarget(), {
        scrollLeft: 100,
        scrollTop: 200,
      });
      const setInteractionMode = vi.fn();

      const sub = createReaderGestureStream({
        targetWindow: mockWindow as unknown as Window,
        container: mockContainer as unknown as HTMLElement,
        getZoomLevel: () => 1.5,
        setInteractionMode,
        onWheelZoom: vi.fn(),
        onKeyboardZoom: vi.fn(() => false),
        onPinchZoom: vi.fn(),
      });

      mockWindow.dispatch('keydown', { key: 'Control', ctrlKey: true, metaKey: false });

      const pointerDownPrevent = vi.fn();
      mockContainer.dispatch('pointerdown', {
        button: 0,
        ctrlKey: true,
        metaKey: false,
        clientX: 300,
        clientY: 400,
        target: { closest: () => null },
        preventDefault: pointerDownPrevent,
      });
      expect(pointerDownPrevent).toHaveBeenCalledTimes(1);

      // Small move below threshold does not start panning
      mockWindow.dispatch('pointermove', { clientX: 301, clientY: 401 });
      expect(setInteractionMode).not.toHaveBeenCalledWith('panning');

      // Diagonal move above threshold starts panning and scrolls both X and Y
      mockWindow.dispatch('pointermove', { clientX: 260, clientY: 350 });
      expect(setInteractionMode).toHaveBeenCalledWith('panning');
      expect(mockContainer.scrollLeft).toBe(140);
      expect(mockContainer.scrollTop).toBe(250);

      mockWindow.dispatch('pointerup', {});
      expect(setInteractionMode).toHaveBeenLastCalledWith('grabReady');

      const stopPropagation = vi.fn();
      mockContainer.dispatch('click', { stopPropagation });
      expect(stopPropagation).toHaveBeenCalledTimes(1);

      sub.unsubscribe();
    });

    it('preserves text selection when dragging without Ctrl even when zoomed > 1', () => {
      const mockWindow = createMockEventTarget();
      const mockContainer = Object.assign(createMockEventTarget(), {
        scrollLeft: 50,
        scrollTop: 80,
      });
      const setInteractionMode = vi.fn();

      const sub = createReaderGestureStream({
        targetWindow: mockWindow as unknown as Window,
        container: mockContainer as unknown as HTMLElement,
        getZoomLevel: () => 1.5,
        setInteractionMode,
        onWheelZoom: vi.fn(),
        onKeyboardZoom: vi.fn(() => false),
        onPinchZoom: vi.fn(),
      });

      const pointerDownPrevent = vi.fn();
      mockContainer.dispatch('pointerdown', {
        button: 0,
        ctrlKey: false,
        metaKey: false,
        clientX: 300,
        clientY: 400,
        target: { closest: () => null },
        preventDefault: pointerDownPrevent,
      });
      mockWindow.dispatch('pointermove', { clientX: 200, clientY: 300 });

      expect(pointerDownPrevent).not.toHaveBeenCalled();
      expect(setInteractionMode).not.toHaveBeenCalledWith('panning');
      expect(mockContainer.scrollLeft).toBe(50);
      expect(mockContainer.scrollTop).toBe(80);

      sub.unsubscribe();
    });

    it('tracks Control modifier keydown, keyup, and window blur', () => {
      const mockWindow = createMockEventTarget();
      const onModifierChange = vi.fn();

      const sub = createReaderGestureStream({
        targetWindow: mockWindow as unknown as Window,
        container: null,
        getZoomLevel: () => 1.5,
        setInteractionMode: vi.fn(),
        onWheelZoom: vi.fn(),
        onKeyboardZoom: vi.fn(() => false),
        onPinchZoom: vi.fn(),
        onModifierChange,
      });

      mockWindow.dispatch('keydown', { key: 'Control', ctrlKey: true, metaKey: false });
      expect(onModifierChange).toHaveBeenLastCalledWith(true);

      mockWindow.dispatch('keyup', { key: 'Control' });
      expect(onModifierChange).toHaveBeenLastCalledWith(false);

      mockWindow.dispatch('keydown', { key: 'Meta', ctrlKey: false, metaKey: true });
      expect(onModifierChange).toHaveBeenLastCalledWith(true);

      mockWindow.dispatch('blur', {});
      expect(onModifierChange).toHaveBeenLastCalledWith(false);

      sub.unsubscribe();
    });

    it('does not start panning when zoomLevel <= 1', () => {
      const mockWindow = createMockEventTarget();
      const mockContainer = Object.assign(createMockEventTarget(), {
        scrollLeft: 0,
        scrollTop: 0,
      });
      const setInteractionMode = vi.fn();

      const sub = createReaderGestureStream({
        targetWindow: mockWindow as unknown as Window,
        container: mockContainer as unknown as HTMLElement,
        getZoomLevel: () => 1.0,
        setInteractionMode,
        onWheelZoom: vi.fn(),
        onKeyboardZoom: vi.fn(() => false),
        onPinchZoom: vi.fn(),
      });

      mockContainer.dispatch('pointerdown', {
        button: 0,
        ctrlKey: true,
        metaKey: false,
        clientX: 300,
        clientY: 400,
        target: { closest: () => null },
        preventDefault: vi.fn(),
      });
      mockWindow.dispatch('pointermove', { clientX: 200, clientY: 300 });

      expect(setInteractionMode).not.toHaveBeenCalledWith('panning');
      expect(mockContainer.scrollLeft).toBe(0);
      expect(mockContainer.scrollTop).toBe(0);

      sub.unsubscribe();
    });
  });
});
