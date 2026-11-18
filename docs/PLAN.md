# Routey build plan

Routey is a web app for a landscaping, property management and snow plowing business. The owner plans routes and bills clients. Employees work the routes from their phones. Clients check how close the crew is, pay invoices and report problems.

Nothing gets built until this plan is approved.

## Decisions so far

- Web app first, made to work well on a phone. App store versions can come later.
- Stripe for card payments and pay links.
- Twilio for texts, Google Maps for addresses and routing.
- The owner assigns routes to employees.
- Clients see how many stops away the crew is, not a live map.
- Receipt photos are uploaded by employees and the owner.
- Employees and clients log in with an ID number and a PIN.
- QuickBooks is what he uses now, so Routey syncs to it.
- The look stays plain: white background, black text, one accent color, system font, big buttons. No dashboards full of charts, no stock images, no animation.

## Tech stack

| Part | Choice | Why |
|---|---|---|
| App | Next.js with TypeScript | One codebase for pages and server code. Easy to host. |
| Database and photo storage | Postgres and file storage on Supabase | One service for data and pictures. Free tier to start. |
| Hosting | Vercel | Pushes to GitHub deploy on their own. Free tier to start. |
| Styling | Plain CSS | No UI kit, nothing fancy. |
| Payments | Stripe Checkout links | Stripe hosts the card form, so card numbers never touch our server. |
| Texts | Twilio | |
| Email | Resend or Postmark | Cheap, reliable invoice emails. |
| Maps and routes | Google Maps (address lookup, Routes API) | |
| Accounting | QuickBooks Online API | |

## Who sees what

### Owner

Logs in with email and password (stronger than a PIN, since the owner can see everything).

- **Today**: every route, which stop each employee is on, time spent at each stop, who is clocked in.
- **Clients**: name, contact info, properties, notes from employees, photos, invoices, receipts.
- **Properties**: address, work description, photos, price, how often (weekly, every two weeks, per storm, one time).
- **Routes**: pick a date and an employee, add stops, press Optimize to get the best order, save. Drag to reorder by hand.
- **Invoices and estimates**: create, edit, send, mark paid. Turn an estimate into an invoice.
- **Calendar**: set open time slots for estimates. See what clients booked.
- **Reports**: income by month and year to date, expenses from receipts, mileage per employee.
- **Settings**: sales tax rate(s), business info shown on invoices, employee and client logins.

### Employee

Logs in with ID number and PIN.

- Clock in and clock out.
- **My route**: today's stops in order, with a button to open directions in Google Maps.
- At each stop: **Arrived** starts the timer, **Done** stops it and sends the client their invoice with a pay link by email and text.
- **Can't complete**: pick or type a reason, attach photos. The owner is told.
- **Notes for owner**: things noticed at the property that the client should have done. Saved on the client's profile.
- **Receipts**: snap a photo of a fuel or materials receipt, enter the amount, attach it to a client or mark it general.

### Client

Logs in with ID number and PIN.

- **Crew status**: "Your crew is 3 stops away" on the day of service, then "On site", then "Done".
- **Invoices**: see and pay.
- **Report a problem**: describe what was missed, attach photos. Goes to the owner.
- **Book an estimate**: pick from the open time slots the owner set.

## Data model

Main tables, kept small.

