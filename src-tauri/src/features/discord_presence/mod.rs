use scholarium_core::adapters::presence::NativeDiscordPresenceAdapter;
use scholarium_core::core::domain::PlatformKind;

#[cfg(feature = "discord-presence")]
pub fn is_supported(platform_kind: PlatformKind) -> bool {
    platform_kind.supports_discord_presence()
        && cfg!(not(any(target_os = "android", target_os = "ios")))
}

#[cfg(not(feature = "discord-presence"))]
pub fn is_supported(_platform_kind: PlatformKind) -> bool {
    false
}

#[cfg(feature = "discord-presence")]
pub fn create_provider(
    enabled: bool,
    platform_kind: PlatformKind,
) -> Option<NativeDiscordPresenceAdapter> {
    if !is_supported(platform_kind) {
        return None;
    }
    NativeDiscordPresenceAdapter::create_default(None, enabled)
}

#[cfg(not(feature = "discord-presence"))]
pub fn create_provider(
    _enabled: bool,
    _platform_kind: PlatformKind,
) -> Option<NativeDiscordPresenceAdapter> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_provider_respects_feature_flag_and_platform() {
        let provider = create_provider(true, PlatformKind::Linux);
        assert_eq!(
            is_supported(PlatformKind::Linux),
            cfg!(feature = "discord-presence")
        );
        let expected_some =
            cfg!(feature = "discord-presence") && option_env!("SCHOLARIUM_DISCORD_APP_ID").is_some();
        assert_eq!(provider.is_some(), expected_some);
        assert!(create_provider(true, PlatformKind::Android).is_none());
    }
}
