# Deploy on Netlify

Netlify serves the React frontend and runs the Express API as a Netlify Function. Netlify Database stores the members, towels, staff accounts, sessions and import previews. A separate backend server is not required.

## Import the project

Import `chordsnstrings/towel` from GitHub into Netlify, using `main` and the repository root. The committed `netlify.toml` supplies these settings:

| Setting             | Value                   |
| ------------------- | ----------------------- |
| Build command       | `npm run build:netlify` |
| Publish directory   | `dist`                  |
| Functions directory | `netlify/functions`     |
| Node version        | `22`                    |

Use a GitHub import so Netlify deploys the function and packaged Excel reader as well as the frontend. Uploading only `dist` is insufficient. The first frontend build can finish before the database is configured; the API returns an unavailable message until setup is complete.

## Create the database

In your Netlify project, open **Data & Storage → Database** and select **Create a database manually**. The repository already includes `@netlify/database`, which reads Netlify's connection settings. Leave `DATABASE_URL` unset to use Netlify Database. See [Netlify's setup instructions](https://docs.netlify.com/build/data-and-storage/netlify-database/getting-started/).

Netlify Database is available on credit-based plans, including Free. Database usage shares account credits with hosting and functions. Continuous daily reception use can exceed the free allowance; check the usage meter and [current pricing](https://www.netlify.com/pricing/). This repository does not choose or purchase a plan.

This app manages its own versioned migrations in `server/migrations/`. They run automatically when the API initializes; a PostgreSQL advisory transaction lock prevents simultaneous instances from applying them twice. Do not copy these files into Netlify's native migration directory. No database changes happen during the frontend build. Netlify supports [custom migration systems](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/#manual-migrations).

## Set environment variables

In **Project configuration → Environment variables**, add the following for the production deployment. If scope selection is available, include **Functions**.

| Variable         | Value                                                                            |
| ---------------- | -------------------------------------------------------------------------------- |
| `APP_ORIGIN`     | Your final HTTPS origin, such as `https://your-towel-desk.netlify.app`. No path. |
| `ADMIN_EMAIL`    | The email address of the initial administrator.                                  |
| `ADMIN_PASSWORD` | A unique password of 12–200 characters. Mark it as secret.                       |

Keep credentials out of GitHub, `netlify.toml`, and variables prefixed with `VITE_`. The frontend uses `/api` on the same site and needs no API URL. The function always uses production settings and forbids demo mode. See [Netlify environment settings](https://docs.netlify.com/build/functions/environment-variables/).

**Redeploy after saving the variables.** Open `/api/health` on the Netlify domain: `{"status":"ok"}` confirms the API and database are ready. Sign in, create reception staff accounts in Settings and import a small member sample before the full list.

The initial administrator is inserted only if that email does not already exist. Updating `ADMIN_PASSWORD` in Netlify does not reset an existing account.

## Custom domains, previews and other database providers

For a custom domain, set it as the Netlify primary domain, update `APP_ORIGIN` to that HTTPS origin and redeploy. Staff should use the canonical address: writes from other origins are rejected.

Keep production administrator settings scoped to production. To use a Deploy Preview interactively, supply its own origin and test administrator settings. Netlify Database's SDK selects the appropriate database branch. Preview branches can contain a copy of production data, so restrict preview access.

An optional secret `DATABASE_URL` overrides Netlify Database. Use your managed PostgreSQL provider's pooled connection URL and a database close to the Functions region. Set `DATABASE_CA_CERT` when the provider requires a private CA. TLS certificates are verified and TLS cannot be disabled in production. When using an external URL, configure a separate test database for previews explicitly.

Each warm function instance reuses up to two database connections. Concurrent instances create additional pools, so a provider-side pooler helps stay within connection limits. Never use a local filesystem database on Netlify. The alternative Docker/App Platform setup is in [DIGITALOCEAN.md](DIGITALOCEAN.md).

## Operation and limits

- Sessions and login rate limits are stored in PostgreSQL, so they survive function restarts. Login limits are shared across instances and use Netlify's trusted client IP.
- CSV and `.xlsx` uploads support **4 MB**, **5,000 members** and **50 columns**. The file-size cap leaves room for request encoding overhead. Preserve barcode columns as text to retain leading zeros.
- The parser worker has a 20-second deadline. Saves use batches within one transaction. A failed import rolls back, and a committed import can be safely retried.
- Netlify currently allows 60 seconds for synchronous functions; SQL statements time out after 15 seconds. Split the file if an unusually slow database causes an import to time out. [Function limits](https://docs.netlify.com/build/functions/configuration/).
- API responses are limited to 5 MB. Narrow the activity export date range if needed.
- Expired records are cleaned during function initialization and relevant operations. No background server or filesystem persistence is needed.
- Camera frames stay on the reception device. Open the site directly over HTTPS, allow camera access, then verify a checkout and partial/full return on the actual device. The front camera is requested first; switch cameras if it cannot focus.

Use the database provider's backups. A Netlify code rollback does not restore database contents. Check the member balance from a second device before starting daily operation.

## Password recovery

From a trusted local checkout, put the production `DATABASE_URL`, `NODE_ENV=production`, `APP_ORIGIN` and a new `RESET_PASSWORD` in a private `.env.recovery` file. Include `DATABASE_CA_CERT` if required. Obtain native database connection details from your Netlify account. Then run:

```bash
node --env-file=.env.recovery server/reset-password.js staff@example.com
```

Use the existing staff email as the argument. The script revokes that account's sessions and records the reset. Delete the recovery file afterward; it must never be committed.

## Verification

```bash
npm ci
npm test
npm run build:netlify
npm run test:netlify-bundle
```

Integration tests exercise the function adapter, sessions, CSRF, transactions, binary Excel uploads, 5,000-row imports, concurrent retries, shared rate limits and initialization recovery. GitHub Actions runs them against PGlite and PostgreSQL 16. The package check uses Netlify's bundler and verifies the function, migrations and parser in an isolated directory.

These checks do not provision or deploy a Netlify site. A live deployment and physical camera check are still needed before reception use.
