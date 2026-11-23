import type { BookMetadata } from '@domain/BookMetadata';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

export type AppViewMode = 'library' | 'reader' | 'settings';
export type LibraryTabId = 'recents' | 'all' | 'highlights' | 'lists';

export interface NavigationContextValue {
  readonly currentView: AppViewMode;
  readonly libraryTab: LibraryTabId;
  readonly selectedBook: BookMetadata | null;
  setCurrentView(view: AppViewMode): void;
  setLibraryTab(tab: LibraryTabId): void;
  openReader(book?: BookMetadata): void;
  closeReader(): void;
  openSettings(): void;
  closeSettings(): void;
}

export const NavigationContext = createContext<NavigationContextValue | null>(null);

export interface NavigationProviderProps {
  readonly children?: ReactNode;
  readonly initialView?: AppViewMode;
  readonly initialLibraryTab?: LibraryTabId;
}

export function NavigationProvider({
  children,
  initialView = 'library',
  initialLibraryTab = 'recents',
}: NavigationProviderProps) {
  const [currentView, setCurrentView] = useState<AppViewMode>(initialView);
  const [libraryTab, setLibraryTab] = useState<LibraryTabId>(initialLibraryTab);
  const [selectedBook, setSelectedBook] = useState<BookMetadata | null>(null);

  const openReader = useCallback((book?: BookMetadata) => {
    if (book) {
      setSelectedBook(book);
    }
    setCurrentView('reader');
  }, []);

  const closeReader = useCallback(() => {
    setCurrentView('library');
  }, []);

  const openSettings = useCallback(() => {
    setCurrentView('settings');
  }, []);

  const closeSettings = useCallback(() => {
    setCurrentView('library');
  }, []);

  const value = useMemo<NavigationContextValue>(
    () => ({
      currentView,
      libraryTab,
      selectedBook,
      setCurrentView,
      setLibraryTab,
      openReader,
      closeReader,
      openSettings,
      closeSettings,
    }),
    [currentView, libraryTab, selectedBook, openReader, closeReader, openSettings, closeSettings]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
