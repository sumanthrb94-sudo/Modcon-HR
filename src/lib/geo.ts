// ===========================================================================
// Geolocation helpers for self-service attendance.
//
// The office coordinate + radius define the "on-site" geofence. A check-in
// inside the radius counts as Present; outside it is treated as Work From
// Home. In a real deployment these would come from company settings; they're
// centralised here so a single edit re-homes the geofence.
// ===========================================================================

export interface Coords {
  latitude: number;
  longitude: number;
}

// ModCon HQ — Hyderabad (approx). Adjust per deployment.
export const OFFICE_LOCATION: Coords = {
  latitude: 17.4374,
  longitude: 78.4487,
};

// Anything within this distance of the office counts as on-site.
export const ON_SITE_RADIUS_METERS = 250;

/**
 * Great-circle distance between two coordinates, in metres (Haversine).
 */
export function distanceMeters(a: Coords, b: Coords): number {
  const R = 6371000; // earth radius, metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function isOnSite(coords: Coords): boolean {
  return distanceMeters(coords, OFFICE_LOCATION) <= ON_SITE_RADIUS_METERS;
}

/**
 * Promise wrapper around the browser Geolocation API with friendly errors.
 */
export function getCurrentCoords(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      (err) => {
        const messages: Record<number, string> = {
          1: 'Location permission denied. Enable it to check in.',
          2: 'Your location is unavailable right now. Try again.',
          3: 'Timed out getting your location. Try again.',
        };
        reject(new Error(messages[err.code] ?? 'Could not determine your location.'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

/** Format metres as a compact human string (e.g. "120 m" / "1.4 km"). */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
