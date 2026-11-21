import "server-only";

export type Place = { address: string; lat: number; lng: number };

// Looks up an address with Google. Without GOOGLE_MAPS_API_KEY it returns
// null and the address is saved as typed, with no map point.
export async function geocode(address: string): Promise<Place | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !address.trim()) return null;
  // GOOGLE_GEOCODE_URL only exists so tests can point at a fake server.
  const url = new URL(process.env.GOOGLE_GEOCODE_URL ?? "https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", key);
  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    const top = data.results?.[0];
    if (data.status !== "OK" || !top) return null;
    return {
      address: top.formatted_address,
      lat: top.geometry.location.lat,
      lng: top.geometry.location.lng,
    };
  } catch {
    return null;
  }
}

export function hasMapsKey(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}
