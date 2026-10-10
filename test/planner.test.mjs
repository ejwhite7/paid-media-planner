import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PLATFORMS, newPlan, newNode, normalize, lint, layoutPlan, issuesByNode } from "../studio/model.mjs";
import { renderMock } from "../studio/mocks.mjs";
import { renderBrief, renderCsv, renderMarkdown } from "../studio/brief.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("a new plan is valid and connected", () => {
	const { plan, errors } = normalize(newPlan("T"));
	assert.deepEqual(errors, []);
	assert.equal(plan.nodes.length, 3);
	assert.ok(!lint(plan).some((i) => i.severity === "error"));
});

test("normalize rejects bad parents and unknown types", () => {
	const p = newPlan();
	p.nodes[2].parent = p.nodes[0].id; // ad under a campaign
	p.nodes.push({ type: "banner" });
	const { errors } = normalize(p);
	assert.ok(errors.some((e) => /can't sit under/.test(e)));
	assert.ok(errors.some((e) => /unknown type/.test(e)));
});

test("lint flags limits, lorem, overlap, and off-network ads", () => {
	const p = newPlan();
	const [c, s, ad] = p.nodes;
	ad.data.headline = "x".repeat(60);
	p.nodes.push({ ...structuredClone(s), id: "as_twin" });
	const g = newNode("ad", { parent: s.id, platform: "google" });
	p.nodes.push(g);
	const text = lint(normalize(p).plan).map((i) => i.text).join("\n");
	assert.match(text, /Headline is 60 characters/);
	assert.match(text, /lorem ipsum/);
	assert.match(text, /Same targeting/);
	assert.match(text, /Google isn't one of the campaign's networks/);
	void c;
});

test("Claude's open feedback merges into node issues, resolved items drop out", () => {
	const p = newPlan();
	p.feedback.items = [{ node: p.nodes[0].id, severity: "warn", text: "A" }, { node: p.nodes[0].id, severity: "warn", text: "B", resolved: true }];
	const mine = issuesByNode(p)[p.nodes[0].id].filter((i) => i.source === "claude");
	assert.deepEqual(mine.map((i) => i.text), ["A"]);
});

test("every platform and format renders a mock, editable and static", () => {
	for (const [platform, P] of Object.entries(PLATFORMS))
		for (const format of Object.keys(P.formats)) {
			const ad = newNode("ad", { platform }).data;
			ad.format = format;
			const html = renderMock(ad, { name: "Acme", handle: "acme" }, { editable: true });
			assert.match(html, new RegExp(`data-platform="${platform}" data-format="${format}"`), `${platform}/${format}`);
			assert.match(html, /contenteditable/, `${platform}/${format} editable`);
			if (P.formats[format].media !== false) assert.match(html, /data-media=/, `${platform}/${format} media slot`);
			assert.doesNotMatch(renderMock(ad, {}, {}), /contenteditable/);
		}
});

test("mock text is escaped", () => {
	const ad = newNode("ad").data;
	ad.primaryText = `<img src=x onerror=alert(1)>`;
	assert.doesNotMatch(renderMock(ad, {}), /<img src=x/);
});

test("layout puts children right of parents and centres parents", () => {
	const p = layoutPlan(normalize(newPlan()).plan);
	const [c, s, a] = p.nodes;
	assert.ok(c.x < s.x && s.x < a.x);
	assert.equal(c.y, s.y);
});

test("brief, CSV and Markdown include the network's objective and the copy", () => {
	const p = normalize(newPlan("Spring")).plan;
	p.nodes[0].data.platforms = ["meta", "tiktok"];
	p.nodes[0].data.objective = "sales";
	p.nodes[2].data.headline = "Mow less, live more";
	const html = renderBrief(p);
	assert.match(html, /Website conversions/); // TikTok's name for sales
	assert.match(html, /data-check=/);
	assert.match(renderCsv(p), /Mow less, live more/);
	assert.match(renderMarkdown(p), /# Spring/);
});

test("server: create, save with version check, upload, export; hook delivers a request once", async () => {
	const home = mkdtempSync(join(tmpdir(), "cc-"));
	const port = 4800 + Math.floor(Math.random() * 500);
	const env = { ...process.env, PAID_MEDIA_PLANNER_HOME: home };
	const srv = spawn(process.execPath, [join(root, "tools/canvas.mjs"), "--port", String(port)], { env });
	try {
		await new Promise((ok, no) => {
			srv.stdout.on("data", (d) => /Paid media planner at/.test(d) && ok());
			srv.on("exit", (c) => no(new Error(`server exited ${c}`)));
		});
		const base = `http://127.0.0.1:${port}`;
		const j = (r) => r.json();
		const { plan, version } = await fetch(`${base}/api/plans`, { method: "POST", body: JSON.stringify({ name: "E2E" }) }).then(j);
		assert.equal(plan.name, "E2E");
		assert.equal((await fetch(`${base}/`)).status, 200);
		assert.equal((await fetch(`${base}/model.mjs`)).headers.get("content-type"), "text/javascript");

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

		await fetch(`${base}/api/request`, { method: "POST", body: JSON.stringify({ kind: "review", planId: plan.id, note: "Be harsh" }) });
		const hook = () => spawnSync(process.execPath, [join(root, "tools/canvas-context.mjs")], { env, input: JSON.stringify({ session_id: "s1" }) }).stdout.toString();
		const first = hook();
		assert.match(JSON.parse(first).hookSpecificOutput.additionalContext, /Review plan[\s\S]*Be harsh/);
		assert.equal(hook(), "", "delivered only once");
		assert.ok(JSON.parse(readFileSync(join(home, "request.json"), "utf8")).deliveredAt);

		const v = spawnSync(process.execPath, [join(root, "tools/canvas.mjs"), "validate", plan.id], { env }).stdout.toString();
		assert.equal(JSON.parse(v).ok, true);
	} finally {
		srv.kill();
		rmSync(home, { recursive: true, force: true });
	}
});
