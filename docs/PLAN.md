# Routey build plan

Routey is a web app for a landscaping, property management and snow plowing business. The owner plans routes and bills clients. Employees work the routes from their phones. Clients check how close the crew is, pay invoices and report problems.

Nothing gets built until this plan is approved.

It starts as an app for one business, but it may be opened to other businesses later. The plan builds for that from day one where it's cheap to do so.

## Decisions so far

- Web app first, made to work well on a phone. App store versions can come later.
- Stripe for card payments and pay links.
- Twilio for texts, Google Maps for addresses and routing.
- The owner assigns routes to employees.
- Clients see how many stops away the crew is, not a live map.
- Receipt photos are uploaded by employees and the owner.
- Employees and clients log in with an ID number and a PIN.
- He uses QuickBooks Online, so Routey syncs to it.
- He takes cards both in person and by link.
- Prices are usually set per property per visit, but sometimes change.
- Routey may be offered to other businesses later.
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

- **Today**: every route, which stop each crew is on, time spent at each stop, who is clocked in.
- **Clients**: name, contact info, properties, tags, notes from employees, photos, and the full history of jobs, messages, invoices and payments. List or map view.
- **Properties**: address, work description, photos, price, how often (weekly, every two weeks, per storm, one time).
- **Crews**: one or more employees, with one marked foreman. A crew can be one person.
- **Routes**: pick a date and a crew, set where the day starts and ends, add stops, press Optimize to get the best order, save. Drag to reorder by hand. Mark a job urgent to put it at the top.
- **Invoices and estimates**: create, edit, send, mark paid. Turn an estimate into an invoice.
- **Calendar**: set open time slots for estimates. See what clients booked.
- **Reports**: income by month and year to date, expenses from receipts, mileage per employee.
- **Settings**: sales tax rate(s), business info shown on invoices, employee and client logins, and whether invoices go out on their own when a stop is marked Done or wait for him to look them over.

### Employee

Logs in with ID number and PIN.

- Clock in and clock out.
- **My route**: today's stops in order, with a button to open directions in Google Maps.
- Employees never see prices, invoices or income.
- At each stop: **Arrived** starts the timer, **Done** stops it and sends the client their invoice with a pay link by email and text. The invoice uses the job's usual price. If the job was different (extra work, a bigger storm), the employee notes the extra work and that invoice waits for the owner to price it. The owner can also set all invoices to wait for review.
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

Main tables, kept small. Every table except businesses carries a business id, so one business never sees another's data. This costs almost nothing now and saves a rewrite if Routey goes public.

- **businesses**: name, address, phone, logo, Stripe account, QuickBooks connection, settings.

