import { test } from "node:test";
import assert from "node:assert/strict";
import { PLATFORMS, newPlan, newNode, normalize, lint, layoutPlan, issuesByNode, issueKey, derivedBudget } from "../studio/model.mjs";
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
	assert.match(text, /Google isn't this campaign's network/);
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
	const raw = newPlan("Spring");
	raw.nodes[0].data.platforms = ["tiktok"];
	raw.nodes[0].data.nativeObjective = "SALES";
	raw.nodes[2].data.platform = "tiktok";
	raw.nodes[2].data.format = "infeed";
	raw.nodes[2].data.primaryText = "Mow less, live more";
	const p = normalize(raw).plan;
	const html = renderBrief(p);
	assert.match(html, /<th>Objective<\/th><td>Sales<\/td>/); // TikTok's own objective name
	assert.match(html, /TikTok Ads/);
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
	p.nodes[0].data.nativeObjective = "OUTCOME_SALES";
	assert.equal(applyNaming(p), 2);
	assert.equal(p.nodes[0].data.name, "01 // TOF // Sales // Acquisition", "label read back from a convention-built name");
	assert.equal(conventionName(p, p.nodes[1]), "01.01 // Ad set 1");
	assert.equal(p.nodes[2].data.name, "01.01.A // Ad 1 // Static 1:1", "automatic placements: {format} is the creative spec");
	p.settings.naming.auto = true;
	p.nodes[2].data.label = "Speed";
	assert.equal(normalize(p).plan.nodes[2].data.name, "01.01.A // Speed // Static 1:1", "normalize renames when auto is on");
	p.nodes[1].data.placements = ["facebook:feed"];
	assert.equal(normalize(p).plan.nodes[2].data.name, "01.01.A // Speed // Facebook feed", "chosen placements: {format} is the placement format");
	p.nodes[1].data.placements = "automatic";
	p.nodes[2].data.mediaType = "video";
	assert.equal(normalize(p).plan.nodes[2].data.name, "01.01.A // Speed // Video 1:1", "an explicit creative type wins");
});

test("channel budgets size the structure per channel and derive campaign and ad set budgets", async () => {
	const { budgetPlan, derivedBudget } = await import("../studio/model.mjs");
	const big = budgetPlan({ channels: { meta: { monthly: 6000 } }, funnel: { tof: 60, mof: 25, bof: 15 } }, "meta");
	assert.equal(big.campaigns, 3);
	assert.ok(big.adsets >= 3 && big.adsets <= 12);
	const small = budgetPlan({ channels: { meta: { monthly: 1500 } }, funnel: { tof: 60, mof: 25, bof: 15 } }, "meta");
	assert.equal(small.campaigns, 1, "a small channel budget funds one stage");
	assert.match(small.notes.join(" "), /fold it into TOF/);
	assert.equal(budgetPlan({ channels: { meta: { monthly: 3000, cpa: 200 } } }, "meta").adsets, 1);
	assert.equal(budgetPlan({ channels: { snapchat: { monthly: 3000 } } }, "snapchat").perAdsetDaily, 20, "the network minimum or the testing floor, whichever is higher");

	const raw = newPlan();
	raw.settings.channels = { meta: { monthly: 6000 } };
	const tof = raw.nodes[0];
	tof.data.funnel = "tof";
	const bof = newNode("campaign", { data: { name: "Retarget", funnel: "bof" } });
	raw.nodes.push(bof, newNode("adset", { parent: bof.id }), newNode("adset", { parent: bof.id }));
	bof.data.budget = { level: "adset" };
	const p = normalize(raw).plan;
	const daily = (6000 * 12) / 365;
	assert.equal(p.nodes[0].data.budget.amount, Math.round((daily * 60) / 75), "TOF and BOF share the channel 60:15");
	const b = p.nodes.find((n) => n.id === bof.id);
	assert.equal(b.data.budget.amount, Math.round((daily * 15) / 75));
	assert.ok(p.nodes.filter((n) => n.parent === bof.id).every((a) => a.data.budget.amount === Math.round(b.data.budget.amount / 2)), "ABO: the campaign budget splits across its ad sets");
	assert.equal(derivedBudget(p, p.nodes[0]).network, "meta");
	p.nodes[0].data.budget.amount = 1;
	assert.equal(normalize(p).plan.nodes[0].data.budget.amount, Math.round((daily * 60) / 75), "budgets are derived, not typed");
	const old = newPlan();
	old.settings.budget.monthly = 3000;
	assert.deepEqual(normalize(old).plan.settings.channels, { meta: { monthly: 3000, cpa: 0 } }, "a single old test budget becomes the channel budget");
	for (let i = 0; i < 12; i++) p.nodes.push(newNode("adset", { parent: p.nodes[0].id }));
	assert.doesNotMatch(lint(normalize(p).plan).map((i) => i.text).join("\n"), /ad sets on USD|can each get enough spend to read a result/);
});

