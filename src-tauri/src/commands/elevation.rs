//! Elevation lookups for the trace editor (opentopodata SRTM 90 m).
//!
//! The fetch runs on the Rust side because the DEM API does not send CORS
//! headers, which would block a browser-level fetch from the app (the updates
//! check has the same shape). The frontend caches results per coordinate and
//! treats failures (offline, rate-limited, missing tile) as "no data" — those
//! stay uncached so a later attempt can retry.

use std::time::Duration;

use serde::Deserialize;

const API_URL: &str = "https://api.opentopodata.org/v1/srtm90m";
const CHUNK_SIZE: usize = 90;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Deserialize)]
struct LookupResponse {
    results: Vec<Option<ElevationResult>>,
}

#[derive(Debug, Deserialize)]
struct ElevationResult {
    elevation: Option<f64>,
}

/// Resolve elevations for the given lat/lon pairs, aligned to the input order.
/// Entries are `null` when a lookup failed for that coordinate.
#[tauri::command]
pub async fn lookup_elevations(locations: Vec<(f64, f64)>) -> Result<Vec<Option<f64>>, String> {
    if locations.is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;

    let mut elevations = vec![None; locations.len()];
    for (chunk_index, chunk) in locations.chunks(CHUNK_SIZE).enumerate() {
        let query = build_locations_query(chunk);
        let url = format!("{API_URL}?locations={query}");
        match fetch_chunk(&client, &url).await {
            Ok(values) => {
                let offset = chunk_index * CHUNK_SIZE;
                for (i, value) in values.into_iter().enumerate() {
                    elevations[offset + i] = value;
                }
            }
            Err(err) => {
                // Keep this chunk as `null` (offline, rate-limited…) — the
                // frontend shows a flat profile rather than failing the trace.
                eprintln!("elevation lookup failed: {err}");
            }
        }
    }
    Ok(elevations)
}

async fn fetch_chunk(client: &reqwest::Client, url: &str) -> Result<Vec<Option<f64>>, String> {
    let response = client
        .get(url)
        .header("User-Agent", "gpx-editor")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let payload: LookupResponse = response.json().await.map_err(|e| e.to_string())?;
    Ok(payload
        .results
        .into_iter()
        .map(|result| result.and_then(|result| result.elevation))
        .collect())
}

/// `lat,lon|lat,lon…` with the same 5-decimal precision the frontend uses as
/// its cache key.
fn build_locations_query(locations: &[(f64, f64)]) -> String {
    locations
        .iter()
        .map(|(lat, lon)| format!("{lat:.5},{lon:.5}"))
        .collect::<Vec<_>>()
        .join("|")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn query_builder_formats_precision_and_separator() {
        let query = build_locations_query(&[(46.072153, 6.748351), (46.0, 6.75)]);
        assert_eq!(query, "46.07215,6.74835|46.00000,6.75000");
    }

    #[test]
    fn empty_input_returns_empty() {
        let query = build_locations_query(&[]);
        assert_eq!(query, "");
    }
}