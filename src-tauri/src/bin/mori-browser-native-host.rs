#[path = "../browser_native_messaging.rs"]
mod browser_native_messaging;
#[path = "../browser_relay_protocol.rs"]
mod browser_relay_protocol;

fn main() {
    if let Err(error) = browser_native_messaging::run_browser_native_host() {
        eprintln!("mori-browser-native-host failed: {error}");
        std::process::exit(1);
    }
}
