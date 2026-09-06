use std::sync::Mutex;
use std::time::Duration;

use semver::Version;
use serde::Serialize;
use tauri::State;

/// GitHub API endpoint for the newest published (non-prerelease) release.
const LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/Maximus7474/gpx-editor/releases/latest";

/// Fallback release page shown when the API response has no html_url.
const RELEASES_PAGE: &str = "https://github.com/Maximus7474/gpx-editor/releases";

/// Result of an update check, ready for the Settings page.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// Version of the running build (from Cargo.toml).
    pub current_version: String,
    /// Version of the latest published release (tag without the leading `v`).
    pub latest_version: String,
    /// Whether a newer release exists.
    pub has_update: bool,
    /// URL of the release page on GitHub.
    pub release_url: String,
    /// ISO-8601 publish timestamp of the latest release.
    pub published_at: Option<String>,
    /// Markdown release notes of the latest release.
    pub release_notes: Option<String>,
}

/// Managed state: caches the last successful check so repeat calls within a
/// session don't hit the GitHub API again.
pub struct UpdateCheckCache(pub Mutex<Option<UpdateStatus>>);

/// Current build version, read straight from the compiled binary.
#[tauri::command]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Check GitHub for a newer release. The first call hits the network; later
/// calls return the cached result unless `force` is set.
#[tauri::command]
pub async fn check_for_updates(
    cache: State<'_, UpdateCheckCache>,
    force: Option<bool>,
) -> Result<UpdateStatus, String> {
    if force != Some(true) {
        if let Some(status) = cache.0.lock().map(|guard| guard.clone()).unwrap_or(None) {
            return Ok(status);
        }
    }

    let status = fetch_latest_release().await?;
    *cache.0.lock().unwrap() = Some(status.clone());
    Ok(status)
}

async fn fetch_latest_release() -> Result<UpdateStatus, String> {
    let client = reqwest::Client::builder()
        .user_agent(format!("gpx-editor/{}", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("cannot build HTTP client: {e}"))?;

    let response = client
        .get(LATEST_RELEASE_URL)
        .send()
        .await
        .map_err(|e| format!("cannot reach the GitHub API: {e}"))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("no releases have been published yet".into());
    }
    let release: serde_json::Value = response
        .error_for_status()
        .map_err(|e| format!("the GitHub API returned an error: {e}"))?
        .json()
        .await
        .map_err(|e| format!("cannot parse the GitHub response: {e}"))?;

    let tag = release
        .get("tag_name")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "the GitHub response is missing a tag_name".to_string())?;
    let release_url = release
        .get("html_url")
        .and_then(serde_json::Value::as_str)
        .map(String::from)
        .unwrap_or_else(|| RELEASES_PAGE.to_string());
    let published_at = release
        .get("published_at")
        .and_then(serde_json::Value::as_str)
        .map(String::from);
    let release_notes = release
        .get("body")
        .and_then(serde_json::Value::as_str)
        .map(String::from);

    let current = parse_version(env!("CARGO_PKG_VERSION"))?;
    let latest = parse_version(tag)?;

    Ok(UpdateStatus {
        current_version: current.to_string(),
        latest_version: latest.to_string(),
        has_update: latest > current,
        release_url,
        published_at,
        release_notes,
    })
}

/// Release tags are `v0.1.0`; strip the leading `v` before parsing.
fn parse_version(raw: &str) -> Result<Version, String> {
    Version::parse(raw.strip_prefix('v').unwrap_or(raw))
        .map_err(|e| format!("cannot parse version `{raw}`: {e}"))
}

#[cfg(test)]
mod tests {
    use super::parse_version;

    #[test]
    fn parses_plain_and_v_prefixed_tags() {
        assert_eq!(
            parse_version("0.1.0").unwrap(),
            parse_version("v0.1.0").unwrap()
        );
        assert!(parse_version("0.3.0-rc.1").is_ok());
    }

    #[test]
    fn rejects_garbage() {
        assert!(parse_version("banana").is_err());
        assert!(parse_version("").is_err());
    }

    #[test]
    fn compares_release_versions() {
        let older = parse_version("0.1.0").unwrap();
        let newer = parse_version("0.2.0").unwrap();
        let prerelease = parse_version("0.3.0-rc.1").unwrap();
        let released = parse_version("0.3.0").unwrap();

        assert!(newer > older);
        assert!(!(older > newer));
        // A prerelease is newer than the previous release but older than its
        // final version — so rc.1 of 0.3.0 would count as an update over 0.2.0.
        assert!(prerelease > newer);
        assert!(released > prerelease);
    }
}
