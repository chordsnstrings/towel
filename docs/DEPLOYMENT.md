# Deploy on Netlify with Neon

Netlify serves the PWA and runs its Express API as a Function. Neon PostgreSQL stores members, towel movements, staff accounts, password hashes, sessions and import previews. The one-time database connection is stored in a private Netlify Blobs key. No manually configured environment variables or `.env` files are needed for this deployment.

## App configuration

`app.config.json` identifies the current destination:

| Setting                     | Value                                           |
| --------------------------- | ----------------------------------------------- |
| App origin                  | `https://legendary-fenglisu-a2aad2.netlify.app` |
| Neon project                | `old-dew-31287598`                              |
| Neon branch                 | `production`                                    |
| Netlify site                | `ead4c823-4878-4f19-b5f7-2446b52ffbf7`          |
| Initial administrator email | `admin@move.local`                              |

These are identifiers, not credentials. The initial email is only used when the database has no administrator; changing an account in the app is permanent and cannot be undone by a later deployment.

Import `chordsnstrings/towel` from GitHub into Netlify using `main` and the repository root. `netlify.toml` supplies:

| Setting             | Value                   |
| ------------------- | ----------------------- |
| Build command       | `npm run build:netlify` |
| Publish directory   | `dist`                  |
| Functions directory | `netlify/functions`     |
| Node version        | `22`                    |

Use GitHub continuous deployment so the function and packaged Excel reader ship with the frontend. Uploading only `dist` is insufficient. The frontend can build before database setup is complete; the API returns an unavailable message until it has a connection and an administrator.

## One-time authenticated setup

Run these from a trusted checkout with Node 22.13+:

```bash
npm ci
npm run neon:login
npm run netlify:login
npm run neon:link
npm run neon:plan
npm run neon:deploy
npm run setup:netlify
npm run setup:admin
```

Sign in to the Neon and Netlify accounts that own the configured projects. These commands use the locally installed CLIs. `neon:link` and `neon:deploy` disable environment-file pulling. The app-local `neon.ts` contains the requested empty `defineConfig({})`; inspect the plan before applying if the project already has Neon services enabled. `neon deploy` manages Neon configuration; GitHub pushes deploy the web app to Netlify.

`setup:netlify` obtains a direct Neon connection in memory and writes it to the fixed `production-database` key in this site's `move-private-config` store. A temporary file is private and deleted after upload. The connection is never written to GitHub, the frontend, an environment file, or command output. Netlify automatically authorizes server access to its Blob store; [Blobs are encrypted at rest and in transit](https://docs.netlify.com/build/data-and-storage/netlify-blobs/#sensitive-data).

`setup:admin` applies versioned SQL migrations and generates one temporary administrator password. It displays that password once in the trusted terminal and saves only a salted scrypt hash in PostgreSQL. **Do not run this command in public CI logs.** Sign in using the displayed login and choose your own email and password in the app before accessing member data. Repeating the command preserves existing accounts; it never resets them. A changed password signs out other sessions.

After setup, open `/api/health`: `{"status":"ok"}` confirms the API and database are ready. Subsequent GitHub pushes deploy automatically. SQL migrations run when a function starts; a database lock prevents concurrent migration attempts. Deployments preserve accounts and towel records.

The repository also includes app-local Neon skills and an OAuth MCP configuration restricted to the selected project. When Neon is authenticated through MCP instead of the CLI, a trusted integration may supply a single JSON line containing `databaseUrl` through a private input pipe to either setup command with `--connection-stdin`. Use the direct connection for the configured production branch. Do not put the credential in shell arguments or logs. Netlify CLI sign-in is still required for uploading the private connection; Neon CLI sign-in is only required for the `neon:*` commands.

## Install the PWA

Open the site over HTTPS. On Android/Chrome, choose **Install app** when offered or use the browser's installation menu. On iPhone/iPad, use Safari's **Share → Add to Home Screen**. Launch **MOVE Towels** from the home screen for a standalone window. Landscape and portrait layouts remain available.

The service worker caches only public HTML, scripts, styles, fonts and icons. API requests, member data, credentials and towel movements are never placed in offline storage or a background queue. The app shows a reconnect message offline; a checkout or return is recorded only after a server response. Updates wait until existing app windows close, so they do not interrupt a handover.

Use the tablet keypad or phone keyboard to enter a complete phone number or its last four digits. Confirm the member's name before giving or returning towels. Name search remains available for profiles with no phone. Add missing numbers through the existing member profile to retain its history. Camera access is not required.

## Domains and previews

For a custom domain, make it the Netlify primary domain, update `origin` in `app.config.json`, and deploy. Staff should use the canonical address; writes from other origins are rejected.

The private production connection is loaded only when trusted Netlify context identifies the configured site and a production deployment. Deploy Previews and branch deploys do not automatically connect to live data. Netlify site administrators and code with site-level access can read site-wide Blob stores; only deploy trusted code and build plugins. There is no public API for reading configuration keys.

Legacy `DATABASE_URL` and `APP_ORIGIN` overrides remain supported for isolated preview databases and alternative hosts. If used, keep their scope restricted to the intended context. They are not needed for the configured production setup. Database TLS certificates are verified; TLS cannot be disabled in production.

## If Netlify reports `createSiteDatabase` / `403 Forbidden`

`database feature not available for this account` means native database provisioning was refused before the build command ran. Deploy current `main`, which removes the SDK that triggered native provisioning. This app uses the existing Neon project and does not ask Netlify to create a database.

Neon database usage and Netlify hosting usage have separate plan limits. Monitor [Neon pricing](https://neon.com/pricing) and [Netlify pricing](https://www.netlify.com/pricing/) for the current allowances. This repository does not purchase a paid plan.

## Operations

- CSV and `.xlsx` uploads support **4 MB**, **5,000 members** and **50 columns**. Name and Phone/Mobile/Number columns are suggested automatically. Store Excel phone cells as Text. Preview duplicate/shared numbers and identity conflicts before committing.
- Imports use bounded workers and transactional batches. A failed import rolls back; a committed import can be retried safely.
- Sessions and login limits are shared in PostgreSQL and survive function restarts. Login throttling uses Netlify's trusted client IP.
- Each warm function uses a small pool of up to two database connections. Monitor concurrent connection usage as activity grows.
- Synchronous Netlify Functions currently have a 60-second limit; SQL statements time out after 15 seconds. Use smaller imports if an unusually slow database causes a timeout. [Function configuration](https://docs.netlify.com/build/functions/configuration/).
- API responses are capped at 5 MB. Narrow activity export dates when needed.
- Account name, email and password changes are available under **My account**. Operational towel policy and staff management remain under **Settings**.

Use Neon's backups. A code rollback does not restore database contents. Verify balances from a second device before reception use. The alternative Docker deployment and its administrative recovery utility are documented in [DIGITALOCEAN.md](DIGITALOCEAN.md).

## Verification

```bash
npm test
npm run build:netlify
npm run test:netlify-bundle
npm audit --omit=dev --audit-level=high
```

Tests cover the real API, phone lookup, imports, concurrent towel movements and corrections, first-login password changes, session revocation, preview isolation and offline-cache privacy. A DOM test exercises reception's selection, lost-response retries and automatic reset. GitHub Actions runs the suite against PGlite and PostgreSQL 16 and builds the Docker image. The Netlify package check runs the function and CSV/Excel worker in an isolated directory.
