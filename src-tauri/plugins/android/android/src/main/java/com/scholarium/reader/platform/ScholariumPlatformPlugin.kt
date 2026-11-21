package com.scholarium.reader.platform

import android.app.Activity
import androidx.core.view.WindowCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class SetSystemBarsArgs {
    var isDark: Boolean = true
}

@TauriPlugin
class ScholariumPlatformPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun setSystemBars(invoke: Invoke) {
        val args = invoke.parseArgs(SetSystemBarsArgs::class.java)
        activity.runOnUiThread {
            val controller = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
            controller.isAppearanceLightStatusBars = !args.isDark
            controller.isAppearanceLightNavigationBars = !args.isDark
        }
        invoke.resolve()
    }
}
