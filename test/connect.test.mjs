// The Composio connector against a fake Composio API: responses shaped like each tool's documented output.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newPlan, normalize } from "../studio/model.mjs";
import { adAccounts, composio, connectable, toNodes, CONNECTORS } from "../studio/connect.mjs";
import { serve, setHome } from "../tools/canvas.mjs";

const TOOLS = {
	METAADS_GET_AD_ACCOUNTS: () => ({ data: [{ id: "act_1", name: "Durable", currency: "CAD" }] }),
	METAADS_LIST_CAMPAIGNS: () => ({ data: [{ id: "c1", name: "TOF Scale", objective: "OUTCOME_SALES", effective_status: "ACTIVE", daily_budget: "134000", start_time: "2026-10-01T00:00:00-0700" }, { id: "c9", name: "Old promo", objective: "OUTCOME_SALES", effective_status: "PAUSED", daily_budget: "50000" }], paging: {} }),
	METAADS_READ_ADSETS: () => ({ data: [{ id: "s1", name: "Advantage+ audience", campaign_id: "c1", effective_status: "ACTIVE", optimization_goal: "VALUE", targeting: { age_min: 21, age_max: 65, geo_locations: { countries: ["US"] }, targeting_automation: { advantage_audience: 1 }, excluded_custom_audiences: [{ id: "9", name: "Paid customers" }] } }] }),
	METAADS_LIST_ADS: () => ({ data: [{ id: "a0", name: "Paused test", adset_id: "s1", effective_status: "PAUSED" }, { id: "a1", name: "UGC cleaner", adset_id: "s1", effective_status: "ACTIVE", creative: { id: "cr1", title: "Book and get paid", body: "Cleaners: get booked online.", object_type: "VIDEO" } }] }),
	GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS: () => ({ resourceNames: ["customers/9085658195"] }),
	GOOGLEADS_SEARCH_STREAM_GAQL: (a) => {
		const q = a.query;
		if (q.includes("FROM customer")) return { results: [{ customer: { id: "9085658195", descriptiveName: "Durable", currencyCode: "CAD", manager: false } }] };
		if (q.includes("metrics.cost_micros")) return { results: [{ campaign: { id: "11" }, metrics: { costMicros: "23291640855", clicks: "10240", conversions: 181.2, conversionsValue: 17675.7 } }] };
		if (q.includes("FROM campaign")) return { results: [{ campaign: { id: "11", name: "Brand Search", status: "ENABLED", advertisingChannelType: "SEARCH", biddingStrategyType: "MAXIMIZE_CONVERSIONS", maximizeConversions: { targetCpaMicros: "140000000" }, startDate: "2025-01-01" }, campaignBudget: { amountMicros: "400000000" } }] };
		if (q.includes("FROM ad_group_criterion")) return { results: [{ adGroup: { id: "21" }, adGroupCriterion: { keyword: { text: "durable", matchType: "EXACT" }, negative: false } }, { adGroup: { id: "21" }, adGroupCriterion: { keyword: { text: "durable goods", matchType: "BROAD" }, negative: true } }] };
		if (q.includes("FROM ad_group_ad")) return { results: [{ adGroup: { id: "21" }, adGroupAd: { status: "ENABLED", ad: { id: "31", type: "RESPONSIVE_SEARCH_AD", finalUrls: ["https://durable.com/"], responsiveSearchAd: { headlines: [{ text: "Durable AI Website Builder" }, { text: "Official Site" }, { text: "Build in 30 Seconds" }], descriptions: [{ text: "Website, bookings and payments." }, { text: "Start free." }], path1: "ai" } } } }] };
		if (q.includes("FROM ad_group")) return { results: [{ campaign: { id: "11" }, adGroup: { id: "21", name: "Brand KWs", status: "ENABLED" } }] };
		return { results: [] };
	},
	TIKTOK_ADS_GET_ADVERTISER_ACCOUNTS: () => ({ advertiser_accounts: [{ advertiser_id: "777", name: "Durable TT", currency: "USD" }] }),
	TIKTOK_ADS_LIST_CAMPAIGNS: () => ({ campaigns: [{ campaign_id: "t1", campaign_name: "Spark", objective_type: "WEB_CONVERSIONS", operation_status: "ENABLE", budget: 200, budget_mode: "BUDGET_MODE_DAY" }], has_more: false }),
	TIKTOK_ADS_LIST_AD_GROUPS: () => ({ ad_groups: [{ adgroup_id: "g1", adgroup_name: "Broad", campaign_id: "t1", operation_status: "ENABLE", age_groups: ["AGE_25_34"] }], has_more: false }),
	TIKTOK_ADS_LIST_ADS: () => ({ ads: [{ ad_id: "x1", ad_name: "Creator 1", adgroup_id: "g1", operation_status: "DISABLE" }], has_more: false }),
};
function fakeComposio() {
	const calls = [];
	const conns = [];
	const fetch = async (url, init = {}) => {
		const u = new URL(url);
		const body = init.body ? JSON.parse(init.body) : null;
		calls.push({ method: init.method, path: u.pathname, body, key: init.headers["x-api-key"] });
		const ok = (j) => ({ ok: true, status: 200, json: async () => j });
		if (u.pathname.endsWith("/auth_configs") && init.method === "GET") return ok({ items: [] });
		if (u.pathname.endsWith("/auth_configs")) return ok({ auth_config: { id: `ac_${body.toolkit.slug}` } });
		if (u.pathname.endsWith("/connected_accounts/link")) {
			conns.push({ id: `ca_${body.auth_config_id}`, toolkit: { slug: body.auth_config_id.slice(3) }, status: "ACTIVE" });
			return ok({ redirect_url: "https://connect.composio.dev/link/x", connected_account_id: "ca_x" });
		}
		if (u.pathname.endsWith("/connected_accounts")) return ok({ items: conns.filter(() => u.searchParams.get("user_ids") === "paid-media-planner") });
		const m = /\/tools\/execute\/([A-Z_]+)$/.exec(u.pathname);
		if (m) return TOOLS[m[1]] ? ok({ successful: true, data: TOOLS[m[1]](body.arguments) }) : ok({ successful: false, error: "unknown tool" });
		return { ok: false, status: 404, json: async () => ({ error: { message: "not found" } }) };
	};
	return { fetch, calls };
}

