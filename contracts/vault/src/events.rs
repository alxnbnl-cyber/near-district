//! NEP-297 events. The worker indexes these to keep the database in sync with chain state.
use near_sdk::env;

pub fn emit(event: &str, data_json: &str) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"yielvy_vault\",\"version\":\"1.0.0\",\"event\":\"{}\",\"data\":[{}]}}",
        event, data_json
    ));
}
