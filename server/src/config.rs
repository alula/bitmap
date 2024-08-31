use config::Config;
use serde::Deserialize;

use crate::common::{PResult, CONFIG_PATH};

#[derive(Debug, Deserialize)]
pub struct Settings {
    #[serde(default = "Settings::default_bind_address")]
    /// The address to bind the server to.
    pub bind_address: String,

    /// Use CF-Connecting-IP and X-Forwarded-For headers to determine the client's IP address.
    #[serde(default = "Settings::default_parse_proxy_headers")]
    pub parse_proxy_headers: bool,
}

impl Settings {
    pub fn load_from_file_and_env() -> PResult<Self> {
        let file = config::File::with_name(CONFIG_PATH)
            .format(config::FileFormat::Toml)
            .required(false);

        let settings = Config::builder()
            .add_source(file)
            .add_source(config::Environment::with_prefix("CB_"))
            .build()?;

        let settings = settings.try_deserialize::<Settings>()?;
        settings.sanity_check()?;
        Ok(settings)
    }

    fn sanity_check(&self) -> PResult<()> {
        Ok(())
    }

    fn default_bind_address() -> String {
        "[::1]:2253".to_string()
    }

    fn default_parse_proxy_headers() -> bool {
        true
    }
}