test("connect: a network links through Composio, lists accounts and imports read-only into valid plan nodes", async () => {
	const fake = fakeComposio();
	const svc = adAccounts(composio({ apiKey: "k", fetch: fake.fetch }), "paid-media-planner");
	assert.deepEqual(connectable(), ["meta", "google", "tiktok", "linkedin", "reddit", "pinterest", "snapchat"]);
	await assert.rejects(svc.accounts("meta"), /Connect Meta Ads first/);
	const link = await svc.connect("meta");
	assert.equal(link.url, "https://connect.composio.dev/link/x");
	assert.equal(fake.calls.find((c) => c.path.endsWith("/connected_accounts/link")).body.auth_config_id, "ac_metaads");
	assert.ok((await svc.status()).find((n) => n.net === "meta").connected);
	const [acct] = await svc.accounts("meta");
	assert.deepEqual(acct, { id: "act_1", name: "Durable", currency: "CAD" });
	const r = await svc.import("meta", acct);
	assert.deepEqual(r.counts, { campaigns: 1, adsets: 1, ads: 1 });
	assert.equal(r.monthly, Math.round(1340 * 30.4));
	const [c, s, a] = r.nodes;
	assert.equal(c.data.nativeObjective, "OUTCOME_SALES");
	assert.equal(c.status, "live");
	assert.match(c.data.notes, /campaign c1, active[\s\S]*Live budget: CAD 1,340\/day/);
	assert.deepEqual([s.data.ageMin, s.data.locations, s.data.exclusions], [21, ["US"], ["Paid customers"]]);
	assert.match(s.data.notes, /Advantage\+ audience on/);
	assert.equal(a.data.headline, "Book and get paid");
	assert.equal(a.status, "live");
	assert.ok(!r.nodes.some((n) => /Old promo|Paused test/.test(n.data.name)), "paused campaigns and ads stay out");
	assert.ok(fake.calls.filter((x) => x.path.includes("/tools/execute/")).every((x) => /LIST|GET|READ|SEARCH/.test(x.path)), "only read tools");
	assert.deepEqual(fake.calls.find((x) => x.path.endsWith("METAADS_LIST_CAMPAIGNS")).body.arguments.effective_status, ["ACTIVE"], "asks Meta for active campaigns only");
	assert.ok(fake.calls.every((x) => x.key === "k"));
	const plan = newPlan("Imported");
	plan.nodes = r.nodes;
	assert.deepEqual(normalize(plan).errors, []);
});

