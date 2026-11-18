import "server-only";

// Called once when a crew marks a stop Done. The next step builds the invoice
// and sends the pay link from here.
export async function afterStopDone(stopId: number): Promise<void> {
  void stopId;
}
