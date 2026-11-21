import { requireRole } from "@/lib/auth";
import { openTimeEntry, todaysRoutes } from "@/lib/crew";
import { dayLabel, minutesBetween, timeIn } from "@/lib/dates";
import { directionsThrough, directionsTo } from "@/lib/maps-links";
import { arrive, clockIn, clockOut, couldNotFinish, finish } from "@/app/actions/crew";
import ActionForm from "@/components/ActionForm";

export default async function CrewHome() {
  const user = await requireRole("employee");
  const entry = await openTimeEntry(user.id);
  const { tz, day, routes } = await todaysRoutes(user);
  const now = new Date();

  return (
    <>
      <h1>{dayLabel(day)}</h1>

      <section className="box">
        {entry ? (
          <>
            <p style={{ marginTop: 0 }}>
              Clocked in at <strong>{timeIn(tz, entry.clockIn)}</strong> (
              {Math.floor(minutesBetween(entry.clockIn, now) / 60)}h{" "}
              {minutesBetween(entry.clockIn, now) % 60}m)
            </p>
            <form action={clockOut}>
              <button className="big secondary">Clock out</button>
            </form>
          </>
        ) : (
          <form action={clockIn}>
            <button className="big">Clock in</button>
          </form>
        )}
      </section>

      {routes.length === 0 && <p>No route for you today. Check with the owner.</p>}

      {routes.map((route) => {
        const left = route.stops.filter((s) => s.status === "waiting" || s.status === "on_site");
        const current = route.stops.find((s) => s.status === "on_site");
        const fullRoute = directionsThrough(
          left.map((s) => s.address),
          route.endAddress,
        );
        return (
          <section key={route.id}>
            <h2>
              {route.crew}: {route.stops.length - left.length} of {route.stops.length} done
            </h2>
            {fullRoute && (
              <p>
                <a className="button secondary" href={fullRoute} target="_blank" rel="noreferrer">
                  Open remaining route in Google Maps
                </a>
              </p>
            )}

            {route.stops.map((s, i) => {
              const finished = s.status === "done" || s.status === "not_done";
              return (
                <div
                  key={s.id}
                  className="box"
                  style={
                    s.status === "on_site"
                      ? { borderColor: "var(--accent)", borderWidth: 2 }
                      : finished
                        ? { opacity: 0.6 }
                        : undefined
                  }
                >
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>
                      {i + 1}. {s.client}
                      {s.urgent && <span className="error"> Urgent</span>}
                    </strong>
                    <span className="muted">
                      {s.status === "on_site" && s.arrivedAt && `On site since ${timeIn(tz, s.arrivedAt)}`}
                      {s.status === "done" &&
                        s.arrivedAt &&
                        s.doneAt &&
                        `Done, ${minutesBetween(s.arrivedAt, s.doneAt)} min`}
                      {s.status === "not_done" && "Couldn't finish"}
                    </span>
                  </div>
                  <div>
                    <a href={directionsTo(s.address)} target="_blank" rel="noreferrer">
                      {s.address}
                    </a>
                  </div>
                  <div className="muted">
                    {s.service}
                    {s.estimatedMinutes ? `, about ${s.estimatedMinutes} min` : ""}
                  </div>
                  {s.description && !finished && (
                    <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{s.description}</p>
                  )}

                  {s.status === "waiting" && !current && !entry && i === route.stops.indexOf(left[0]) && (
                    <p className="muted" style={{ marginBottom: 0 }}>Clock in to start.</p>
                  )}

                  {s.status === "waiting" && !current && entry && (
                    <ActionForm action={arrive} submit="Arrived" className="" keep>
                      <input type="hidden" name="stopId" value={s.id} />
                      <div style={{ height: 12 }} />
                    </ActionForm>
                  )}

                  {s.status === "on_site" && (
                    <>
                      <ActionForm action={finish} submit="Done" className="" keep>
                        <input type="hidden" name="stopId" value={s.id} />
                        <label style={{ marginTop: 12 }}>
                          Extra work done? <span className="hint">(optional, the owner will price it)</span>
                          <textarea name="extraWork" rows={2} />
                        </label>
                      </ActionForm>
                      <details style={{ marginTop: 12 }}>
                        <summary>Couldn&apos;t finish this one</summary>
                        <ActionForm action={couldNotFinish} submit="Send to owner" className="" keep secondary>
                          <input type="hidden" name="stopId" value={s.id} />
                          <label>
                            Why?
                            <textarea name="reason" rows={2} required />
                          </label>
                        </ActionForm>
                      </details>
                    </>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </>
  );
}
