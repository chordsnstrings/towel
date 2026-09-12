# Publishing and updates

The application is maintained in `chordsnstrings/towel`. GitHub Actions validates changes, and Netlify can deploy updates from `main` after the project and database have been configured.

Use your normal authenticated Git client to publish changes. Review the diff before committing, keep credentials in environment variables, and never commit member exports or database files.

For an existing checkout:

```bash
git add .
git commit -m "Describe the change"
git push origin main
```

Use your own Git author configuration and authenticate through your usual GitHub sign-in flow. Do not use a force push. If working from a downloaded archive, clone the current repository and copy the updated project files into that checkout first, then review the diff and commit normally.

After pushing, the included GitHub Actions workflow runs the integration suite against embedded PostgreSQL and PostgreSQL 16, builds the client, audits production dependencies and builds the Docker image. Netlify builds the frontend and API using `netlify.toml`; see [DEPLOYMENT.md](DEPLOYMENT.md) for setup.

## Validation completed in the authoring session

- HTTP/database and Netlify adapter integration tests passed.
- Production frontend build passed.
- Production dependency audit reported zero known vulnerabilities.
- Phone lookup, import identity matching, audited corrections and lost-response retries have dedicated API and reception DOM tests. Personal images and member records are excluded from this package.

GitHub Actions reports PostgreSQL and deployment-package checks for each commit. The linked Netlify site deploys `main` automatically. Check touch sizing on the reception device after an update.
