// Route order helpers. Kept free of database code so they are easy to test.

export type LatLng = { lat: number; lng: number };
export type OrderStop = { id: number; urgent: boolean; point: LatLng | null };

export const MAX_OPTIMIZE_STOPS = 25;

// Urgent stops stay at the top in their current order. The rest are the ones
// handed to the optimizer.
export function splitForOptimize(stops: OrderStop[]) {
  const urgent = stops.filter((s) => s.urgent);
  const rest = stops.filter((s) => !s.urgent);
  return { urgent, rest };
}

// Puts the optimizer's answer back together into a full list of stop ids.
// `order` lists positions in `rest`, e.g. [2, 0, 1].
export function applyOrder(urgent: OrderStop[], rest: OrderStop[], order: number[]): number[] {
  const valid =
    order.length === rest.length &&
    new Set(order).size === order.length &&
    order.every((i) => Number.isInteger(i) && i >= 0 && i < rest.length);
  if (!valid) throw new Error("Optimizer returned an order that doesn't match the stops");
  return [...urgent.map((s) => s.id), ...order.map((i) => rest[i].id)];
}

// Moves one stop up or down. Returns the same list if it can't move.
export function moveStop(ids: number[], id: number, direction: "up" | "down"): number[] {
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// Stops are re-numbered 1, 2, 3 after any change.
export function positions(ids: number[]): { id: number; position: number }[] {
  return ids.map((id, i) => ({ id, position: i + 1 }));
}

// How many unfinished stops are ahead of this one on the route.
export function stopsAway(
  route: { id: number; position: number; status: string }[],
  stopId: number,
): number | null {
  const me = route.find((s) => s.id === stopId);
  if (!me) return null;
  return route.filter(
    (s) => s.position < me.position && (s.status === "waiting" || s.status === "on_site"),
  ).length;
}
