/**
 * Geolocation helpers for location-based attendance.
 *
 * Attendance check-in captures the employee's browser geolocation and compares
 * it against the configured office location. If they are within
 * `OFFICE.radiusMeters` the check-in is treated as on-site, otherwise remote.
 */

export interface OfficeLocation {
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

/** Configured office / geofence. Override via Vite env for other deployments. */
export const OFFICE: OfficeLocation = {
  name: import.meta.env.VITE_OFFICE_NAME ?? 'ModCon HQ — Bengaluru',
  lat: Number(import.meta.env.VITE_OFFICE_LAT ?? 12.9716),
  lng: Number(import.meta.env.VITE_OFFICE_LNG ?? 77.5946),
  radiusMeters: Number(import.meta.env.VITE_OFFICE_RADIUS ?? 500),
};

export interface GeoCheckInResult {
  lat: number;
  lng: number;
  accuracy: number;
  distanceMeters: number;
  withinOffice: boolean;
  /** Suggested attendance status based on where the check-in happened. */
  suggestedStatus: 'Present' | 'Work From Home';
  timestamp: number;
}

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two coordinates, in metres (haversine). */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Format a metre distance for display (m below 1km, else km). */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Resolve the browser's current position and evaluate it against the office
 * geofence. Rejects with a friendly message on denial / unavailability.
 */
export function checkInWithLocation(
  office: OfficeLocation = OFFICE,
): Promise<GeoCheckInResult> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const dist = distanceMeters(
          { lat: latitude, lng: longitude },
          { lat: office.lat, lng: office.lng },
        );
        const withinOffice = dist <= office.radiusMeters;
        resolve({
          lat: latitude,
          lng: longitude,
          accuracy,
          distanceMeters: dist,
          withinOffice,
          suggestedStatus: withinOffice ? 'Present' : 'Work From Home',
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        const messages: Record<number, string> = {
          1: 'Location permission denied. Enable location access to check in.',
          2: 'Your location is currently unavailable. Try again.',
          3: 'Getting your location timed out. Try again.',
        };
        reject(new Error(messages[err.code] ?? 'Could not determine your location.'));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
}
