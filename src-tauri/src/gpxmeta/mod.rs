//! GPX metadata extraction for the library index.
//!
//! This runs on the Rust side during import so entries can be listed, sorted,
//! and filtered without re-parsing XML on every launch. The full coordinate
//! data is still parsed separately in the frontend when a file is opened for
//! viewing (see `src/lib/gpx/`).
//!
//! Phase 2 note: when in-app editing lands, saving will re-run this metadata
//! extraction so the SQLite index stays in sync with the edited file.

use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use gpx_parser::read as read_gpx;
use serde::Serialize;

/// Bounding box covering every point in a GPX file.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bounds {
    pub min_lat: f64,
    pub min_lon: f64,
    pub max_lat: f64,
    pub max_lon: f64,
}

impl Bounds {
    fn extend_point(&mut self, lat: f64, lon: f64) {
        self.min_lat = self.min_lat.min(lat);
        self.max_lat = self.max_lat.max(lat);
        self.min_lon = self.min_lon.min(lon);
        self.max_lon = self.max_lon.max(lon);
    }
}

/// Summarized metadata stored in the `gpx_files` table at import time.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpxMetadata {
    pub name: Option<String>,
    pub track_count: usize,
    pub waypoint_count: usize,
    pub route_count: usize,
    /// Total track + route length in meters.
    pub distance_m: f64,
    pub bounds: Option<Bounds>,
}

/// Parse a GPX file on disk and summarize it. Returns an error string so it
/// can bubble straight to the frontend as a rejected invoke.
pub fn extract_metadata(path: &Path) -> Result<GpxMetadata, String> {
    let file = File::open(path).map_err(|e| format!("cannot open file: {e}"))?;
    let gpx = read_gpx(BufReader::new(file)).map_err(|e| format!("invalid GPX file: {e}"))?;

    let mut meta = GpxMetadata {
        name: gpx
            .metadata
            .as_ref()
            .and_then(|m| m.name.clone())
            .or_else(|| gpx.tracks.iter().find_map(|t| t.name.clone())),
        track_count: gpx.tracks.len(),
        waypoint_count: gpx.waypoints.len(),
        route_count: gpx.routes.len(),
        distance_m: 0.0,
        bounds: None,
    };

    let mut bounds = Bounds {
        min_lat: f64::MAX,
        min_lon: f64::MAX,
        max_lat: f64::MIN,
        max_lon: f64::MIN,
    };
    let mut has_point = false;

    for track in &gpx.tracks {
        for segment in &track.segments {
            meta.distance_m += polyline_length(&segment.points, &mut bounds, &mut has_point);
        }
    }
    for route in &gpx.routes {
        meta.distance_m += polyline_length(&route.points, &mut bounds, &mut has_point);
    }
    for waypoint in &gpx.waypoints {
        let point = waypoint.point();
        bounds.extend_point(point.y(), point.x());
        has_point = true;
    }

    meta.bounds = has_point.then_some(bounds);
    if !has_point {
        meta.distance_m = 0.0;
    }
    Ok(meta)
}

/// Sums the haversine distance between consecutive points while extending the
/// running bounding box.
fn polyline_length(
    points: &[gpx_parser::Waypoint],
    bounds: &mut Bounds,
    has_point: &mut bool,
) -> f64 {
    let mut meters = 0.0;
    let mut prev: Option<(f64, f64)> = None;
    for waypoint in points {
        let point = waypoint.point();
        let (lat, lon) = (point.y(), point.x());
        bounds.extend_point(lat, lon);
        *has_point = true;
        if let Some((prev_lat, prev_lon)) = prev {
            meters += haversine_meters(prev_lat, prev_lon, lat, lon);
        }
        prev = Some((lat, lon));
    }
    meters
}

const EARTH_RADIUS_M: f64 = 6_371_000.0;

fn haversine_meters(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let d_lat = (lat2 - lat1).to_radians();
    let d_lon = (lon2 - lon1).to_radians();
    let a = (d_lat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (d_lon / 2.0).sin().powi(2);
    EARTH_RADIUS_M * 2.0 * a.sqrt().asin()
}
