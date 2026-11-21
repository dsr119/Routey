// Links that open Google Maps directions on the phone. No API key needed.

export function directionsTo(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
}

// Google Maps links take up to 9 stops in between plus the destination, so a
// longer route is cut off at the 10th point. The crew opens the rest later.
export function directionsThrough(addresses: string[], end?: string | null): string | null {
  if (addresses.length === 0) return null;
  const all = end ? [...addresses, end] : addresses;
  const legs = all.slice(0, 10);
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", legs[legs.length - 1]);
  if (legs.length > 1) url.searchParams.set("waypoints", legs.slice(0, -1).join("|"));
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}
