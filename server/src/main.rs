use checkboxes_server::{common::PResult, config::Settings, server::BitmapServer};

#[tokio::main]
async fn main() -> PResult<()> {
    let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());
    pretty_env_logger::formatted_timed_builder()
        .filter_level(log_level.parse()?)
        .try_init()?;

    log::info!("Starting server");
    let settings = Settings::load_from_file_and_env()?;

    BitmapServer::new(settings).run().await?;

    Ok(())
}
