import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { zipFunctions } from "@netlify/zip-it-and-ship-it";
import { parse } from "smol-toml";
import ExcelJS from "exceljs";

const config = parse(await readFile("netlify.toml", "utf8"));
const [artifact] = await zipFunctions(
  config.build.functions,
  ".netlify/bundle-check",
  {
    archiveFormat: "none",
    basePath: process.cwd(),
    config: {
      "*": {
        nodeBundler: config.functions.node_bundler,
        nodeVersion: config.build.environment.NODE_VERSION,
        externalNodeModules: config.functions.external_node_modules,
        includedFiles: config.functions.included_files,
      },
    },
  },
);
assert.equal(
  artifact.runtimeAPIVersion,
  2,
  "Use the modern Netlify Functions runtime",
);
const isolated = await mkdtemp(join(tmpdir(), "move-netlify-"));
try {
  await cp(resolve(artifact.path), isolated, { recursive: true });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Members");
  sheet.addRow(["barcode", "full_name"]);
  sheet.addRow(["000BUNDLE", "Bundle Member"]);
  await writeFile(
    join(isolated, "members.xlsx"),
    await workbook.xlsx.writeBuffer(),
  );
  // An isolated directory prevents imports from accidentally using project files.
  const check = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    import { Worker } from 'node:worker_threads';
    import { resolve } from 'node:path';
    import api from './netlify/functions/api.mjs';
    const response = await api(new Request('https://bundle.example.test/api/health'), {ip:'192.0.2.1'});
    assert.equal(response.status, 503, 'Missing production configuration should fail safely');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    for (const name of ['001_initial.sql','002_login_limits.sql'])
      assert.ok((await readFile('server/migrations/'+name, 'utf8')).includes('CREATE TABLE'));
    for (const extension of ['csv', 'xlsx']) {
      const buffer = extension==='csv' ? Buffer.from('barcode,full_name\\n000BUNDLE,Bundle Member\\n') : await readFile('members.xlsx');
      const worker = new Worker(resolve('.netlify/runtime/import-worker.cjs'), { execArgv: [], workerData: {buffer, extension} });
      const result = await new Promise((done, reject) => { worker.once('message',done); worker.once('error',reject); });
      await worker.terminate();
      assert.equal(result.records[0].cells[0].value, '000BUNDLE');
    }
    console.log('Netlify package: function loads, SQL files are present, bundled CSV/Excel parser runs.');
  `,
    ],
    {
      cwd: isolated,
      encoding: "utf8",
      timeout: 30000,
      env: { PATH: process.env.PATH, NODE_ENV: "production" },
    },
  );
  assert.equal(
    check.status,
    0,
    check.stderr || check.stdout || String(check.error),
  );
  process.stdout.write(check.stdout);
} finally {
  await rm(isolated, { recursive: true, force: true });
}
