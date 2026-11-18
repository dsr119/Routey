import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  date,
  doublePrecision,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

// Money is stored in cents. Tax rates are stored in thousandths of a percent
// (8.875% = 8875), so rates like New York City's stay exact.

export const roleEnum = pgEnum("role", ["owner", "employee", "client"]);
export const frequencyEnum = pgEnum("frequency", [
  "one_time",
  "weekly",
  "biweekly",
  "per_storm",
]);
export const stopStatusEnum = pgEnum("stop_status", [
  "waiting",
  "on_site",
  "done",
  "not_done",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "void",
]);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const businesses = pgTable("businesses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  // Small logo stored inline as a data: URL, so no file storage is needed yet.
  logoUrl: text("logo_url"),
  // Default start and end point for routes, usually the shop.
  homeAddress: text("home_address"),
  homeLat: doublePrecision("home_lat"),
  homeLng: doublePrecision("home_lng"),
  // Decides what "today" means for routes and reports.
  timezone: text("timezone").notNull().default("America/New_York"),
  // When true, invoices wait for the owner instead of going out on Done.
  holdInvoices: boolean("hold_invoices").notNull().default(false),
  nextInvoiceNumber: integer("next_invoice_number").notNull().default(1001),
  createdAt: createdAt(),
});

export const clients = pgTable(
  "clients",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    billingAddress: text("billing_address"),
    notes: text("notes"),
    stripeCustomerId: text("stripe_customer_id"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("clients_business_idx").on(t.businessId)],
);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id),
    role: roleEnum("role").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    // Owners log in with email and password.
    passwordHash: text("password_hash"),
    // Employees and clients log in with an ID number and PIN.
    loginId: text("login_id"),
    pinHash: text("pin_hash"),
    // Set for client logins.
    clientId: integer("client_id").references(() => clients.id),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    uniqueIndex("users_login_id_idx").on(t.loginId),
    index("users_business_idx").on(t.businessId),
  ],
);

export const sessions = pgTable("sessions", {
  // SHA-256 of the cookie token, so a database leak can't be replayed.
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const properties = pgTable(
  "properties",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id),
    address: text("address").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("properties_client_idx").on(t.clientId)],
);

export const taxRates = pgTable("tax_rates", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id")
    .notNull()
    .references(() => businesses.id),
  name: text("name").notNull(),
  rateMilli: integer("rate_milli").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
});

export const jobs = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id),
    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id),
    service: text("service").notNull(),
    priceCents: integer("price_cents").notNull(),
    taxable: boolean("taxable").notNull().default(true),
    frequency: frequencyEnum("frequency").notNull().default("one_time"),
    estimatedMinutes: integer("estimated_minutes"),
    urgent: boolean("urgent").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_property_idx").on(t.propertyId)],
);

export const crews = pgTable("crews", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id")
    .notNull()
    .references(() => businesses.id),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
});

export const crewMembers = pgTable(
  "crew_members",
  {
    crewId: integer("crew_id")
      .notNull()
      .references(() => crews.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    isForeman: boolean("is_foreman").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.crewId, t.userId] })],
);

export const routes = pgTable(
  "routes",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id),
    crewId: integer("crew_id")
      .notNull()
      .references(() => crews.id),
    day: date("day").notNull(),
    startAddress: text("start_address"),
    startLat: doublePrecision("start_lat"),
    startLng: doublePrecision("start_lng"),
    endAddress: text("end_address"),
    endLat: doublePrecision("end_lat"),
    endLng: doublePrecision("end_lng"),
    createdAt: createdAt(),
  },
  (t) => [index("routes_day_idx").on(t.businessId, t.day)],
);

export const stops = pgTable(
  "stops",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id),
    routeId: integer("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id),
    position: integer("position").notNull(),
    status: stopStatusEnum("status").notNull().default("waiting"),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    // Extra work noted by the crew. The invoice waits for the owner to price it.
    extraWorkNote: text("extra_work_note"),
    notDoneReason: text("not_done_reason"),
  },
  (t) => [index("stops_route_idx").on(t.routeId)],
);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    clockIn: timestamp("clock_in", { withTimezone: true }).notNull(),
    clockOut: timestamp("clock_out", { withTimezone: true }),
  },
  (t) => [index("time_entries_user_idx").on(t.userId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id),
    stopId: integer("stop_id").references(() => stops.id),
    number: integer("number").notNull(),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    taxRateMilli: integer("tax_rate_milli").notNull().default(0),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    stripeSessionId: text("stripe_session_id"),
    // Random token in the client's pay link (/pay/<token>). Anyone with the
    // link can see and pay this one invoice, nothing else.
    payToken: text("pay_token"),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invoices_number_idx").on(t.businessId, t.number),
    // One invoice per finished stop.
    uniqueIndex("invoices_stop_idx").on(t.stopId),
    uniqueIndex("invoices_pay_token_idx").on(t.payToken),
    index("invoices_client_idx").on(t.clientId),
  ],
);

export const invoiceLines = pgTable("invoice_lines", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitCents: integer("unit_cents").notNull(),
  taxable: boolean("taxable").notNull().default(true),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id")
    .notNull()
    .references(() => businesses.id),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoices.id),
  amountCents: integer("amount_cents").notNull(),
  method: text("method").notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  createdAt: createdAt(),
});