- **crews** and **crew members**: who is on each crew, and who is foreman.
- **users**: role (owner, employee, client), name, phone, email, ID number, hashed PIN or password. ID numbers are unique across all of Routey, so nobody has to type a business code to log in.
- **clients**: contact info, billing email, Stripe customer id, QuickBooks customer id.
- **properties**: belongs to a client. Address, map location, work description, usual price, frequency, taxable yes or no. A client can have several properties, which matters for property management.
- **photos**: file link, attached to a property, stop, problem report, or receipt.
- **jobs**: belongs to a property. Service, price, estimated time, one-time, repeating or multi-day, urgent yes or no.
- **routes**: date, crew, start and end location, status.
- **stops**: belongs to a route. Job, order number, status (waiting, on site, done, can't complete), arrived at, done at, reason if not done.
- **time_entries**: employee, clock in, clock out, miles.
- **location_points**: employee, time, location. Only saved while clocked in. Used for mileage and auto arrival (Phase 5).
- **notes**: employee notes about a property, for the owner.
- **problem_reports**: client reports of missed work.
- **estimates** and **invoices**, each with **line items**: description, quantity, price, taxable. Invoices also store tax rate, totals, status, Stripe link, QuickBooks id.
- **payments**: invoice, amount, method, Stripe payment id, date.
- **receipts**: amount, category (fuel, materials, other), photo, client if any, who uploaded.
- **messages**: every email and text sent to a client, kept on their profile.
- **tags**: labels the owner puts on clients and jobs to sort them.
- **tax_rates**: name and percent, set by the owner.
- **time_slots** and **appointments**: open estimate times and client bookings.

## Integrations

**Stripe.** Each invoice gets a Stripe Checkout link. When the client pays, Stripe tells Routey and the invoice is marked paid. Stripe charges about 2.9% plus 30 cents per card payment, and 0.8% (capped at $5) for bank payments. For in-person cards, Phase 1 lets the owner open the pay link on his phone and type the card in. Phase 3 adds a Stripe card reader for chip and tap. The readers that work with a web app connect over Wi-Fi or cellular and cost roughly $250 to $350. Cheaper Bluetooth readers need the phone app version. Tap to Pay on the phone itself needs the phone app version, so it waits for that.

If Routey goes public, each business connects its own Stripe account (Stripe Connect) so money goes straight to them. For now it's just his account.

**Twilio.** Sends invoice texts and problem alerts. US carriers require business texting to be registered (called A2P 10DLC). Approval takes from a few days to a few weeks and has small one-time and monthly fees. We should start that early. Email works while it's pending.

**Google Maps.** Turns typed addresses into map points and suggests full addresses as you type. The Routes API reorders stops into the shortest drive. It handles up to 25 stops per request. If a route ever needs more, we split it or move to Google's Route Optimization API.

**QuickBooks Online.** One way to start: Routey sends clients, invoices and payments to QuickBooks so the books stay current without typing things twice. Going live with Intuit needs a short app review on their side. He uses QuickBooks Online, which is the easier one to connect.

## Order of work

### Phase 1: the core

1. Logins for owner, employees and clients.
2. Clients, properties and jobs, with address lookup.
3. Crews, with a foreman.
4. Route builder with Optimize and custom start and end points, assigned to a crew by date.
5. Employee day screen: clock in and out, Arrived and Done per stop, time on site. No prices shown.
6. Invoices with sales tax set by the owner and his logo.
7. Stripe pay link emailed when a stop is marked Done. Paid status updates on its own.
8. Client screen: stops away, invoices, pay.

At the end of Phase 1 he can run a real day: plan a route, have a crew work it, bill the clients and get paid.

### Phase 2: in the field

- Texts through Twilio (once registration is approved), including an "on the way" text when the crew heads to the next stop.
- Work description photos on properties.
- Can't complete with reason and photos.
- Employee notes to the owner on a client's profile.
- Client problem reports with photos.
- Receipt photos and expenses.
- Daily task list and checklists for each crew.
- End of day report to the owner of everything each crew finished.
- Estimated time on each job, compared with actual time.
- Owner can edit or add time by hand. One timesheet entry can apply to the whole crew.
- Print a route or save it as a PDF.

### Phase 3: billing

- Estimates with photos, logo, and PDF download. Turn an estimate into an invoice.
- Deposits and prepay on estimates and services.
- Bank payments (ACH) and saved cards on file, through Stripe.
- Service plans billed on a schedule, such as monthly lawn care.
- Overdue reminders, sent by hand one at a time or in bulk, or automatically after a set number of days.
- Late fees.
- Convenience fee on card payments. Some states limit or ban card surcharges, so this is off by default and the owner turns it on.
- Per-client invoice settings: payment terms (such as Net 15 or Net 30) and a default note on every invoice.
- QuickBooks Online sync.
- Stripe card reader for in-person payments.

### Phase 4: office and scheduling

- Calendar with open slots and client booking for estimates.
- Repeating jobs (weekly, every two weeks) fill routes on their own. One-time and multi-day jobs. Snow: a "storm run" button that builds routes for all plow clients at once.
- List, map and calendar views of jobs.
- Tags on clients and jobs, with sorting and filtering.
- Email or text one client or a group.
- Reports: income by month and year to date, expenses, and time by date, crew or employee. Download timesheets.
- Download any list as a CSV file for the bookkeeper.

### Phase 5: GPS

- Auto arrival: timer starts when the phone gets within a set distance of the property, and stops when it leaves (with Done still needed to bill).
- Mileage while clocked in, stopping at clock out.
- Live crew locations on the owner's map.

### Later: equipment and measuring

- Trucks and equipment: check in and out, track supplies on each truck, daily usage, and reminders for maintenance and refills.
- Measure a property from the satellite view (areas, lines, odd shapes) to price estimates.

### Later: open it to other businesses

Only if he and you decide to.

- Sign-up page for new businesses.
- Each business connects its own Stripe and QuickBooks.
- A monthly subscription to charge businesses for using Routey.
- Phone app versions for the App Store and Google Play (also fixes the GPS gaps below).
- Bigger routes through Google's Route Optimization API if some businesses run more than 25 stops a day.

## Risks

**GPS in a browser is the big one.** A web page only gets location while it's open on screen. If the employee locks the phone or switches apps, tracking stops, and iPhones are the strictest about this. So in a web app, auto arrival and mileage will have gaps. That's why Phase 1 uses Arrived and Done buttons, and why GPS waits until Phase 5. We can keep the screen awake while the route page is open, which helps. If the gaps are a problem, the fix is wrapping the app as a real phone app (with a tool called Capacitor), which can track in the background. That's added work, not a rewrite.

**PIN logins are weak.** A short number is easy to guess. We'll use 6-digit PINs, lock the account after a few wrong tries, and keep the owner on a full password.

**Texting registration delay.** See Twilio above. Start early.

**Sales tax.** Whether lawn care or plowing is taxable depends on the state, and the rate depends on the town. Routey lets each owner set rates and mark each item taxable. It doesn't decide for them, which also means it works in any state if it goes public.

**Monthly costs.** Hosting and database start free. Texts are about a penny each plus a phone number around $1 to $2 a month. Google Maps has a free monthly allowance that a small business likely stays under. Stripe takes its fee per payment. These are estimates.

## Open questions

None right now. Answered so far: QuickBooks Online, cards in person and by link, prices usually per property per visit, and Routey may go public later. The extra feature list Doug sent is sorted into the phases above.
