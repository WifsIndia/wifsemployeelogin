export interface Coords {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export function getCurrentPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("GPS_UNAVAILABLE"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) reject(new Error("PERMISSION_DENIED"));
        else if (err.code === err.TIMEOUT) reject(new Error("GPS_TIMEOUT"));
        else reject(new Error("GPS_UNAVAILABLE"));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

const MESSAGES: Record<string, string> = {
  PERMISSION_DENIED:
    "Location permission was denied. Please allow location access in your browser settings and try again.",
  GPS_UNAVAILABLE: "We could not read your location. Please switch on GPS and try again.",
  GPS_TIMEOUT: "Getting your location took too long. Please move to an open area and try again.",
  OUTSIDE_OFFICE:
    "You are outside the WiFS office attendance area. Please move inside the office location and try again.",
  OFFICE_NOT_CONFIGURED:
    "The office location has not been configured yet. Please ask your administrator to set it up.",
  POOR_ACCURACY:
    "Your location accuracy is too low right now. Please move near a window or outdoors and try again.",
  ALREADY_CHECKED_IN: "You have already checked in today.",
  ALREADY_CHECKED_OUT: "You have already checked out today.",
  NOT_CHECKED_IN: "You need to check in before checking out.",
  INACTIVE_EMPLOYEE: "Your account is inactive. Please contact HR.",
  LOCATION_REQUIRED: "Location is required to record attendance.",
};

export function friendlyError(message: string): string {
  for (const key of Object.keys(MESSAGES)) {
    if (message.includes(key)) return MESSAGES[key]!;
  }
  return "Something went wrong. Please check your connection and try again.";
}
