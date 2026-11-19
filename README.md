# ORYX public template

A single-user personal and business bookkeeping application using Next.js, Cloudflare D1, passkeys, and optional bank-feed and AI integrations.

This standalone template contains no connected accounts or deployment credentials. Its seed data consists of generic entities, categories, and one empty example bank account. There are no seeded transactions, debts, people, account numbers, or merchant rules. Component previews use illustrative data.

## Local setup

Use Node.js 24 or newer. Run `npm ci`, copy `.env.example` to `.env.local`, and provide your own configuration. Run `npm run dev` and open http://localhost:3100. UI examples are available at `/components-preview` without a financial database.

For the full application, create your own Cloudflare D1 database, replace the placeholder in `worker/wrangler.jsonc`, and apply the migrations in filename order. Configure the Worker DATA_TOKEN secret and deploy it to your own account. Set DATA_URL and the matching DATA_TOKEN in the application environment. APP_URL must match your application origin. Configure SETUP_TOKEN for initial passkey registration; registration closes after the first account is created. Open the app with `#setup=YOUR_SETUP_TOKEN` for registration.

MCP_TOKEN protects `/mcp`. REDBARK_API_KEY enables the optional bank feed. TYPESAFE_API_KEY enables AI sorting. CRON_SECRET protects the cron routes; scheduling is left to your hosting provider. Use independent credentials for each installation. Never commit local environment files or imported financial records.

Personal transfer recognition and merchant categorisation require your own saved rules. Amounts use integer cents; the default reporting currency is AUD and date handling uses UTC. Bank CSV imports expect date, signed amount, description, and balance columns. PDF imports require text with dated transaction rows.

## Checks

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.

Third-party component attribution is retained in the source.
