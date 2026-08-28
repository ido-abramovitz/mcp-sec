import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = [
  "/",
  "/assessments",
  "/enterprise",
  "/catalog",
  "/scanner",
  "/methodology",
  "/mcp/filesystem-mcp",
];

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders every public route", async () => {
  for (const route of routes) {
    const response = await render(route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    assert.match(await response.text(), /mcpSecurity(?:\.cloud)?/i, route);
  }
});

test("uses native anchors for reliable internal navigation", async () => {
  const sourceFiles = [
    "../app/page.tsx",
    "../app/assessments/page.tsx",
    "../app/enterprise/page.tsx",
    "../app/catalog/page.tsx",
    "../app/scanner/page.tsx",
    "../app/methodology/page.tsx",
    "../app/mcp/filesystem-mcp/page.tsx",
  ];

  for (const sourceFile of sourceFiles) {
    const source = await readFile(new URL(sourceFile, import.meta.url), "utf8");
    assert.doesNotMatch(source, /from ["']next\/link["']/, sourceFile);
    assert.doesNotMatch(source, /<\/?Link\b/, sourceFile);
  }

  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(home, /<a className="button" href="\/assessments">/);
  assert.match(home, /<a className="button ghost" href="\/enterprise">/);
});

test("renders one shared contact form and validates required fields", async () => {
  const assessment = await render("/assessments");
  const html = await assessment.text();
  assert.match(html, /Work email/);
  assert.match(html, /Company/);
  assert.match(html, /Message/);
  assert.doesNotMatch(html, /mailto:/i);

  const invalid = await renderRequest("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Only a name" }) });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "Please complete all required fields." });
});

async function renderRequest(pathname, init) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${pathname}`, init), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}
