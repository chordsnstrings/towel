# MOVE at FIVE · Towel desk

A reception web app for MOVE at FIVE Jumeirah Village. Scan a member’s existing barcode, select the towel quantity and confirm the handover. Scan again for a full or partial return. No physical deposit card is needed.

## Included

- **Front-camera barcode scanning**, with a rear-camera switch, camera permission recovery, and manual barcode entry. Code 128, Code 39, ITF, EAN, UPC, Codabar and QR support through ZXing.
- **Explicit checkout / return confirmation**, per-member outstanding balances, configurable limits, partial returns and overdue tracking.
- **Shared PostgreSQL records** for all reception devices. Row locks and database transactions protect balances; retried submissions use idempotency keys.
- **Member directory** with add/edit, search, active/inactive status, contact details, membership type and towel history.
- **Excel `.xlsx` and CSV import** with column mapping, preview, row validation, barcode deduplication and transactional upserts. Leading-zero identifiers are preserved; numeric Excel barcode cells are rejected with a corrective message.
- **Staff and administrator accounts** with hashed passwords, database sessions, role checks, CSRF protection, login rate limiting and a transaction audit trail.
- **Activity filters and CSV export**, Dubai time throughout the desk, responsive touch controls and reduced-motion support.
- **DigitalOcean App Platform configuration**, a production Docker image, health checks, migrations and CI.

This is a towel tracking system. It does not connect to the gym’s existing membership provider, take payments, or infer a member’s name from a barcode. Import the existing member/barcode mapping or add it manually before scanning live members.

## Run locally

Requires Node.js 22.13+ and npm.

```bash
npm ci
cp .env.example .env
```

Edit `.env`: set your administrator email and a unique password of at least 12 characters. Then:

```bash
npm run dev
```

Open **http://localhost:8080**. Without `DATABASE_URL`, development uses embedded PostgreSQL (PGlite) persisted at `data/local`. A database server is not needed for local evaluation. The real deployment always requires PostgreSQL and never stores operational data on the app’s local disk.

For a separate development demo with fictional members, leave the real `.env` aside and run:

```bash
DEMO_MODE=true DATA_DIR=data/demo ADMIN_EMAIL= ADMIN_PASSWORD= npm run dev
```

Choose **Open demo desk**, then scan or type `DEMO-001`. This route is unavailable in production, and production refuses to start with `DEMO_MODE=true`. No real member records or the supplied personal barcode are committed to this repository.

## Deploy to DigitalOcean

The complete guide is [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The short path:

1. Create a **Managed PostgreSQL cluster** named `move-towel-db` (or update the name in `.do/app.yaml`).
2. Create an App Platform app using this GitHub repository and its **Dockerfile**. Apply [`.do/app.yaml`](.do/app.yaml), attach the managed database and allow the app as a database trusted source.
3. Set `ADMIN_EMAIL` and a unique encrypted `ADMIN_PASSWORD`. `APP_ORIGIN`, `DATABASE_URL` and `DATABASE_CA_CERT` are supplied through DigitalOcean bindable variables in the spec.
4. Deploy, sign in, add staff accounts and import members. Database migrations run automatically before the app accepts traffic.

The spec deliberately uses a production managed database rather than an ephemeral filesystem or a development database. Existing live data survives restarts and deployments. You must create/attach the database and supply the administrator credentials; this repository does not create billable resources by itself.

## Member import

Use [the CSV template](public/member-import-template.csv) or an Excel workbook with a header row. The template contains explicitly fictional examples; replace them with your own rows.

| Field        | Requirement | Notes                                                                 |
| ------------ | ----------- | --------------------------------------------------------------------- |
| `barcode`    | Required    | Unique, exact identifier. Text, not a number. Preserve leading zeros. |
| `full_name`  | Required    | Alternatively map `first_name` and `last_name`.                       |
| `email`      | Optional    | Valid email or blank.                                                 |
| `phone`      | Optional    | Kept as text.                                                         |
| `membership` | Optional    | For example Movers, Shapers, Hotel guest or Staff.                    |
| `active`     | Optional    | `active` / `inactive`, `true` / `false`, `yes` / `no`, or `1` / `0`.  |

Files are limited to 5 MB, 5,000 rows and 50 columns. Only the first visible Excel worksheet is read. Uploads are parsed in bounded worker threads. Previews expire after 30 minutes. All rows must pass validation before any member is written; an import is atomic. Existing members are matched by barcode. Unmapped and blank optional fields preserve existing values; towel history is never replaced. Formula cells in mapped Excel columns are rejected.

To change an existing barcode, edit the member profile. Importing a new barcode creates a new member, because the barcode is the import identity key.

## Verification

```bash
npm test
npm run build
npm audit --omit=dev
```

Integration tests exercise authenticated HTTP requests and the SQL schema: checkout, partial/FIFO returns, concurrent return submissions, idempotent retries, over-return rollback, member limits, role permissions, CSRF, inactive member returns, import validation/commit and CSV formula protection. Local tests use PGlite (PostgreSQL compiled to WASM). GitHub CI also runs the same suite against PostgreSQL 16 and builds the production Docker image.

The supplied reference image was successfully decoded locally as Code 128 with its leading zero preserved. This validates the decoder against that image; **it is not a physical camera test**. Check the actual reception device’s front camera over HTTPS before putting it into daily use. Some front cameras have fixed focus, so the rear-camera switch remains available.

## Layout and operation

- `src/` — React application, scanner and styles.
- `server/` — Express API, authentication, imports and transactional towel logic.
- `server/migrations/` — ordered, versioned SQL migrations.
- `.do/app.yaml` — DigitalOcean App Platform production specification.
- `docs/DEPLOYMENT.md` — deployment, backups, camera setup and account recovery.
- `docs/BRAND.md` — official brand references and asset provenance.

No analytics trackers, camera-image uploads or public registration are included. Camera frames are decoded on the reception device and are never sent to the server. The default return window is 12 hours and the default member limit is six towels; both are editable in Settings.
