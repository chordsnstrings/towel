# DigitalOcean deployment and reception setup

## 1. Create the database

Create a DigitalOcean **Managed PostgreSQL** cluster in the same region as the app. The provided spec uses Frankfurt (`fra`) and a cluster named `move-towel-db`; change both to match your selected region and cluster. PostgreSQL 16 or newer is supported. App Platform attaches a production database by `cluster_name`; it does not provision that production cluster from the spec.

The supplied configuration uses `defaultdb` / `doadmin` for initial compatibility. You can instead provision a dedicated database and user that owns its schema, then set `db_name` and `db_user` accordingly. The runtime executes migrations at startup and needs permission to create and update the application tables.

## 2. Connect the repository and apply the spec

In App Platform, create an app from `chordsnstrings/towel`, branch `main`, using `Dockerfile`. Apply `.do/app.yaml` through the app specification editor (or `doctl apps create --spec .do/app.yaml` after configuring a local copy). Select a service, not a static site. HTTP port is **8080** and the health-check path is **/api/health**.

The multi-stage Docker image builds the React client and installs only production dependencies in the runtime. It runs as the unprivileged `node` user. The same Express process serves the frontend and API, so no separate API URL or CORS configuration is needed.

Attach the managed database component named `towel-db` and add the App Platform application as a trusted source in the database’s network settings. The spec uses DigitalOcean’s database URL and CA-certificate bindings. Certificate verification is enabled; do not disable it to work around configuration errors.

## 3. Set runtime variables

| Variable           | Value                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| `NODE_ENV`         | `production`                                                                 |
| `PORT`             | `8080`                                                                       |
| `APP_ORIGIN`       | `${APP_URL}` — your exact HTTPS application origin, without a trailing slash |
| `DATABASE_URL`     | `${towel-db.DATABASE_URL}` (encrypted)                                       |
| `DATABASE_CA_CERT` | `${towel-db.CA_CERT}` (encrypted)                                            |
| `DATABASE_SSL`     | `true`                                                                       |
| `ADMIN_EMAIL`      | The first administrator’s real email                                         |
| `ADMIN_PASSWORD`   | A unique password, 12–200 characters; mark encrypted                         |
| `DEMO_MODE`        | `false`                                                                      |

Replace the sample administrator values before the first deployment. The application intentionally refuses known placeholder passwords, missing production database configuration, non-HTTPS production origins, and production demo mode.

Database migrations run transactionally at startup. A PostgreSQL advisory lock prevents two starting instances from racing on migrations. The first administrator is inserted only if that email is absent. Existing passwords are never overwritten on redeploy. After the administrator exists, remove `ADMIN_PASSWORD` and `ADMIN_EMAIL` from runtime variables if you no longer need bootstrap configuration.

For a custom domain, set it as the primary domain and ensure `APP_ORIGIN` matches the exact origin staff use. An origin mismatch blocks writes by design. With the default DigitalOcean domain, `${APP_URL}` handles this automatically.

## 4. Commission the reception desk

1. Open the deployed HTTPS URL and sign in as administrator.
2. Create individual reception accounts under **Settings → Reception team**. Administrators can import members and manage settings; reception staff can search members and record towel movements.
3. Upload the member list under **Members → Import members**. Review mappings and fix every reported error before committing.
4. Set the towel limit and return window under **Settings**. The return window applies to new checkouts; existing loan deadlines are preserved.
5. On the reception device, allow camera access. The scanner requests the **front camera** first. If that camera cannot focus on barcodes, increase the card/phone distance or use the camera-switch button.
6. Test one checkout, one partial return and the remaining return. Refresh on a second device to confirm the shared balance. Use an explicitly designated test member and return all its towels after testing.

The scanner reads camera frames locally. It does not record or upload video. Use normal Safari/Chrome/Edge browser tabs over HTTPS, not an embedded third-party in-app browser. Camera permissions cannot be granted silently by this app.

Scanning identifies the member; it does not automatically issue or return towels. Staff choose the action and quantity, physically hand over/receive the towels, then confirm. A member with towels outstanding opens in **Return** mode. Partial returns apply to the oldest outstanding loan first. Inactive members can return towels but cannot borrow more.

If a connection fails during confirmation, keep the dialog open and retry the same action. The request ID is retained so a successful first request is not recorded twice. If the page was reloaded or the dialog closed, scan again and inspect the current balance/history before initiating another handover.

## Operations and backups

- The database is the source of truth. App Platform’s container filesystem is ephemeral and holds no production member records.
- Configure and monitor the managed database’s backup retention. Before schema changes or bulk imports, take a database backup; test restore procedures periodically.
- `/api/health` returns a successful response only when the database responds. No member details are returned by this endpoint.
- Sessions expire after 12 hours. Deactivating a staff account revokes its active sessions immediately.
- Login rate limiting is process-local. The supplied app runs one instance; use a shared rate-limit store or an upstream rate limiter before increasing the service to multiple replicas. Towel balances and sessions already use the shared database.
- Towel transactions and audit records are append-only through the API. A recorded physical mistake is corrected with an opposite towel movement and a clear note, preserving the original record.
- Import staging records are purged after expiry and their raw contents are cleared after a successful import. Original spreadsheet files are not retained on disk.
- Times and daily totals use `Asia/Dubai`; stored timestamps and CSV export timestamps use UTC.

## Password recovery

An operator with trusted access to the App Platform console can reset a known staff account. Do not put passwords in command-line arguments or source control. In a Bash console, read the password without echoing it, export it for the reset process, then clear it:

```bash
read -r -s -p 'New staff password: ' RESET_PASSWORD
export RESET_PASSWORD
node server/reset-password.js staff@example.com
unset RESET_PASSWORD
```

The script requires 12–200 characters, updates the password hash, revokes sessions and adds an audit entry. Replace `staff@example.com` with the staff account’s email. Share account credentials through your normal secure staff onboarding process.

## Verification and limits

`npm test` runs against a temporary in-memory PostgreSQL engine. To exercise a disposable real PostgreSQL database, set `TEST_DATABASE_URL` and run the same test suite. **Never point TEST_DATABASE_URL at a production database.** CI provides a fresh PostgreSQL 16 service for this purpose.

The automated suite covers server behavior and accounting. Device-level camera permission, focus, glare and low-light behavior need the real reception hardware. This project has not been deployed into your DigitalOcean account by the code-authoring session; deployment requires your database attachment and runtime credentials.

## Reference documentation

- [DigitalOcean App Specification](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)
- [Database URL, CA certificate and app URL bindings](https://docs.digitalocean.com/products/app-platform/how-to/use-environment-variables/)
- [Securing managed PostgreSQL](https://docs.digitalocean.com/products/databases/postgresql/how-to/secure/)
