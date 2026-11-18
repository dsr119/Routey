import { centsToInput } from "@/lib/money";

type Client = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
  notes?: string | null;
};

export function ClientFields({ c = {} }: { c?: Client }) {
  return (
    <>
      <label>
        Name
        <input name="name" defaultValue={c.name} required />
      </label>
      <div className="row">
        <label style={{ flex: "1 1 220px" }}>
          Email <span className="hint">(invoices go here)</span>
          <input name="email" type="email" defaultValue={c.email ?? ""} />
        </label>
        <label style={{ flex: "1 1 160px" }}>
          Phone
          <input name="phone" type="tel" defaultValue={c.phone ?? ""} />
        </label>
      </div>
      <label>
        Billing address <span className="hint">(if different from the property)</span>
        <input name="billingAddress" defaultValue={c.billingAddress ?? ""} />
      </label>
      <label>
        Notes <span className="hint">(only you see these)</span>
        <textarea name="notes" rows={2} defaultValue={c.notes ?? ""} />
      </label>
    </>
  );
}

export const FREQUENCY_LABELS: Record<string, string> = {
  one_time: "One time",
  weekly: "Weekly",
  biweekly: "Every two weeks",
  per_storm: "Each snow storm",
};

type Job = {
  service?: string;
  priceCents?: number;
  taxable?: boolean;
  frequency?: string;
  estimatedMinutes?: number | null;
  urgent?: boolean;
  active?: boolean;
};

export function JobFields({ j, editing = false }: { j?: Job; editing?: boolean }) {
  return (
    <>
      <div className="row">
        <label style={{ flex: "2 1 180px" }}>
          Service
          <input name="service" defaultValue={j?.service} placeholder="Mowing" required />
        </label>
        <label style={{ flex: "1 1 100px" }}>
          Price
          <input
            name="price"
            inputMode="decimal"
            defaultValue={j?.priceCents !== undefined ? centsToInput(j.priceCents) : ""}
            placeholder="45.00"
            required
          />
        </label>
      </div>
      <div className="row">
        <label style={{ flex: "1 1 180px" }}>
          How often
          <select name="frequency" defaultValue={j?.frequency ?? "weekly"}>
            {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: "1 1 120px" }}>
          Est. minutes <span className="hint">(optional)</span>
          <input
            name="estimatedMinutes"
            inputMode="numeric"
            defaultValue={j?.estimatedMinutes ?? ""}
          />
        </label>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <label style={{ margin: 0, fontWeight: 400 }}>
          <input type="checkbox" name="taxable" defaultChecked={j?.taxable ?? true} />
          Charge sales tax
        </label>
        <label style={{ margin: 0, fontWeight: 400 }}>
          <input type="checkbox" name="urgent" defaultChecked={j?.urgent ?? false} />
          Urgent
        </label>
        {editing && (
          <label style={{ margin: 0, fontWeight: 400 }}>
            <input type="checkbox" name="active" defaultChecked={j?.active ?? true} />
            Active
          </label>
        )}
      </div>
    </>
  );
}
