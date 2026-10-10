import { test } from "node:test";
import assert from "node:assert/strict";
import { PLATFORMS, newPlan, newNode, normalize, lint, layoutPlan, issuesByNode } from "../studio/model.mjs";
import { renderMock } from "../studio/mocks.mjs";
import { renderBrief, renderCsv, renderMarkdown } from "../studio/brief.mjs";

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