test("connect: Google reads campaigns, keywords with match types, negatives, RSAs and last-30-day results", async () => {
	const fake = fakeComposio();
	const svc = adAccounts(composio({ apiKey: "k", fetch: fake.fetch }), "paid-media-planner");
	await svc.connect("google");
	const [acct] = await svc.accounts("google");
	assert.match(acct.name, /Durable \(908-565-8195\)/);
	const r = await svc.import("google", acct);
	const [c, s, a] = r.nodes;
	assert.equal(c.data.campaignType, "SEARCH");
	assert.equal(c.data.bidStrategy, "MAXIMIZE_CONVERSIONS");
	assert.equal(c.data.bidAmount, 140);
	assert.match(c.data.notes, /Live budget: CAD 400\/day[\s\S]*Last 30 days: 23291\.64 spend, 10,240 clicks, 181\.2 conversions/);
	assert.deepEqual(s.data.targeting, { keywords: ["[durable]"], negativeKeywords: ["durable goods"] });
	assert.deepEqual([a.data.format, a.data.headline, a.data.headline2, a.data.extraHeadlines, a.data.description, a.data.extraDescriptions, a.data.url], ["search", "Durable AI Website Builder", "Official Site", ["Build in 30 Seconds"], "Website, bookings and payments.", ["Start free."], "https://durable.com/"]);
	const gaql = fake.calls.filter((x) => x.path.endsWith("GOOGLEADS_SEARCH_STREAM_GAQL")).map((x) => x.body.arguments.query).filter((q) => !q.includes("FROM customer"));
	assert.ok(gaql.length === 5 && gaql.every((q) => q.includes("campaign.status = 'ENABLED'") && !q.includes("PAUSED")), "Google reads enabled items only");
	const plan = newPlan("G");
	plan.nodes = r.nodes;
	assert.deepEqual(normalize(plan).errors, []);
});

test("connect: TikTok maps ENABLE/DISABLE and imports only enabled items", async () => {
	const fake = fakeComposio();
	const svc = adAccounts(composio({ apiKey: "k", fetch: fake.fetch }), "paid-media-planner");
	await svc.connect("tiktok");
	const r = await svc.import("tiktok", (await svc.accounts("tiktok"))[0]);
	assert.deepEqual(r.nodes.map((n) => [n.type, n.status]), [["campaign", "live"], ["adset", "live"]], "the disabled ad stays out");
	assert.deepEqual(r.nodes[1].data.ageBuckets, ["AGE_25_34"]);
});

test("connect: every network has a toolkit; no key means not configured, not an error", async () => {
	for (const k of connectable()) assert.ok(CONNECTORS[k].toolkit && CONNECTORS[k].read);
	assert.throws(() => composio({}), /COMPOSIO_API_KEY/);
	const home = mkdtempSync(join(tmpdir(), "pmp-"));
	setHome(home);
	const saved = process.env.COMPOSIO_API_KEY;
	delete process.env.COMPOSIO_API_KEY;
	const server = serve(0);
	await new Promise((ok) => server.once("listening", ok));
	try {
		const base = `http://127.0.0.1:${server.address().port}`;
		const st = await fetch(`${base}/api/connect`).then((r) => r.json());
		assert.equal(st.configured, false);
		assert.equal(st.networks.length, 7);
		const r = await fetch(`${base}/api/connect/meta/accounts`);
		assert.equal(r.status, 501);
	} finally {
		server.close();
		if (saved) process.env.COMPOSIO_API_KEY = saved;
		rmSync(home, { recursive: true, force: true });
	}
});

test("connect: toNodes records lifetime budgets without counting them as monthly spend", () => {
	const r = toNodes("meta", { id: "act_1", name: "A" }, { campaigns: [{ id: "c", name: "Launch", status: "ACTIVE", objective: "OUTCOME_AWARENESS", budget: 5000, budgetType: "lifetime", adsets: [] }] }, { currency: "USD" });
	assert.equal(r.monthly, 0);
	assert.match(r.nodes[0].data.notes, /USD 5,000 lifetime/);
});
