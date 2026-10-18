/**
 * Week 7 spec §2.12: lib/registry/nic-elements.ts and public.registry_completeness (migration 0011)
 * name the same 42 elements in the same order. Reads the migration file; no database needed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NIC_ELEMENTS, NIC_TOTAL } from "./nic-elements.ts";

const sql = readFileSync(new URL("../../supabase/migrations/0011_structured_reporting.sql", import.meta.url), "utf8");
const body = sql.slice(sql.indexOf("create function public.registry_completeness"), sql.indexOf("revoke execute on function public.registry_completeness"));
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
