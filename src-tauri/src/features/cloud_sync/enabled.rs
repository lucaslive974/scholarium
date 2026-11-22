use crate::state::{AppStorage, BackendState};
use crate::sync_scheduler::{
    empty_status, load_configured_interval_secs, SyncDirtySignal, SyncSchedulerHandle,
};
use scholarium_core::adapters::backup::CloudBackupDestination;
use scholarium_core::adapters::cloud::{
    AuthenticatedHttpTransport, FileCloudCredentialStore, GoogleDriveAppDataAdapter,
    GoogleOAuthConfig, GoogleOAuthPkceAdapter, PkceChallenge, UreqHttpTransport,
};
use scholarium_core::core::domain::AppStoragePaths;
use scholarium_core::core::ports::{
    BackupDestination, CloudAuthProvider, CloudStorageProvider, PlatformEnvironment,
};
use std::sync::Arc;

pub struct PendingGoogleOAuth {
    pub pkce: PkceChallenge,
    pub adapter: Arc<GoogleOAuthPkceAdapter>,
}

pub struct CloudSyncState {
    pub sync_dirty: SyncDirtySignal,
    pub credential_store: Arc<FileCloudCredentialStore>,
    pub cloud_auth: Option<Arc<GoogleOAuthPkceAdapter>>,
    pub pending_oauth: Option<PendingGoogleOAuth>,
}

impl CloudSyncState {
    pub fn init(platform: &dyn PlatformEnvironment, storage: &mut AppStorage) -> Self {
        let credential_store = Arc::new(
            FileCloudCredentialStore::for_platform(platform).unwrap_or_else(|_| {
                FileCloudCredentialStore::new(
                    std::env::temp_dir().join(AppStoragePaths::CLOUD_CREDENTIALS_FILENAME),
                )
            }),
        );
        let cloud_auth = restore_google_session(&credential_store);
        if let Some(ref auth) = cloud_auth {
            let authed_http = Arc::new(AuthenticatedHttpTransport::new(
                Arc::new(UreqHttpTransport::new()),
                auth.clone(),
            ));
            let remote: Arc<dyn CloudStorageProvider> =
                Arc::new(GoogleDriveAppDataAdapter::new(authed_http));
            storage.set_remote(Some(remote));
        }

        Self {
            sync_dirty: SyncDirtySignal::default(),
            credential_store,
            cloud_auth,
            pending_oauth: None,
        }
    }

    pub fn mark_dirty(&self) {
        self.sync_dirty.mark_dirty();
    }
}

pub fn configure(
    builder: tauri::Builder<tauri::Wry>,
    backend_state: &BackendState,
) -> tauri::Builder<tauri::Wry> {
    let initial_interval = load_configured_interval_secs(&backend_state.config_store);
    let initial_status = empty_status(initial_interval, backend_state);
    let sync_scheduler = SyncSchedulerHandle::new(
        initial_interval,
        initial_status,
        backend_state.cloud_sync.sync_dirty.clone(),
    );
    let bg_scheduler = sync_scheduler.clone();
    let builder = attach_mobile_deep_link_plugin(builder);

    builder.manage(sync_scheduler).setup(move |app| {
        bg_scheduler.spawn_background_loop(app.handle().clone());
        setup_mobile_deep_link(app);
        Ok(())
    })
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn attach_mobile_deep_link_plugin(
    builder: tauri::Builder<tauri::Wry>,
) -> tauri::Builder<tauri::Wry> {
    builder.plugin(tauri_plugin_deep_link::init())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn attach_mobile_deep_link_plugin(
    builder: tauri::Builder<tauri::Wry>,
) -> tauri::Builder<tauri::Wry> {
    builder
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn setup_mobile_deep_link(app: &tauri::App) {
    use super::commands as sync;
    use tauri_plugin_deep_link::DeepLinkExt;

    if let Ok(Some(urls)) = app.deep_link().get_current() {
        for url in urls {
            sync::handle_oauth_callback_url(app.handle(), url.as_str());
        }
    }
    let deep_link_app = app.handle().clone();
    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            sync::handle_oauth_callback_url(&deep_link_app, url.as_str());
        }
    });
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn setup_mobile_deep_link(_app: &tauri::App) {}

pub fn remote_backup_destination(storage: &AppStorage) -> Option<Arc<dyn BackupDestination>> {
    storage
        .remote()
        .map(|cloud| Arc::new(CloudBackupDestination::new(cloud)) as Arc<dyn BackupDestination>)
}

/// Wakes the async sync scheduler to flush any pending sync before exiting.
/// Returns `true` if exit should be deferred until the flush completes.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn flush_dirty_sync_before_exit(app: &tauri::AppHandle) -> bool {
    use tauri::Manager;

    let Some(scheduler) = app.try_state::<SyncSchedulerHandle>() else {
        return false;
    };
    let Some(backend) = app.try_state::<std::sync::Mutex<BackendState>>() else {
        return false;
    };

    let is_connected = backend
        .lock()
        .ok()
        .and_then(|g| g.storage.remote())
        .is_some();
    is_connected && scheduler.request_shutdown_flush()
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn flush_dirty_sync_before_exit(_app: &tauri::AppHandle) -> bool {
    false
}

fn restore_google_session(
    credential_store: &Arc<FileCloudCredentialStore>,
) -> Option<Arc<GoogleOAuthPkceAdapter>> {
    let cfg = GoogleOAuthConfig::resolve("http://127.0.0.1:42813/oauth/callback").ok()?;
    let adapter = Arc::new(GoogleOAuthPkceAdapter::new(
        cfg,
        credential_store.clone(),
        Arc::new(UreqHttpTransport::new()),
    ));
    if adapter.session().ok()?.connected {
        Some(adapter)
    } else {
        None
    }
}
