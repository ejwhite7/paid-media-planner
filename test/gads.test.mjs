import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newPlan, newNode, normalize } from "../studio/model.mjs";
import { googleAdsEditorFiles, parseKeyword } from "../studio/gads.mjs";
import { serve, setHome } from "../tools/canvas.mjs";

function googlePlan() {
	const plan = newPlan("Search test");
	plan.nodes = [];
	const c = newNode("campaign", { platform: "google", data: { label: "Brand", funnel: "bof", campaignType: "SEARCH", networks: ["search"], locations: ["United States (presence)"], languages: ["English"], bidStrategy: "MAXIMIZE_CONVERSIONS", bidAmount: 140, schedule: { start: "2026-10-15", end: "" } } });
	const s = newNode("adset", { parent: c.id, platform: "google", data: { label: "Core", customAudiences: ["Observation: Site visitors 30d"], targeting: { keywords: ["[durable]", '"durable ai"', "durable website"], negativeKeywords: ["durable goods", "[durable login]"] } } });
	const a = newNode("ad", { parent: s.id, platform: "google", data: { format: "search", headline: "Durable AI Website Builder", headline2: "Built for Service Businesses", extraHeadlines: ["Get Online in Minutes"], description: "Your website, bookings and payments in one place.", extraDescriptions: ["Answers leads, sends invoices, gets you found, for you."], path1: "ai", path2: "website", url: "https://durable.com/" } });
	plan.nodes.push(c, s, a);
	plan.settings.channels = { google: { monthly: 3000, cpa: 0 } };
	const { plan: p, errors } = normalize(plan);
	assert.deepEqual(errors, []);
	return p;
}

test("keywords parse by match type", () => {
	assert.deepEqual(parseKeyword("[durable]"), { text: "durable", match: "Exact" });
	assert.deepEqual(parseKeyword('"durable ai"'), { text: "durable ai", match: "Phrase" });
	assert.deepEqual(parseKeyword("durable website"), { text: "durable website", match: "Broad" });
});

test("Google Ads Editor files: campaigns, keywords, negatives and RSAs with Editor's columns", () => {
	const { files, counts, checks } = googleAdsEditorFiles(googlePlan());
	const f = Object.fromEntries(files.map((x) => [x.name, x.data]));
	assert.ok(f["00-import-everything.csv"] && f["README.md"]);
	assert.equal(counts.campaigns, 1);
	assert.equal(counts.keywords, 3);
	assert.equal(counts.negatives, 2);
	assert.equal(counts.rsas, 1);
	assert.match(f["01-campaigns.csv"], /^﻿Campaign,Campaign Type,Networks,Budget,/);
	assert.match(f["01-campaigns.csv"], /,Search,Google search,\d+(\.\d+)?,Daily,Maximize conversions,140,,en,2026-10-15,,Paused/);
	assert.match(f["02-locations.csv"], /,United States,Enabled/);
	assert.match(f["04-keywords.csv"], /,durable,Exact,/);
	assert.match(f["04-keywords.csv"], /,durable ai,Phrase,/);
	assert.match(f["05-negative-keywords.csv"], /,durable goods,Negative Broad/);
	assert.match(f["05-negative-keywords.csv"], /,durable login,Negative Exact/);
	assert.match(f["06-responsive-search-ads.csv"], /Responsive search ad,Durable AI Website Builder,Built for Service Businesses,Get Online in Minutes/);
	assert.match(f["07-audiences.csv"], /Site visitors 30d,Observation/);
	assert.deepEqual(checks, []);
});

test("Google Ads Editor files flag ads Editor would reject", () => {
	const plan = googlePlan();
	const ad = plan.nodes.find((n) => n.type === "ad");
	ad.data.extraHeadlines = [];
	ad.data.headline2 = "";
	ad.data.headline = "A headline that is far too long for Google";
	ad.data.url = "";
	const { checks } = googleAdsEditorFiles(plan);
	assert.ok(checks.some((c) => /1 headlines/.test(c)));
	assert.ok(checks.some((c) => /headline 1 is \d+ characters/.test(c)));
	assert.ok(checks.some((c) => /no final URL/.test(c)));
});

test("server: Google Ads Editor zip, and a 404 for a plan without Google campaigns", async () => {
	const home = mkdtempSync(join(tmpdir(), "pmp-"));
	setHome(home);
	const server = serve(0);
	await new Promise((ok) => server.once("listening", ok));
	const base = `http://127.0.0.1:${server.address().port}`;
	try {
		const { plan, version } = await fetch(`${base}/api/plans`, { method: "POST", body: JSON.stringify({ name: "G" }) }).then((r) => r.json());
		assert.equal((await fetch(`${base}/api/plans/${plan.id}/google-ads-editor.zip`)).status, 404);
		const g = { ...googlePlan(), id: plan.id };
		await fetch(`${base}/api/plans/${plan.id}`, { method: "PUT", headers: { "x-base-version": version }, body: JSON.stringify(g) });
		const z = await fetch(`${base}/api/plans/${plan.id}/google-ads-editor.zip`);
		assert.equal(z.status, 200);
		assert.equal(z.headers.get("content-type"), "application/zip");
		assert.match(z.headers.get("content-disposition"), /google-ads-editor\.zip/);
		const buf = Buffer.from(await z.arrayBuffer());
		assert.equal(buf.readUInt32LE(0), 0x04034b50);
		assert.ok(buf.includes("06-responsive-search-ads.csv"));
	} finally {
		server.close();
		rmSync(home, { recursive: true, force: true });
	}
});