- **users**: role (owner, employee, client), name, phone, email, ID number, hashed PIN or password.
- **clients**: contact info, billing email, Stripe customer id, QuickBooks customer id.
- **properties**: belongs to a client. Address, map location, work description, price, frequency, taxable yes or no. A client can have several properties, which matters for property management.
- **photos**: file link, attached to a property, stop, problem report, or receipt.
- **routes**: date, employee, status.
- **stops**: belongs to a route. Property, order number, status (waiting, on site, done, can't complete), arrived at, done at, reason if not done.
- **time_entries**: employee, clock in, clock out, miles.
- **location_points**: employee, time, location. Only saved while clocked in. Used for mileage and auto arrival (Phase 4).
- **notes**: employee notes about a property, for the owner.
- **problem_reports**: client reports of missed work.
- **estimates** and **invoices**, each with **line items**: description, quantity, price, taxable. Invoices also store tax rate, totals, status, Stripe link, QuickBooks id.
- **payments**: invoice, amount, method, Stripe payment id, date.
- **receipts**: amount, category (fuel, materials, other), photo, client if any, who uploaded.
- **tax_rates**: name and percent, set by the owner.
- **time_slots** and **appointments**: open estimate times and client bookings.

## Integrations

**Stripe.** Each invoice gets a Stripe Checkout link. When the client pays, Stripe tells Routey and the invoice is marked paid. Stripe charges about 2.9% plus 30 cents per card payment. For in-person cards, the owner can open the same link on his phone and type the card in. Tap to Pay can come later.

**Twilio.** Sends invoice texts and problem alerts. US carriers require business texting to be registered (called A2P 10DLC). Approval takes from a few days to a few weeks and has small one-time and monthly fees. We should start that early. Email works while it's pending.

**Google Maps.** Turns typed addresses into map points and suggests full addresses as you type. The Routes API reorders stops into the shortest drive. It handles up to 25 stops per request. If a route ever needs more, we split it or move to Google's Route Optimization API.

**QuickBooks Online.** One way to start: Routey sends clients, invoices and payments to QuickBooks so the books stay current without typing things twice. Going live with Intuit needs a short app review on their side. If he uses QuickBooks Desktop instead of Online, this gets much harder and we should talk.

## Order of work

### Phase 1: the core

1. Logins for owner, employees and clients.
2. Clients and properties, with address lookup.
3. Route builder with Optimize, assigned to an employee by date.
4. Employee day screen: clock in and out, Arrived and Done per stop, time on site.
5. Invoices with sales tax set by the owner.
6. Stripe pay link emailed when a stop is marked Done. Paid status updates on its own.
7. Client screen: stops away, invoices, pay.

At the end of Phase 1 he can run a real day: plan a route, have a guy work it, bill the clients and get paid.

### Phase 2: photos and notes

- Work description photos on properties.
- Can't complete with reason and photos.
- Employee notes to the owner on a client's profile.
- Client problem reports with photos.
- Receipt photos and expenses.
- Texts through Twilio (once registration is approved).

### Phase 3: office work

- Estimates, and turning them into invoices.
- Calendar with open slots and client booking.
- Income reports, monthly and year to date, with expenses.
- Repeating jobs: weekly or every two weeks fill routes on their own. Snow: a "storm run" button that builds routes for all plow clients at once.
- QuickBooks Online sync.

### Phase 4: GPS

- Auto arrival: timer starts when the phone gets within a set distance of the property, and stops when it leaves (with Done still needed to bill).
- Mileage while clocked in, stopping at clock out.
- Live employee locations on the owner's map.

## Risks

**GPS in a browser is the big one.** A web page only gets location while it's open on screen. If the employee locks the phone or switches apps, tracking stops, and iPhones are the strictest about this. So in a web app, auto arrival and mileage will have gaps. That's why Phase 1 uses Arrived and Done buttons, and why GPS waits until Phase 4. We can keep the screen awake while the route page is open, which helps. If the gaps are a problem, the fix is wrapping the app as a real phone app (with a tool called Capacitor), which can track in the background. That's added work, not a rewrite.

**PIN logins are weak.** A short number is easy to guess. We'll use 6-digit PINs, lock the account after a few wrong tries, and keep the owner on a full password.

**Texting registration delay.** See Twilio above. Start early.

**Sales tax.** Whether lawn care or plowing is taxable depends on the state. Routey lets the owner set rates and mark each item taxable. It doesn't decide for him.

**Monthly costs.** Hosting and database start free. Texts are about a penny each plus a phone number around $1 to $2 a month. Google Maps has a free monthly allowance that a small business likely stays under. Stripe takes its fee per payment. These are estimates.

## Open questions

1. Does he use QuickBooks Online or QuickBooks Desktop?
2. About how many employees, clients and stops per day?
3. What state is the business in (for sales tax and texting rules)?
4. Does he take cards in person often, or mostly by link?
5. Is pricing per property per visit, or does it vary each time?
