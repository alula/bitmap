pub type PResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync + 'static>>;

pub const CONFIG_PATH: &str = "config.toml";
pub const STATE_PATH: &str = "state.bin";
pub const METRICS_PATH: &str = "metrics.json";
