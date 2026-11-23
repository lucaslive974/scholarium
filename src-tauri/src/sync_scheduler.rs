use crate::state::BackendState;
use crate::utils::current_epoch_ms;
use scholarium_core::adapters::configuration::SqliteConfigurationStore;
use scholarium_core::adapters::persistence::{SqliteBookRepository, SqliteHighlightRepository};
use scholarium_core::core::domain::{PlatformKind, SyncReport};
use scholarium_core::core::ports::{
    CloudAuthKind, CloudAuthProvider, ConfigurationStore, LogEntry, LogLevel, LogService,
};
use scholarium_core::core::services::{CloudSyncEngine, LocalSyncCursor};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};
use tokio::sync::Notify;

pub const SYNC_STATUS_EVENT: &str = "sync:status";
pub const SYNC_INTERVAL_CONFIG_KEY: &str = "cloud_sync_interval_secs";
pub const DEFAULT_SYNC_INTERVAL_SECS: u64 = 300;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudProviderDto {
    pub id: String,
    pub display_name: String,
    pub auth_kind: CloudAuthKind,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudSyncStatusDto {
    pub state: String,
    pub connected: bool,
    pub provider_id: Option<String>,
    pub account_label: Option<String>,
    pub interval_secs: u64,
    pub last_synced_at_ms: Option<i64>,
    pub last_revision: u64,
    pub last_pulled_books: usize,
    pub last_pushed_books: usize,
    pub last_deleted_books: usize,
    pub last_error: Option<String>,
    pub available_providers: Vec<CloudProviderDto>,
}

#[derive(Default)]
struct DirtyState {
    count: usize,
    last_marked_at: Option<Instant>,
}

/// Shared dirty-change counter + async wakeup signal for `SyncSchedulerHandle`.
///
/// Counts spaced local mutations (at least `MARK_COOLDOWN` apart once pending) and wakes
/// the background loop early once `BATCH_THRESHOLD` changes accumulate.
#[derive(Clone, Default)]
pub struct SyncDirtySignal {
    state: Arc<Mutex<DirtyState>>,
    notify: Arc<Notify>,
}

impl SyncDirtySignal {
    pub const BATCH_THRESHOLD: usize = 5;
    pub const MARK_COOLDOWN: Duration = Duration::from_secs(5);

    pub fn mark_dirty(&self) {
        let should_notify = {
            let Ok(mut state) = self.state.lock() else {
                return;
            };
            let now = Instant::now();
            if state.count > 0 {
                if let Some(last) = state.last_marked_at {
                    if now.duration_since(last) < Self::MARK_COOLDOWN {
                        return;
                    }
                }
            }
            state.count += 1;
            state.last_marked_at = Some(now);
            state.count >= Self::BATCH_THRESHOLD
        };
        if should_notify {
            self.notify.notify_one();
        }
    }

    /// Marks pending local changes and wakes the background scheduler immediately,
    /// bypassing `BATCH_THRESHOLD` and `MARK_COOLDOWN`.
    pub fn mark_dirty_and_notify(&self) {
        {
            let Ok(mut state) = self.state.lock() else {
                return;
            };
            if state.count == 0 {
                state.count = 1;
            }
            state.last_marked_at = Some(Instant::now());
        }
        self.notify.notify_one();
    }

    pub fn has_pending(&self) -> bool {
        self.state.lock().map(|s| s.count > 0).unwrap_or(false)
    }

    pub fn take_pending(&self) -> bool {
        let Ok(mut state) = self.state.lock() else {
            return false;
        };
        let had_pending = state.count > 0;
        state.count = 0;
        state.last_marked_at = None;
        had_pending
    }

    pub fn notify(&self) {
        self.notify.notify_one();
    }

    pub async fn notified(&self) {
        self.notify.notified().await;
    }
}

/// Backend-owned synchronization scheduler handle.
///
/// Manages cheap periodic ETag polling, batched write debouncing (`SyncDirtySignal`),
/// single-flight concurrency protection, and reactive `sync:status` event emission.
#[derive(Clone)]
pub struct SyncSchedulerHandle {
    interval_secs: Arc<AtomicU64>,
    dirty: SyncDirtySignal,
    syncing: Arc<AtomicBool>,
    shutting_down: Arc<AtomicBool>,
    last_status: Arc<Mutex<CloudSyncStatusDto>>,
}

impl SyncSchedulerHandle {
    pub fn new(
        initial_interval_secs: u64,
        initial_status: CloudSyncStatusDto,
        dirty: SyncDirtySignal,
    ) -> Self {
        Self {
            interval_secs: Arc::new(AtomicU64::new(initial_interval_secs)),
            dirty,
            syncing: Arc::new(AtomicBool::new(false)),
            shutting_down: Arc::new(AtomicBool::new(false)),
            last_status: Arc::new(Mutex::new(initial_status)),
        }
    }

    pub fn mark_dirty(&self) {
        self.dirty.mark_dirty();
    }

    /// Marks pending sync state, transitions status to `"syncing"`, and wakes the background loop immediately.
    pub fn request_immediate_sync(&self) {
        if let Ok(mut status) = self.last_status.lock() {
            status.state = "syncing".to_string();
            status.last_error = None;
        }
        self.dirty.mark_dirty_and_notify();
    }

    /// Signals the async scheduler loop to flush any pending sync and exit the app.
    /// Returns `true` if a pending or in-flight sync should complete before exiting.
    pub fn request_shutdown_flush(&self) -> bool {
        self.shutting_down.store(true, Ordering::SeqCst);
        let needs_flush = self.dirty.has_pending() || self.syncing.load(Ordering::SeqCst);
        if needs_flush {
            self.dirty.notify();
        }
        needs_flush
    }

    pub fn interval_secs(&self) -> u64 {
        self.interval_secs.load(Ordering::SeqCst)
    }

    pub fn set_interval_secs(&self, secs: u64) {
        self.interval_secs.store(secs, Ordering::SeqCst);
        if let Ok(mut status) = self.last_status.lock() {
            status.interval_secs = secs;
        }
    }

    pub fn snapshot(&self, backend: &BackendState) -> CloudSyncStatusDto {
        let mut dto = self
            .last_status
            .lock()
            .map(|s| s.clone())
            .unwrap_or_else(|_| empty_status(self.interval_secs(), backend));
        refresh_connection_fields(&mut dto, backend, self.interval_secs());
        dto
    }

    pub fn emit_current(&self, app: &tauri::AppHandle, backend: &BackendState) {
        let dto = self.snapshot(backend);
        if let Ok(mut guard) = self.last_status.lock() {
            *guard = dto.clone();
        }
        let _ = app.emit(SYNC_STATUS_EVENT, &dto);
    }

    pub fn emit_error(&self, app: &tauri::AppHandle, backend: &BackendState, message: &str) {
        self.update_and_emit(app, backend, |s| {
            s.state = "error".to_string();
            s.last_error = Some(message.to_string());
        });
    }

    /// Starts the backend-owned async polling/debounce loop on Tauri's async runtime.
    pub fn spawn_background_loop(&self, app: tauri::AppHandle) {
        let handle = self.clone();
        tauri::async_runtime::spawn(async move {
            let mut last_poll = Instant::now();

            loop {
                let interval = handle.interval_secs();
                let wait_secs = match interval {
                    0 => DEFAULT_SYNC_INTERVAL_SECS,
                    n => n.min(DEFAULT_SYNC_INTERVAL_SECS),
                };

                if !handle.shutting_down.load(Ordering::SeqCst) {
                    let _ = tokio::time::timeout(
                        Duration::from_secs(wait_secs),
                        handle.dirty.notified(),
                    )
                    .await;
                }

                let is_shutting_down = handle.shutting_down.load(Ordering::SeqCst);
                let is_dirty = handle.dirty.take_pending();
                let should_poll = !is_shutting_down
                    && interval > 0
                    && last_poll.elapsed() >= Duration::from_secs(interval);

                if is_dirty || should_poll {
                    let task_app = app.clone();
                    let task_handle = handle.clone();
                    let _ = tauri::async_runtime::spawn_blocking(move || match is_dirty {
                        true => {
                            let _ = task_handle.run_sync_now(&task_app);
                        }
                        false => {
                            let _ = task_handle.check_and_sync_if_remote_changed(&task_app);
                        }
                    })
                    .await;
                    last_poll = Instant::now();
                }

                if is_shutting_down {
                    app.exit(0);
                    break;
                }
            }
        });
    }

    /// Cheap ETag check (`HEAD sync-manifest.json`); only runs full sync when remote ETag differs.
    pub fn check_and_sync_if_remote_changed(
        &self,
        app: &tauri::AppHandle,
    ) -> Result<Option<SyncReport>, String> {
        let state = app
            .try_state::<Mutex<BackendState>>()
            .ok_or_else(|| "Backend state unavailable".to_string())?;

        let (cloud, db_path) = {
            let guard = state.lock().map_err(|e| e.to_string())?;
            let Some(cloud) = guard.storage.remote() else {
                return Ok(None);
            };
            let db_path = guard.platform_env.default_database_path()?;
            (cloud, db_path)
        };

        let should_sync = {
            let config_store = SqliteConfigurationStore::open_file(&db_path)?;
            let engine = CloudSyncEngine::new();
            engine.check_remote_changed(&config_store, cloud.as_ref())?
        };

        if should_sync {
            self.run_sync_now(app).map(Some)
        } else {
            Ok(None)
        }
    }

    /// Executes a single-flight full cloud synchronization cycle and emits `sync:status`.
    pub fn run_sync_now(&self, app: &tauri::AppHandle) -> Result<SyncReport, String> {
        if self.syncing.swap(true, Ordering::SeqCst) {
            return Err("Cloud synchronization is already in progress".to_string());
        }

        let _ = self.dirty.take_pending();
        let result = self.execute_sync_guarded(app);
        self.syncing.store(false, Ordering::SeqCst);
        result
    }

    fn execute_sync_guarded(&self, app: &tauri::AppHandle) -> Result<SyncReport, String> {
        let state = app
            .try_state::<Mutex<BackendState>>()
            .ok_or_else(|| "Backend state unavailable".to_string())?;

        let (cloud, mut storage, db_path) = {
            let guard = state.lock().map_err(|e| e.to_string())?;
            let Some(cloud) = guard.storage.remote() else {
                return Err("No cloud provider connected".to_string());
            };
            let db_path = guard.platform_env.default_database_path()?;
            self.update_and_emit(app, &guard, |s| {
                s.state = "syncing".to_string();
                s.last_error = None;
            });
            (cloud, guard.storage.clone(), db_path)
        };

        let now_ms = current_epoch_ms();
        let sync_result = (|| -> Result<SyncReport, String> {
            let mut book_repo = SqliteBookRepository::open_file(&db_path)?;
            let mut highlight_repo = SqliteHighlightRepository::open_file(&db_path)?;
            let mut config_store = SqliteConfigurationStore::open_file(&db_path)?;
            let engine = CloudSyncEngine::new();
            engine.sync_once(
                &mut book_repo,
                &mut highlight_repo,
                &mut storage,
                &mut config_store,
                cloud.as_ref(),
                now_ms,
            )
        })();

        if let Ok(mut guard) = state.lock() {
            match &sync_result {
                Ok(report) => {
                    let _ = guard.logger.log(LogEntry::new(
                        now_ms,
                        LogLevel::Status,
                        "cloud_sync",
                        format!(
                            "Cloud sync completed (rev {}, pulled {}, pushed {}, blobs {})",
                            report.revision,
                            report.pulled_books,
                            report.pushed_books,
                            report.uploaded_blobs
                        ),
                    ));
                    self.update_and_emit(app, &guard, |s| {
                        s.state = "synced".to_string();
                        s.last_synced_at_ms = Some(report.synced_at_ms);
                        s.last_revision = report.revision;
                        s.last_pulled_books = report.pulled_books;
                        s.last_pushed_books = report.pushed_books;
                        s.last_deleted_books = report.deleted_books;
                        s.last_error = None;
                    });
                }
                Err(err) => {
                    let session_disconnected = guard
                        .cloud_sync
                        .cloud_auth
                        .as_ref()
                        .and_then(|auth| auth.session().ok())
                        .is_some_and(|session| !session.connected);
                    if session_disconnected {
                        guard.storage.set_remote(None);
                        guard.cloud_sync.cloud_auth = None;
                    }
                    let _ = guard.logger.log(LogEntry::new(
                        now_ms,
                        LogLevel::Error,
                        "cloud_sync",
                        format!("Cloud sync failed: {err}"),
                    ));
                    self.update_and_emit(app, &guard, |s| {
                        s.state = "error".to_string();
                        s.last_error = Some(err.clone());
                    });
                }
            }
        }

        sync_result
    }

    fn update_and_emit<F>(&self, app: &tauri::AppHandle, backend: &BackendState, mutate: F)
    where
        F: FnOnce(&mut CloudSyncStatusDto),
    {
        if let Ok(mut status) = self.last_status.lock() {
            refresh_connection_fields(&mut status, backend, self.interval_secs());
            mutate(&mut status);
            let _ = app.emit(SYNC_STATUS_EVENT, &*status);
        }
    }
}

pub fn load_configured_interval_secs<C: ConfigurationStore>(config: &C) -> u64 {
    config
        .get(SYNC_INTERVAL_CONFIG_KEY)
        .ok()
        .flatten()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(DEFAULT_SYNC_INTERVAL_SECS)
}

pub fn available_providers_for_platform(platform: PlatformKind) -> Vec<CloudProviderDto> {
    let all = [scholarium_core::core::ports::CloudProviderDescriptor {
        id: scholarium_core::adapters::cloud::GOOGLE_DRIVE_PROVIDER_ID,
        display_name: "Google Drive",
        auth_kind: CloudAuthKind::OAuthPkce,
        supported_platforms: &[
            PlatformKind::Linux,
            PlatformKind::Windows,
            PlatformKind::Android,
            PlatformKind::Ios,
        ],
    }];

    all.into_iter()
        .filter(|d| d.supports_platform(platform))
        .map(|d| CloudProviderDto {
            id: d.id.to_string(),
            display_name: d.display_name.to_string(),
            auth_kind: d.auth_kind,
        })
        .collect()
}

pub fn empty_status(interval_secs: u64, backend: &BackendState) -> CloudSyncStatusDto {
    let cursor = LocalSyncCursor::load(&backend.config_store).unwrap_or_default();
    let initial_state = if cursor.last_revision > 0 && backend.cloud_sync.cloud_auth.is_some() {
        "synced".to_string()
    } else {
        "idle".to_string()
    };
    let mut dto = CloudSyncStatusDto {
        state: initial_state,
        connected: false,
        provider_id: None,
        account_label: None,
        interval_secs,
        last_synced_at_ms: cursor.last_synced_at_ms,
        last_revision: cursor.last_revision,
        last_pulled_books: 0,
        last_pushed_books: 0,
        last_deleted_books: 0,
        last_error: None,
        available_providers: available_providers_for_platform(backend.platform_env.platform_kind()),
    };
    refresh_connection_fields(&mut dto, backend, interval_secs);
    dto
}

fn refresh_connection_fields(
    dto: &mut CloudSyncStatusDto,
    backend: &BackendState,
    interval_secs: u64,
) {
    dto.interval_secs = interval_secs;
    dto.available_providers =
        available_providers_for_platform(backend.platform_env.platform_kind());
    if let Some(auth) = &backend.cloud_sync.cloud_auth {
        if let Ok(session) = auth.session() {
            dto.connected = session.connected;
            dto.provider_id = if session.connected {
                Some(session.provider_id)
            } else {
                None
            };
            dto.account_label = session.account_label;
            return;
        }
    }
    dto.connected = false;
    dto.provider_id = None;
    dto.account_label = None;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_status(interval_secs: u64) -> CloudSyncStatusDto {
        CloudSyncStatusDto {
            state: "idle".to_string(),
            connected: false,
            provider_id: None,
            account_label: None,
            interval_secs,
            last_synced_at_ms: None,
            last_revision: 0,
            last_pulled_books: 0,
            last_pushed_books: 0,
            last_deleted_books: 0,
            last_error: None,
            available_providers: Vec::new(),
        }
    }

    #[test]
    fn mark_dirty_below_threshold_does_not_notify_immediately() {
        let signal = SyncDirtySignal::default();
        signal.mark_dirty();
        assert!(signal.has_pending());

        let woke = tauri::async_runtime::block_on(async {
            tokio::time::timeout(Duration::from_millis(20), signal.notified())
                .await
                .is_ok()
        });
        assert!(!woke);
    }

    #[test]
    fn mark_dirty_and_notify_wakes_even_within_cooldown_and_below_threshold() {
        let signal = SyncDirtySignal::default();
        signal.mark_dirty();
        signal.mark_dirty_and_notify();

        assert!(signal.has_pending());
        let woke = tauri::async_runtime::block_on(async {
            tokio::time::timeout(Duration::from_millis(50), signal.notified())
                .await
                .is_ok()
        });
        assert!(woke);
        assert!(signal.take_pending());
        assert!(!signal.has_pending());
    }

    #[test]
    fn request_immediate_sync_sets_syncing_and_wakes_scheduler_signal() {
        let dirty = SyncDirtySignal::default();
        let scheduler = SyncSchedulerHandle::new(300, test_status(300), dirty.clone());

        scheduler.request_immediate_sync();

        assert!(dirty.has_pending());
        let status = scheduler.last_status.lock().expect("status lock");
        assert_eq!(status.state, "syncing");
        assert_eq!(status.last_error, None);
        drop(status);
        let woke = tauri::async_runtime::block_on(async {
            tokio::time::timeout(Duration::from_millis(50), dirty.notified())
                .await
                .is_ok()
        });
        assert!(woke);
    }
}
