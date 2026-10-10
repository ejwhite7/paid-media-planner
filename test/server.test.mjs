// The server, run in this process against a temporary home folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve, setHome } from "../tools/canvas.mjs";

test("server: create, save with version check, upload, export, queue a request", async () => {
	const home = mkdtempSync(join(tmpdir(), "pmp-"));
	setHome(home);
	const server = serve(0);
	await new Promise((ok) => server.once("listening", ok));
	const base = `http://127.0.0.1:${server.address().port}`;
	const j = (r) => r.json();
	try {
		const { plan, version } = await fetch(`${base}/api/plans`, { method: "POST", body: JSON.stringify({ name: "E2E" }) }).then(j);
		assert.equal(plan.name, "E2E");
		assert.equal((await fetch(`${base}/`)).status, 200);
		assert.equal((await fetch(`${base}/model.mjs`)).headers.get("content-type"), "text/javascript");
		assert.equal((await fetch(`${base}/fonts/manrope-400.ttf`)).status, 200);

		plan.name = "E2E renamed";
		const put = await fetch(`${base}/api/plans/${plan.id}`, { method: "PUT", headers: { "x-base-version": version }, body: JSON.stringify(plan) });
		assert.equal(put.status, 200);
		const stale = await fetch(`${base}/api/plans/${plan.id}`, { method: "PUT", headers: { "x-base-version": version }, body: JSON.stringify(plan) });
		assert.equal(stale.status, 409, "a save based on an old version is refused");

		const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
		const asset = await fetch(`${base}/api/plans/${plan.id}/assets`, { method: "POST", headers: { "content-type": "image/png", "x-filename": "hero.png" }, body: png }).then(j);
		assert.match(asset.src, /^\/assets\/.+\.png$/);
		assert.equal((await fetch(`${base}/api/plans/${plan.id}/assets`, { method: "POST", headers: { "content-type": "text/html" }, body: "<b>" })).status, 415);
		const cur = await fetch(`${base}/api/plans/${plan.id}`).then(j);
		cur.plan.nodes[2].data.media = [asset];
		await fetch(`${base}/api/plans/${plan.id}`, { method: "PUT", headers: { "x-base-version": cur.version }, body: JSON.stringify(cur.plan) });
		const html = await fetch(`${base}/api/plans/${plan.id}/export.html`).then((r) => r.text());
		assert.match(html, /data:image\/png;base64,/, "export inlines uploaded assets");
		assert.match(html, /GrowthCast/);

		const r = await fetch(`${base}/api/request`, { method: "POST", body: JSON.stringify({ kind: "review", planId: plan.id, note: "Be harsh" }) }).then(j);
		assert.match(r.context, /Review plan[\s\S]*Be harsh/);
		assert.equal(r.deliveredAt, null);
	} finally {
		server.close();
		rmSync(home, { recursive: true, force: true });
	}
});
