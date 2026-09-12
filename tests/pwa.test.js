import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("PWA caches only its public shell and leaves API calls and writes on the network", async () => {
  const listeners = new Map();
  const writes = [],
    deleted = [];
  let offline = false;
  const shell = new Map([
    ["/index.html", "public app shell"],
    ["/assets/app.js", "public app code"],
  ]);
  const cache = {
    addAll: async (files) => writes.push(...files),
    match: async (path) => shell.get(path),
  };
  const context = {
    CACHE_NAME: "move-towel-current",
    SHELL: [...shell.keys()],
    URL,
    Set,
    self: {
      location: { origin: "https://desk.example.test" },
      addEventListener: (type, handler) => listeners.set(type, handler),
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => cache,
      keys: async () => ["move-towel-old", "move-towel-current", "another-app"],
      delete: async (name) => deleted.push(name),
    },
    fetch: async () => {
      if (offline) throw new Error("offline");
      return "live page";
    },
  };
  vm.runInNewContext(
    await readFile(
      new URL("../scripts/service-worker.js", import.meta.url),
      "utf8",
    ),
    context,
  );
  for (const type of ["install", "activate"]) {
    let pending;
    listeners.get(type)({
      waitUntil: (promise) => {
        pending = promise;
      },
    });
    await pending;
  }
  assert.deepEqual(writes, [...shell.keys()]);
  assert.deepEqual(deleted, ["move-towel-old"]);
  const request = (path, method = "GET", mode = "cors") => {
    let result;
    listeners.get("fetch")({
      request: {
        url: new URL(path, context.self.location.origin).href,
        method,
        mode,
      },
      respondWith: (promise) => {
        result = promise;
      },
    });
    return result;
  };
  for (const path of [
    "/api/auth/me",
    "/api/members",
    "/api/imports/123",
    "/api",
    "/.netlify/functions/api/members",
    "https://another.example.test/index.html",
  ]) {
    assert.equal(request(path), undefined);
  }
  assert.equal(request("/api/transactions", "POST"), undefined);
  assert.equal(request("/index.html", "POST"), undefined);
  assert.equal(request("/private-export.csv"), undefined);
  assert.equal(await request("/assets/app.js"), "public app code");
  assert.equal(await request("/", "GET", "navigate"), "live page");
  offline = true;
  assert.equal(await request("/", "GET", "navigate"), "public app shell");
  assert.equal(request("/api/members"), undefined);
  assert.deepEqual(writes, [...shell.keys()]);
});
