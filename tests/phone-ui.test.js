import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";

let dom, root, PhoneDesk, testDirectory;
const originalFetch = globalThis.fetch;
const members = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    full_name: "Avery Test",
    phone: "+971500001122",
    active: true,
    membership: "Member",
    outstanding: 0,
    overdue: 0,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    full_name: "Blake Test",
    phone: "+971550001122",
    active: true,
    membership: "Member",
    outstanding: 2,
    overdue: 0,
  },
];
before(async () => {
  dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "https://desk.example.test", pretendToBeVisual: true },
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(
    dom.window,
  );
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  });
  const { createRoot } = await import("react-dom/client");
  root = createRoot(document.querySelector("#root"));
  await mkdir(".netlify", { recursive: true });
  testDirectory = await mkdtemp(resolve(".netlify/phone-ui-test-"));
  const compiled = await build({
    entryPoints: ["src/PhoneDesk.jsx"],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    packages: "external",
    loader: { ".css": "empty" },
  });
  const filename = join(testDirectory, "desk.mjs");
  await writeFile(filename, compiled.outputFiles[0].text);
  PhoneDesk = (await import(pathToFileURL(filename).href)).default;
});
after(async () => {
  await act(async () => root?.unmount());
  dom?.window.close();
  globalThis.fetch = originalFetch;
  if (testDirectory) await rm(testDirectory, { recursive: true, force: true });
});
const button = (text) =>
  [...document.querySelectorAll("button")].find(
    (node) => node.textContent.trim() === text,
  );
async function click(node) {
  assert.ok(node, "Control exists");
  assert.equal(node.disabled, false, "Control is available");
  await act(async () => node.click());
}
const wait = (ms) =>
  act(async () => {
    await new Promise((done) => setTimeout(done, ms));
  });

test("reception confirms a shared suffix match, retries the same handover and undo, then resets", async () => {
  const requests = [],
    handovers = [],
    undos = [];
  let busy = false;
  const original = {
    id: "33333333-3333-4333-8333-333333333333",
    created_at: new Date().toISOString(),
    kind: "return",
    quantity: 2,
  };
  globalThis.fetch = async (path, options = {}) => {
    const url = new URL(path, "https://desk.example.test");
    requests.push(url.pathname);
    let body;
    if (url.pathname === "/api/dashboard") body = { outstanding: 2 };
    else if (url.pathname === "/api/members/search")
      body = { rows: members, total: 2 };
    else if (url.pathname.startsWith("/api/members/"))
      body = members.find((m) => url.pathname.endsWith(m.id));
    else if (url.pathname === "/api/settings")
      body = { max_outstanding: 6, due_hours: 12 };
    else if (url.pathname === "/api/transactions") {
      handovers.push(JSON.parse(options.body));
      if (handovers.length === 1)
        throw new TypeError("Connection lost after save");
      body = { transaction: original, currentBalance: 0, replayed: true };
    } else if (url.pathname.endsWith("/undo")) {
      undos.push(JSON.parse(options.body));
      if (undos.length === 1)
        throw new TypeError("Connection lost after correction");
      body = {
        transaction: {
          ...original,
          id: "44444444-4444-4444-8444-444444444444",
          kind: "checkout",
          reversal_of: original.id,
        },
        currentBalance: 2,
        replayed: true,
      };
    } else throw new Error("Unexpected API call " + url.pathname);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  await act(async () =>
    root.render(
      React.createElement(PhoneDesk, {
        admin: true,
        notify() {},
        onNavigate() {},
        onBusyChange(value) {
          busy = value;
        },
        MemberForm: () => null,
      }),
    ),
  );
  assert.equal(
    document.querySelector("#reception-phone").getAttribute("inputmode"),
    "none",
  );
  for (const digit of "1122") await click(button(digit));
  await wait(220);
  assert.equal(document.querySelectorAll(".phone-match").length, 2);
  assert.equal(
    requests.some(
      (path) => path.includes(members[0].id) || path.includes(members[1].id),
    ),
    false,
    "No member is selected automatically",
  );
  await click(document.querySelectorAll(".phone-match")[1]);
  await click(button("Return all 2 towels"));
  assert.equal(handovers[0].memberId, members[1].id);
  assert.equal(handovers[0].quantity, 2);
  assert.equal(busy, true);
  assert.equal(document.querySelector("#reception-phone").disabled, true);
  assert.equal(button("Change member").disabled, true);
  await click(button("Retry same handover"));
  assert.equal(handovers.length, 2);
  assert.equal(
    handovers[0].requestId,
    handovers[1].requestId,
    "A lost response cannot create a second handover",
  );
  assert.match(
    document.querySelector(".phone-saved").textContent,
    /Blake Test/,
  );
  assert.equal(busy, false);
  await wait(2500);
  assert.equal(document.querySelector("#reception-phone").value, "");
  assert.ok(
    button("Undo last action"),
    "Last action stays available after reset",
  );
  for (const digit of "1122") await click(button(digit));
  await wait(220);
  await click(button("Undo last action"));
  assert.equal(busy, true);
  assert.equal(
    document.querySelector(".phone-match").disabled,
    true,
    "Unknown correction cannot race a new handover",
  );
  await click(button("Retry same undo"));
  assert.equal(undos[0].requestId, undos[1].requestId);
  assert.match(
    document.querySelector(".phone-saved").textContent,
    /Handover corrected/,
  );
  assert.match(
    document.querySelector(".phone-saved").textContent,
    /2 towels with member/,
  );
  await click(button("Next member"));
  assert.equal(document.querySelector("#reception-phone").value, "");
  await click(button("Search by name instead"));
  assert.equal(document.querySelector("#reception-phone").type, "text");
  assert.equal(document.querySelector(".phone-keypad"), null);
});
