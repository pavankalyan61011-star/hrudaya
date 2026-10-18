/**
 * Week 7 spec §2.12: lib/registry/nic-elements.ts and public.registry_completeness name the same 42
 * elements in the same order. Reads the latest migration that defines the function (0011, replaced
 * in 0012); no database needed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { NIC_ELEMENTS, NIC_TOTAL } from "./nic-elements.ts";

const dir = new URL("../../supabase/migrations/", import.meta.url);
const latest = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
  .map((f) => readFileSync(new URL(f, dir), "utf8"))
  .filter((s) => /function public\.registry_completeness/.test(s)).at(-1)!;
const body = latest.slice(latest.search(/create (or replace )?function public\.registry_completeness/), latest.indexOf("revoke execute on function public.registry_completeness"));
const sqlKeys = [...body.matchAll(/^\s*\((\d+),\s*'([a-z0-9_]+)'/gm)].map((m) => ({ ord: Number(m[1]), key: m[2] }));

test("42 elements, unique keys", () => {
  assert.equal(NIC_TOTAL, 42);
  assert.equal(new Set(NIC_ELEMENTS.map((e) => e.key)).size, 42);
});

test("TypeScript list = SQL registry_completeness, same keys in the same order", () => {
  assert.deepEqual(sqlKeys.map((k) => k.ord), Array.from({ length: 42 }, (_, i) => i + 1), "SQL ordinals are 1…42");
  assert.deepEqual(sqlKeys.map((k) => k.key), NIC_ELEMENTS.map((e) => e.key));
});

test("every element says where it is entered and which CathPCI concept it corresponds to", () => {
  for (const e of NIC_ELEMENTS) {
    assert.ok(e.label && e.sheet && e.ncdr, e.key);
  }
});
