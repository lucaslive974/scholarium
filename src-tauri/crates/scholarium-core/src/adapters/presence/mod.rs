pub mod discord_presence_adapter;
pub mod discord_presence_client;

pub use discord_presence_adapter::{
    resolve_discord_client_id, DiscordPresenceAdapter, NativeDiscordPresenceAdapter,
};
pub use discord_presence_client::{DiscordPresenceClient, NativeDiscordPresenceClient};
