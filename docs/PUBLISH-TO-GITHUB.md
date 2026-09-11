# Publishing and updates

The application is maintained in `chordsnstrings/towel`. GitHub Actions validates changes, and DigitalOcean App Platform can deploy updates from `main` after the app and managed database have been configured.

Use your normal authenticated Git client to publish changes. Review the diff before committing, keep credentials in environment variables, and never commit member exports or database files.

For an existing checkout:

```bash
git add .
git commit -m "Describe the change"
git push origin main
```

Use your own Git author configuration and authenticate through your usual GitHub sign-in flow. Do not use a force push. If working from a downloaded archive, clone the current repository and copy the updated project files into that checkout first, then review the diff and commit normally.

After pushing, the included GitHub Actions workflow runs the integration suite against embedded PostgreSQL and PostgreSQL 16, builds the client, audits production dependencies and builds the Docker image. The DigitalOcean app specification points at `main` with automatic deployment on push once you have created and configured the App Platform app.

## Validation completed in the authoring session

- 11 HTTP/database integration tests passed.
- Production frontend build passed.
- Production dependency audit reported zero known vulnerabilities.
- The supplied barcode image decoded successfully as Code 128 and matched the displayed identifier, including the leading zero. The personal image and identifier are excluded from this package.

Physical front-camera operation, browser interaction on the reception device, the PostgreSQL 16 CI job, the Docker build and a live DigitalOcean deployment have not been verified in this session. The project includes the configuration and instructions for those checks.
