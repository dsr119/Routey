# Routey

Route planning, scheduling, invoicing and payments for a landscaping, property management and snow plowing business.

See [docs/PLAN.md](docs/PLAN.md) for the build plan.

## Running it on your computer

You need Node.js 22 and a Postgres database.

```sh
npm install
cp .env.example .env.local      # then set DATABASE_URL
npm run db:migrate              # creates the tables
npm run dev                     # open http://localhost:3000
```

The first visit lets you create the business and the owner login at `/setup`. After that, the owner adds employees on the Team page, and each one gets a 7-digit ID and a 6-digit PIN.

## Checks

```sh
npm run typecheck
npm run lint
npm test
```

## Changing the database

Edit `db/schema.ts`, then run `npm run db:generate` to write a migration into `db/migrations`, and `npm run db:migrate` to apply it.