test("a campaign runs on one network: older multi-network campaigns split, with that network's ads", () => {
	const raw = newPlan();
	const [c, s] = raw.nodes;
	c.data.platforms = ["meta", "tiktok"];
	c.data.objective = "sales";
	delete c.data.nativeObjective; // an older plan: generic objective only
	raw.nodes.push(newNode("ad", { parent: s.id, platform: "tiktok" }));
	const p = normalize(raw).plan;
	const tt = p.nodes.find((n) => n.id === `${c.id}-tiktok`);
	assert.deepEqual(tt.data.platforms, ["tiktok"]);
	assert.equal(tt.data.nativeObjective, "SALES");
	const ttSet = p.nodes.find((n) => n.parent === tt.id);
	assert.equal(p.nodes.find((n) => n.parent === ttSet.id).data.platform, "tiktok");
	assert.deepEqual(p.nodes[0].data.platforms, ["meta"]);
	assert.equal(p.nodes[0].data.nativeObjective, "OUTCOME_SALES");
	assert.equal(normalize(p).plan.nodes.length, p.nodes.length, "splitting is stable");
});

test("settings are checked against what each network offers", async () => {
	const { CATALOG } = await import("../studio/model.mjs");
	const mk = (net, campaign = {}, adset = {}) => {
		const raw = newPlan();
		raw.settings.channels = { [net]: { monthly: 3000 } };
		Object.assign(raw.nodes[0].data, { platforms: [net], ...campaign });
		Object.assign(raw.nodes[1].data, adset);
		raw.nodes[2].data.platform = net;
		raw.nodes[2].data.format = Object.keys(PLATFORMS[net].formats)[0];
		return lint(normalize(raw).plan).map((i) => i.text).join("\n");
	};
	assert.match(mk("meta", { nativeObjective: "OUTCOME_SALES" }, { optimization: "THRUPLAY" }), /isn't a Meta goal for Sales/);
	assert.doesNotMatch(mk("meta", { nativeObjective: "OUTCOME_SALES" }, { optimization: "OFFSITE_CONVERSIONS" }), /performance goal|isn't a Meta goal/);
	assert.match(mk("meta", { special: "HOUSING" }, { ageMin: 25 }), /Special ad category \(Housing\): age and gender can't be narrowed/);
	assert.match(mk("tiktok", {}, { ageBuckets: ["AGE_30_40"] }), /TikTok has no age group AGE_30_40/);
	assert.doesNotMatch(mk("meta", { nativeObjective: "OUTCOME_SALES" }, { optimization: "Purchase" }), /performance goal|isn't a Meta goal/, "old free-text goals map to the network's goal");
	assert.match(mk("reddit", {}, { ageMin: 25 }), /Reddit doesn't target by age/);
	assert.match(mk("meta", {}, { placements: ["facebook:feed", "tiktok:feed"] }), /Meta has no placement tiktok:feed/);
	assert.match(mk("linkedin", { nativeObjective: "JOB_APPLICANT" }, { ageBuckets: ["AGE_25_34"] }), /doesn't allow age targeting for job applicant/);
	assert.match(mk("google", { campaignType: "VIDEO", locations: ["US"] }), /A Video campaign can't run Search/);
	assert.match(mk("google", { campaignType: "SEARCH" }), /Google sets locations on the campaign/);
	const snap = mk("snapchat", { nativeObjective: "AWARENESS_AND_ENGAGEMENT" }, {});
	assert.match(snap, /Pick a performance goal: Impressions, Swipe ups/);
	assert.doesNotMatch(snap, /ages run|call-to-action/, "defaults fit the network: 18-50+, a Snapchat CTA");
	for (const [net, c] of Object.entries(CATALOG)) {
		assert.ok(c.objectives.length && c.objectives.every((o) => o.generic in { awareness: 1, traffic: 1, engagement: 1, video_views: 1, leads: 1, app: 1, sales: 1 }), `${net} objectives map to generic ones`);
		assert.ok(c.bid.strategies.length && Object.keys(c.budget.levels).length && c.genders.length && c.sources.length, `${net} catalog complete`);
	}
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

test("each network gets its own canvas: positions are kept per network and exports can be scoped", async () => {
	const { inView, viewPlan, planNetworks } = await import("../studio/model.mjs");
	const raw = newPlan();
	const tt = newNode("campaign", { platform: "tiktok", data: { platforms: ["tiktok"] } });
	const ttSet = newNode("adset", { parent: tt.id });
	const ttAd = newNode("ad", { parent: ttSet.id, platform: "tiktok" });
	ttAd.views = { tiktok: { x: 5, y: 6 }, nope: { x: 1, y: 1 } };
	raw.nodes.push(tt, ttSet, ttAd);
	const { plan } = normalize(raw);
	assert.deepEqual(plan.nodes.find((n) => n.id === ttAd.id).views, { tiktok: { x: 5, y: 6 } });
	assert.deepEqual(planNetworks(plan), ["meta", "tiktok"]);
	assert.deepEqual(plan.nodes.filter((n) => inView(plan, n, "tiktok")).map((n) => n.id), [tt.id, ttSet.id, ttAd.id]);
	const v = viewPlan(plan, "tiktok");
	assert.equal(v.nodes.length, 3);
	assert.equal(viewPlan(plan, ""), plan);
});

test("slide deck walks the plan: cover, brief, structure, campaign, ad set, ads, build", async () => {
	const { renderSlides } = await import("../studio/slides.mjs");
	const p = normalize(newPlan("Deck")).plan;
	p.brief = "Spring promo";
	p.nodes[2].data.headline = "Mow less, live more";
	const html = renderSlides(p);
	const slides = html.match(/<section class="slide/g).length;
	assert.equal((html.match(/<\/section>/g) ?? []).length, slides, "every slide is closed");
	assert.ok(slides >= 6);
	for (const t of ["Open questions before launch", "How it gets built"]) assert.ok(!html.includes(t), `no "${t}" slide`);
	for (const t of ["Spring promo", "Structure", "Mow less, live more", `${slides} / ${slides}`]) assert.ok(html.includes(t), t);
});

test("removed notes stay hidden: checks by key while their text holds, Claude notes by resolving", () => {
	const p = normalize(newPlan()).plan;
	const all = () => Object.values(issuesByNode(p)).flat();
	const check = all().find((i) => i.source === "check");
	p.feedback.dismissed = [issueKey(check)];
	p.feedback.items = [{ node: null, severity: "warn", text: "Claude note", resolved: true, dismissed: true }];
	assert.ok(!all().some((i) => issueKey(i) === issueKey(check)), "dismissed check is hidden");
	assert.ok(!all().some((i) => i.text === "Claude note"), "dismissed Claude note is hidden");
	assert.deepEqual(normalize(p).plan.feedback.dismissed, [issueKey(check)], "dismissals survive a save");
});

test("campaigns in one funnel stage can split it unevenly with a share; the rest split what's left", () => {
	const p = newPlan();
	p.settings.channels = { meta: { monthly: 36500, cpa: 0 } };
	p.settings.funnel = { tof: 100, mof: 0, bof: 0 };
	p.nodes = ["a", "b", "c"].map((label) => newNode("campaign", { data: { label, funnel: "tof", platforms: ["meta"] } }));
	const daily = (plan) => plan.nodes.map((c) => derivedBudget(plan, c).daily);
	assert.deepEqual(daily(normalize(p).plan), [400, 400, 400], "even split by default");
	p.nodes[0].data.budget = { level: "campaign", share: 70 };
	assert.deepEqual(daily(normalize(p).plan), [840, 180, 180], "a 70% share; the other two split 30%");
	p.nodes[1].data.budget = { level: "campaign", share: 70 };
	assert.deepEqual(daily(normalize(p).plan), [600, 600, 0], "shares over 100% scale down to fit");
});
