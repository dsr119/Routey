import "server-only";
import type { LatLng } from "./routing";

const waypoint = (p: LatLng) => ({
  location: { latLng: { latitude: p.lat, longitude: p.lng } },
});

export type OptimizeResult =
  | { ok: true; order: number[]; minutes: number; miles: number }
  | { ok: false; error: string };

// Asks Google's Routes API for the fastest order to visit `stops`,
// starting at `start` and ending at `end`.
export async function optimizeWithGoogle(
  start: LatLng,
  end: LatLng,
  stops: LatLng[],
): Promise<OptimizeResult> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { ok: false, error: "Optimize needs a Google Maps key." };
  if (stops.length === 0) return { ok: true, order: [], minutes: 0, miles: 0 };

  try {
    // GOOGLE_ROUTES_URL only exists so tests can point at a fake server.
    const res = await fetch(process.env.GOOGLE_ROUTES_URL ?? "https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "routes.optimizedIntermediateWaypointIndex,routes.duration,routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: waypoint(start),
        destination: waypoint(end),
        intermediates: stops.map(waypoint),
        travelMode: "DRIVE",
        optimizeWaypointOrder: true,
      }),
    });
    const data = await res.json();
    const route = data.routes?.[0];
    if (!res.ok || !route) {
      return { ok: false, error: data.error?.message ?? "Google couldn't build that route." };
    }
    // With one stop Google leaves the index out, since there is nothing to reorder.
    const order: number[] = route.optimizedIntermediateWaypointIndex ?? stops.map((_, i) => i);
    const seconds = parseInt(String(route.duration ?? "0"), 10) || 0;
    return {
      ok: true,
      order,
      minutes: Math.round(seconds / 60),
      miles: Math.round(((route.distanceMeters ?? 0) / 1609.34) * 10) / 10,
    };
  } catch {
    return { ok: false, error: "Couldn't reach Google. Try again in a minute." };
  }
}
