# MOVE at FIVE · Towel desk

A reception web app for MOVE at FIVE Jumeirah Village. Find a member by phone number or its last four digits, confirm their name, then give or return towels. No physical deposit card is needed.

## Included

- **Phone-first reception desk**, with a large tablet keypad, native phone keyboard, full-number or last-four lookup and name fallback. UAE numbers accept `05…`, `+971…`, `00971…` and Arabic digits; international numbers use a country code. Shared numbers always show separate names for confirmation.
- **Explicit checkout / return confirmation**, per-member outstanding balances, configurable limits, partial returns and overdue tracking.
- **Shared PostgreSQL records** for all reception devices. Row locks and database transactions protect balances; retried submissions use idempotency keys.
- **Member directory** with add/edit, search, active/inactive status, contact details, membership type and towel history.
- **Quick quantities and a return-all default**, a saved receipt, automatic reset for the next member, and an audited five-minute Undo for the operator's latest movement on that member. Undo restores original loan deadlines, refuses newer movements, and never deletes history.
- **Excel `.xlsx` and CSV import** recognizes Name and Phone/Mobile/Number columns. Preview flags duplicate or shared numbers and conflicting identities before any records are written. Numeric Excel phone cells are rejected with instructions to restore their text format.
- **Staff and administrator accounts** with hashed passwords, database sessions, role checks, CSRF protection, login rate limiting and a transaction audit trail.
- **Installable PWA** for tablets and phones, with branded home-screen icons, a standalone window and an offline public shell. Towel operations require a connection; private records are never cached.
- **In-app account settings** for email and password changes, including a required password change for the first temporary administrator login.
- **Activity filters and CSV export**, Dubai time throughout the desk, responsive touch controls and reduced-motion support.
- **Netlify deployment configuration**, an Express API function, managed PostgreSQL support, health checks, migrations and CI. A Docker/App Platform deployment is also available.

This is a towel tracking system. Import the gym's name and phone list or add profiles in Members. Phone lookup identifies a profile for reception to confirm; it does not verify phone ownership or connect to a membership provider. Members without a saved phone remain available by name.

## Run locally

Requires Node.js 22.13+ and npm.

```bash
npm ci
npm run setup:admin -- --local
npm run dev
```

The setup command displays a generated temporary login once. Sign in, then choose your email and password in the app. No `.env` file is needed. Repeating setup preserves the existing administrator.

Open **http://localhost:8080**. Without `DATABASE_URL`, development uses embedded PostgreSQL (PGlite) persisted at `data/local`. A database server is not needed for local evaluation. The real deployment always requires PostgreSQL and never stores operational data on the app’s local disk.

For a separate development demo with fictional members, leave the real `.env` aside and run:

```bash
DEMO_MODE=true DATA_DIR=data/demo ADMIN_EMAIL= ADMIN_PASSWORD= npm run dev
```

Choose **Open demo desk**, then enter `0101` or search for `Alex Morgan`. Demo numbers and names are fictional. This route is unavailable in production, and production refuses to start with `DEMO_MODE=true`. No real member records are committed to this repository.

## Deploy to Netlify

The complete guide is [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The short path:

1. Import this GitHub repository into Netlify, using `main`. [`netlify.toml`](netlify.toml) configures the frontend and backend build.
2. Run the one-time authenticated setup in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The app targets Neon project `old-dew-31287598`, branch `production`, and the configured Netlify site.
3. Sign in with the generated temporary administrator login, choose your own credentials in the app, and import members.

Site/project identifiers and the HTTPS origin live in `app.config.json`. The database connection is saved in the site's private Netlify Blobs store; administrator emails and password hashes are in PostgreSQL. No manual Netlify environment variables are required. Later GitHub pushes deploy automatically, and migrations run automatically when the API starts.

Netlify hosts the frontend and backend. Neon stores the operational data. This app does not request Netlify's native database feature, so it avoids the account's native-database provisioning error. The [DigitalOcean guide](docs/DIGITALOCEAN.md) remains available for an alternative Docker deployment.

## Install on a tablet or phone

Open the HTTPS site, then use **Install app** when offered. On iPhone or iPad, open it in Safari and choose **Share → Add to Home Screen**. Launch **MOVE Towels** from the home screen. The phone desk does not request camera access.

Only the public app shell is stored offline. Member records, account details and towel movements always use the server. Reconnect before recording a checkout or return. Updates activate after all existing app windows close, avoiding an interruption during a handover.

## Member import

Use [the CSV template](public/member-import-template.csv) or an Excel workbook with a header row. The template contains explicitly fictional examples; replace them with your own rows.

| Field        | Requirement                | Notes                                                                                    |
| ------------ | -------------------------- | ---------------------------------------------------------------------------------------- |
| `full_name`  | Required                   | Alternatively map `first_name` and `last_name`.                                          |
| `phone`      | Required for phone imports | Phone, Mobile or Number; Excel cells must be Text. UAE national or international format. |
| `email`      | Optional                   | Valid email or blank.                                                                    |
| `membership` | Optional                   | For example Movers, Shapers, Hotel guest or Staff.                                       |
| `active`     | Optional                   | `active` / `inactive`, `true` / `false`, `yes` / `no`, or `1` / `0`.                     |

Files are limited to 4 MB, 5,000 rows and 50 columns. Only the first visible Excel worksheet is read. Uploads are parsed in bounded worker threads. Previews expire after 30 minutes. All rows must pass validation before any member is written; an import is atomic. An existing member is updated only when exactly one normalized phone matches and the name agrees (ignoring case and repeated spaces). Shared phones, different names on the same number, and existing names with a different or missing phone require profile review. Unmapped and blank optional fields preserve existing values; towel history is never replaced. Formula cells in mapped Excel columns are rejected.

To change a number or add a missing one, edit the existing profile in Members first. The permanent member ID retains all towel history. Legacy files with an explicit previous member reference remain supported; that reference is not used as a phone. An import preview is checked again at commit so changes made on another device cannot silently redirect an update.

## Verification

```bash
npm test
npm run build:netlify
npm run test:netlify-bundle
npm audit --omit=dev
```

Integration tests exercise authenticated HTTP requests and the SQL schema: checkout, partial/FIFO returns, concurrent return submissions, idempotent retries, over-return rollback, member limits, role permissions, CSRF, inactive member returns, import validation/commit and CSV formula protection. Local tests use PGlite (PostgreSQL compiled to WASM). GitHub CI also runs the same suite against PostgreSQL 16 and builds the production Docker image.

Phone-specific checks cover number normalization, shared-number selection, import conflicts, changed-number history preservation, partial-return undo, concurrent corrections, and lost-response retries. A DOM interaction test exercises the actual reception component through lookup, name selection, retry, receipt reset and Undo. Check touch sizing on the reception device when commissioning it.

## Layout and operation

- `src/` — React application, phone reception desk and styles.
- `server/` — Express API, authentication, imports and transactional towel logic.
- `server/migrations/` — ordered, versioned SQL migrations.
- `netlify.toml` and `netlify/functions/` — Netlify routing, security headers and API entry point.
- `.do/app.yaml` — alternative DigitalOcean App Platform production specification.
- `docs/DEPLOYMENT.md` — deployment, backups, reception setup and account recovery.
- `docs/BRAND.md` — official brand references and asset provenance.

No analytics trackers or public registration are included. The default return window is 12 hours and the default member limit is six towels; both are editable in Settings. If a save or correction loses its response, reception can retry the same request without creating a duplicate movement.
