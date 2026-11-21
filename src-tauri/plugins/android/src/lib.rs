#[cfg(target_os = "android")]
use serde::Serialize;
use tauri::plugin::{Builder, TauriPlugin};
#[cfg(target_os = "android")]
use tauri::Manager;
use tauri::Runtime;

#[cfg(target_os = "android")]
const PLUGIN_PACKAGE: &str = "com.scholarium.reader.platform";

#[cfg(target_os = "android")]
struct AndroidPlatformHandle<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[cfg(target_os = "android")]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SetSystemBarsPayload {
    is_dark: bool,
}

#[tauri::command]
fn set_system_bars<R: Runtime>(app: tauri::AppHandle<R>, is_dark: bool) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(handle) = app.try_state::<AndroidPlatformHandle<R>>() {
            handle
                .0
                .run_mobile_plugin::<()>("setSystemBars", SetSystemBarsPayload { is_dark })
                .map_err(|e| e.to_string())?;
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = (app, is_dark);

    Ok(())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("scholarium-android")
        .invoke_handler(tauri::generate_handler![set_system_bars])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle =
                    api.register_android_plugin(PLUGIN_PACKAGE, "ScholariumPlatformPlugin")?;
                app.manage(AndroidPlatformHandle(handle));
            }
            #[cfg(not(target_os = "android"))]
            let _ = (app, api);
            Ok(())
        })
        .build()
}
