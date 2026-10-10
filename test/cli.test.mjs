// The CLI Claude uses: attach generated creative to an ad, attach a positioning file, rename to the convention.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliScript = join(dirname(fileURLToPath(import.meta.url)), "../tools/canvas.mjs");

test("cli: new, context, attach, name", () => {
	const home = mkdtempSync(join(tmpdir(), "pmp-cli-"));
	const run = (...a) => {
		const r = spawnSync(process.execPath, [cliScript, ...a, "--home", home]);
		assert.equal(r.status, 0, r.stderr.toString());
		return JSON.parse(r.stdout.toString());
	};
	try {
		const { id, path } = run("new", "CLI plan");
		const md = join(home, "acme-positioning.md");
		writeFileSync(md, "# Positioning\nFor busy owners who …");
		const c = run("context", id, md);
		assert.match(readFileSync(c.file, "utf8"), /Positioning/);
		const png = join(home, "hero.png");
		writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));
		const ad = JSON.parse(readFileSync(path, "utf8")).nodes.find((n) => n.type === "ad");
		assert.match(run("attach", id, ad.id, png).src, /^\/assets\/.+\.png$/);
		assert.equal(run("name", id).renamed, 3);
		const plan = JSON.parse(readFileSync(path, "utf8"));
		assert.equal(plan.settings.context[0].name, "acme-positioning.md");
		assert.equal(plan.nodes.find((n) => n.type === "ad").data.media.length, 1);
		assert.equal(plan.nodes[0].data.name, "01 // Traffic // Campaign 1");
		assert.notEqual(spawnSync(process.execPath, [cliScript, "attach", id, ad.id, md, "--home", home]).status, 0, "attach refuses text files");
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
