import { getViewportWidth, hasLocalStorage } from '@utils/dom';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export type FontFamilyChoice = 'serif' | 'sans' | 'editorial' | 'accessible' | 'mono';

export type PageLayoutMode = 'continuous' | 'separated';

export interface FontFamilyDefinition {
  readonly id: FontFamilyChoice;
  readonly label: string;
  readonly cssFontFamily: string;
}

export const FONT_FAMILY_DEFINITIONS: Record<FontFamilyChoice, FontFamilyDefinition> = {
  serif: {
    id: 'serif',
    label: 'Serif',
    cssFontFamily:
      "Charter, 'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, 'Times New Roman', Georgia, serif",
  },
  sans: {
    id: 'sans',
    label: 'San Francisco',
    cssFontFamily:
      "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  editorial: {
    id: 'editorial',
    label: 'Editorial',
    cssFontFamily:
      "Athelas, 'EB Garamond', Garamond, 'Baskerville Old Face', Baskerville, 'Hoefler Text', serif",
  },
  accessible: {
    id: 'accessible',
    label: 'Dyslexic',
    cssFontFamily: "OpenDyslexic, Lexend, 'Trebuchet MS', Verdana, -apple-system, sans-serif",
  },
  mono: {
    id: 'mono',
    label: 'Monospace',
    cssFontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
};

const STORAGE_KEY = 'scholarium_typography_settings';

export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 36;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 5.0;

function getDefaultFontSize(): number {
  if (getViewportWidth() < 640) {
    return 16;
  }
  return 18;
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

interface PersistedTypographyState {
  readonly fontSize: number;
  readonly fontFamily: FontFamilyChoice;
  readonly lineSpacing: number;
  readonly pageLayoutMode: PageLayoutMode;
}

function isFontFamilyChoice(value: unknown): value is FontFamilyChoice {
  return typeof value === 'string' && value in FONT_FAMILY_DEFINITIONS;
}

export interface TypographyState {
  readonly fontSize: number;
  readonly zoomLevel: number;
  readonly settledZoomLevel: number;
  readonly fontFamily: FontFamilyChoice;
  readonly lineSpacing: number;
  readonly pageLayoutMode: PageLayoutMode;
  readonly isAppearancePopoverOpen: boolean;

  setFontSize(fontSize: number): void;
  increaseFontSize(step?: number): void;
  decreaseFontSize(step?: number): void;
  setZoomLevel(zoomLevel: number): void;
  setSettledZoomLevel(zoomLevel: number): void;
  increaseZoom(step?: number): void;
  decreaseZoom(step?: number): void;
  setFontFamily(fontFamily: FontFamilyChoice): void;
  setLineSpacing(lineSpacing: number): void;
  setPageLayoutMode(pageLayoutMode: PageLayoutMode): void;
  toggleAppearancePopover(): void;
  setAppearancePopoverOpen(open: boolean): void;
  reset(): void;
}

export const useTypographyStore = create<TypographyState>()(
  persist(
    (set, get) => ({
      fontSize: getDefaultFontSize(),
      zoomLevel: 1.0,
      settledZoomLevel: 1.0,
      fontFamily: 'serif',
      lineSpacing: 1.85,
      pageLayoutMode: 'separated',
      isAppearancePopoverOpen: false,

      setFontSize: (fontSize) => {
        const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(fontSize)));
        set({ fontSize: clamped });
      },

      increaseFontSize: (step = 1) => {
        get().setFontSize(get().fontSize + step);
      },

      decreaseFontSize: (step = 1) => {
        get().setFontSize(get().fontSize - step);
      },

      setZoomLevel: (zoomLevel) => {
        const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(zoomLevel.toFixed(2))));
        set({ zoomLevel: clamped });
      },

      setSettledZoomLevel: (zoomLevel) => {
        const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(zoomLevel.toFixed(2))));
        set({ settledZoomLevel: clamped });
      },

      increaseZoom: (step = 0.05) => {
        get().setZoomLevel(get().zoomLevel + step);
      },

      decreaseZoom: (step = 0.05) => {
        get().setZoomLevel(get().zoomLevel - step);
      },

      setFontFamily: (fontFamily) => set({ fontFamily }),

      setLineSpacing: (lineSpacing) => set({ lineSpacing }),

      setPageLayoutMode: (pageLayoutMode) => set({ pageLayoutMode }),

      toggleAppearancePopover: () =>
        set((state) => ({ isAppearancePopoverOpen: !state.isAppearancePopoverOpen })),

      setAppearancePopoverOpen: (isAppearancePopoverOpen) => set({ isAppearancePopoverOpen }),

      reset: () =>
        set({
          fontSize: getDefaultFontSize(),
          zoomLevel: 1.0,
          settledZoomLevel: 1.0,
          fontFamily: 'serif',
          lineSpacing: 1.85,
          pageLayoutMode: 'separated',
          isAppearancePopoverOpen: false,
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => (hasLocalStorage() ? localStorage : noopStorage)),
      partialize: (state): PersistedTypographyState => ({
        fontSize: state.fontSize,
        fontFamily: state.fontFamily,
        lineSpacing: state.lineSpacing,
        pageLayoutMode: state.pageLayoutMode,
      }),
      merge: (persistedState, currentState) => {
        const saved = persistedState as Partial<PersistedTypographyState> | undefined;
        if (!saved) return currentState;

        const fontSize =
          typeof saved.fontSize === 'number' &&
          saved.fontSize >= MIN_FONT_SIZE &&
          saved.fontSize <= MAX_FONT_SIZE
            ? saved.fontSize
            : currentState.fontSize;

        const fontFamily = isFontFamilyChoice(saved.fontFamily)
          ? saved.fontFamily
          : currentState.fontFamily;

        const lineSpacing =
          typeof saved.lineSpacing === 'number' ? saved.lineSpacing : currentState.lineSpacing;

        const pageLayoutMode: PageLayoutMode =
          saved.pageLayoutMode === 'continuous' || saved.pageLayoutMode === 'separated'
            ? saved.pageLayoutMode
            : currentState.pageLayoutMode;

        return {
          ...currentState,
          fontSize,
          fontFamily,
          lineSpacing,
          pageLayoutMode,
        };
      },
    }
  )
);
