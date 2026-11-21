import { formatPercent, lineTotal } from "@/lib/invoice-math";
import { formatCents } from "@/lib/money";

type Props = {
  invoice: {
    number: number;
    status: string;
    createdAt: Date;
    sentAt: Date | null;
    paidAt: Date | null;
    taxRateMilli: number;
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
  };
  lines: { id: number; description: string; quantity: number; unitCents: number; taxable: boolean }[];
  business: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
    timezone: string;
  };
  client: { name: string; billingAddress: string | null; email: string | null } | undefined;
  serviceAddress: string | null;
  serviceDate: Date | null;
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Not sent",
  sent: "Unpaid",
  paid: "Paid",
  void: "Void",
};

// The invoice as the client sees it. Used on owner and client pages.
export default function InvoiceView(p: Props) {
  const date = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: p.business.timezone });
  return (
    <article className="box invoice">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          {p.business.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.business.logoUrl} alt="" style={{ maxHeight: 64, maxWidth: 200, display: "block", marginBottom: 8 }} />
          )}
          <strong>{p.business.name}</strong>
          {p.business.address && <div>{p.business.address}</div>}
          {p.business.phone && <div>{p.business.phone}</div>}
          {p.business.email && <div>{p.business.email}</div>}
        </div>
        <div>
          <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>Invoice #{p.invoice.number}</div>
          <div>{date(p.invoice.sentAt ?? p.invoice.createdAt)}</div>
          <div>
            <strong>{STATUS_LABELS[p.invoice.status]}</strong>
            {p.invoice.paidAt && ` ${date(p.invoice.paidAt)}`}
          </div>
        </div>
      </div>

      <div style={{ margin: "16px 0" }}>
        <div className="muted">Bill to</div>
        <strong>{p.client?.name}</strong>
        {p.client?.billingAddress && <div>{p.client.billingAddress}</div>}
        {p.serviceAddress && (
          <div className="muted">
            Service at {p.serviceAddress}
            {p.serviceDate && ` on ${date(p.serviceDate)}`}
          </div>
        )}
      </div>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th style={{ textAlign: "right" }}>Qty</th>
            <th style={{ textAlign: "right" }}>Price</th>
            <th style={{ textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {p.lines.map((l) => (
            <tr key={l.id}>
              <td>
                {l.description}
                {!l.taxable && p.invoice.taxRateMilli > 0 && <span className="muted"> (no tax)</span>}
              </td>
              <td style={{ textAlign: "right" }}>{l.quantity}</td>
              <td style={{ textAlign: "right" }}>{formatCents(l.unitCents)}</td>
              <td style={{ textAlign: "right" }}>{formatCents(lineTotal(l))}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={3} style={{ textAlign: "right" }}>Subtotal</td>
            <td style={{ textAlign: "right" }}>{formatCents(p.invoice.subtotalCents)}</td>
          </tr>
          {p.invoice.taxRateMilli > 0 && (
            <tr>
              <td colSpan={3} style={{ textAlign: "right" }}>Sales tax ({formatPercent(p.invoice.taxRateMilli)})</td>
              <td style={{ textAlign: "right" }}>{formatCents(p.invoice.taxCents)}</td>
            </tr>
          )}
          <tr>
            <td colSpan={3} style={{ textAlign: "right" }}>
              <strong>Total</strong>
            </td>
            <td style={{ textAlign: "right" }}>
              <strong>{formatCents(p.invoice.totalCents)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}
