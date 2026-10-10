// The UserPromptSubmit hook: hands a queued request to Claude once, then stays quiet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hookScript = join(dirname(fileURLToPath(import.meta.url)), "../tools/canvas-context.mjs");
const runHook = (home) => spawnSync(process.execPath, [hookScript, "--home", home], { input: JSON.stringify({ session_id: "s1" }) }).stdout.toString();

test("hook delivers a queued request once", () => {
	const home = mkdtempSync(join(tmpdir(), "pmp-hook-"));
	try {
		writeFileSync(join(home, "request.json"), JSON.stringify({ kind: "review", planId: "p1", at: Date.now(), deliveredAt: null, context: "Paid media planner request: Review plan\nThe user's note: Be harsh" }));
		const first = JSON.parse(runHook(home));
		assert.match(first.hookSpecificOutput.additionalContext, /^\[Paid media planner request\][\s\S]*Be harsh/);
		assert.equal(runHook(home), "", "delivered only once");
		assert.ok(JSON.parse(readFileSync(join(home, "request.json"), "utf8")).deliveredAt);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("hook adds nothing when no request is queued or it is stale", () => {
	const home = mkdtempSync(join(tmpdir(), "pmp-hook-"));
	try {
		assert.equal(runHook(home), "");
		writeFileSync(join(home, "request.json"), JSON.stringify({ context: "old", at: Date.now() - 13 * 3600e3, deliveredAt: null }));
		assert.equal(runHook(home), "");
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
