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

test("naming convention: tokens, empty tokens drop with their separator, labels read back", async () => {
	const { applyTemplate, applyNaming, conventionName } = await import("../studio/model.mjs");
	assert.equal(applyTemplate("{seq} // {funnel} // {objective} // {label}", { seq: "01", funnel: "", objective: "Sales", label: "Acq" }), "01 // Sales // Acq");
	assert.equal(applyTemplate("{funnel}_{seq}_{label}_{cta}", { seq: "01", funnel: "", label: "A", cta: "" }), "01_A");
	const p = normalize(newPlan()).plan;
	p.nodes[0].data.name = "01 // TOF // Sales // Acquisition";
	p.nodes[0].data.funnel = "tof";
	p.nodes[0].data.objective = "sales";
	assert.equal(applyNaming(p), 2);
	assert.equal(p.nodes[0].data.name, "01 // TOF // Sales // Acquisition", "label read back from a convention-built name");
	assert.equal(conventionName(p, p.nodes[1]), "01.01 // Ad set 1");
	assert.equal(p.nodes[2].data.name, "01.01.A // Ad 1 // Facebook feed");
	p.settings.naming.auto = true;
	p.nodes[2].data.label = "Speed";
	assert.equal(normalize(p).plan.nodes[2].data.name, "01.01.A // Speed // Facebook feed", "normalize renames when auto is on");
});

test("test budget sizes the structure and the funnel weights suggest campaign budgets", async () => {
	const { budgetPlan, suggestedBudget } = await import("../studio/model.mjs");
	const big = budgetPlan({ budget: { monthly: 6000 }, funnel: { tof: 60, mof: 25, bof: 15 } });
	assert.equal(big.campaigns, 3);
	assert.ok(big.adsets >= 3 && big.adsets <= 12);
	assert.ok(big.stages.every((s) => s.ads >= 2 && s.ads <= 5));
	const small = budgetPlan({ budget: { monthly: 1500 }, funnel: { tof: 60, mof: 25, bof: 15 } });
	assert.equal(small.campaigns, 1, "a small budget funds one stage");
	assert.match(small.notes.join(" "), /fold it into TOF/);
	const pricey = budgetPlan({ budget: { monthly: 3000, cpa: 200 } });
	assert.equal(pricey.adsets, 1);
	assert.match(pricey.notes.join(" "), /cheaper event/);

	const p = normalize(newPlan()).plan;
	p.settings.budget.monthly = 6000;
	p.nodes[0].data.funnel = "tof";
	const sug = suggestedBudget(p, p.nodes[0]);
	assert.equal(sug.amount, Math.round((6000 * 0.6 * 12) / 365));
	p.nodes[0].data.budget.amount = 10;
	assert.match(lint(p).map((i) => i.text).join("\n"), /suggests USD 118\/day/);
	for (let i = 0; i < 12; i++) p.nodes.push(newNode("adset", { parent: p.nodes[0].id }));
	assert.match(lint(normalize(p).plan).map((i) => i.text).join("\n"), /13 ad sets on USD 6,000\/month/);
});

test("funnel stage and UGC are inferred for older plans, and UGC keeps its placeholder", () => {
	const p = newPlan();
	delete p.nodes[0].data.funnel;
	p.nodes[0].data.name = "Warm Conversion — BOF";
	delete p.nodes[2].data.creative;
	p.nodes[2].data.notes = "Creator ad: founder-style UGC";
	const { plan } = normalize(p);
	assert.equal(plan.nodes[0].data.funnel, "bof");
	assert.equal(plan.nodes[2].data.creative, "ugc");
	assert.match(renderMock(plan.nodes[2].data, {}), /Creator video \(UGC\)/);
});
