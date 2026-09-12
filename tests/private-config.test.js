import test from "node:test";
import assert from "node:assert/strict";
import { loadPrivateConfig } from "../server/private-config.js";
import settings from "../app.config.json" with { type: "json" };

test("private database configuration is limited to the configured production site", async () => {
  const context = {
    deploy: { context: "production" },
    site: { id: settings.netlify.siteId },
  };
  const stored = {
    version: 1,
    projectId: settings.neon.projectId,
    branch: settings.neon.branch,
    databaseUrl:
      "postgresql://test:test-password@ep-test.neon.tech/neondb?sslmode=verify-full",
  };
  let reads = 0;
  const read = async () => {
    reads++;
    return stored;
  };
  for (const blocked of [
    {},
    { ...context, deploy: { context: "deploy-preview" } },
    { ...context, deploy: { context: "branch-deploy" } },
    { ...context, site: { id: "unrelated-site" } },
  ])
    await assert.rejects(
      loadPrivateConfig(blocked, {}, read),
      /unavailable here/,
    );
  assert.equal(reads, 0, "Rejected deploys must not even read the credential");
  const config = await loadPrivateConfig(context, {}, read);
  assert.equal(config.databaseUrl, stored.databaseUrl);
  assert.equal(config.production, true);
  assert.equal(config.origin, settings.origin);
  assert.equal(config.adminPassword, undefined);
  for (const invalid of [
    null,
    {},
    { ...stored, projectId: "another-project" },
    { ...stored, databaseUrl: "postgresql://test:pass@evil.test/db" },
    { ...stored, databaseUrl: "not-a-url" },
  ]) {
    await assert.rejects(loadPrivateConfig(context, {}, async () => invalid));
  }
  const legacy = await loadPrivateConfig(
    {},
    { DATABASE_URL: "postgres://legacy.test/db" },
    () => assert.fail("No Blob read for explicit configuration"),
  );
  assert.equal(legacy.databaseUrl, "postgres://legacy.test/db");
});
