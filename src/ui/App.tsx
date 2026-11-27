import { LoadingSplash, TransitionOverlay } from '@ui';
import { Activity } from 'react';
import { CloudSyncOverlay } from './components/CloudSyncOverlay';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { SettingsView } from './components/SettingsView';
import { useAppStartup } from './hooks/useAppStartup';
import { useSystemHandler } from './hooks/useSystemHandler';
import { NavigationProvider, useNavigation } from './providers/NavigationContext';
import { ServiceContainerProvider } from './providers/ServiceContainerContext';
import { ThemeProvider, useTheme } from './providers/ThemeContext';

function AppRouter() {
  const { currentView, selectedBook, openReader, closeReader } = useNavigation();
  useSystemHandler({ onOpenBook: openReader });

  return (
    <>
      <Activity mode={currentView === 'library' ? 'visible' : 'hidden'}>
        <LibraryView />
      </Activity>
      {currentView === 'reader' && <ReaderView book={selectedBook} onClose={closeReader} />}
      {currentView === 'settings' && <SettingsView />}
    </>
  );
}

function AppShell() {
  const startup = useAppStartup();
  const { theme } = useTheme();

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed top-0 inset-x-0 z-40 h-safe-top bg-canvas pointer-events-none"
      />
      <AppRouter />
      <div
        aria-hidden="true"
        className="fixed bottom-0 inset-x-0 z-40 h-safe-bottom bg-canvas pointer-events-none"
      />
      {__ENABLE_CLOUD_SYNC__ && <CloudSyncOverlay />}
      <TransitionOverlay
        isVisible={startup.isOverlayVisible}
        minDisplayMs={startup.minDisplayMs}
        zIndexClass="z-50"
        testId="startup-transition-overlay"
      >
        <LoadingSplash
          status={startup.status}
          error={startup.error}
          theme={theme}
          onRetry={startup.retry}
          testId="startup-splash"
        />
      </TransitionOverlay>
    </>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ServiceContainerProvider>
        <NavigationProvider>
          <AppShell />
        </NavigationProvider>
      </ServiceContainerProvider>
    </ThemeProvider>
  );
}
