// Google Ads Editor import: the plan's Google campaigns as the CSV files Google Ads Editor reads (Account → Import →
// From file), plus a README with the import steps and what Editor can't take from a file. Pure: returns
// [{ name, data }], and the server zips them with tools/xlsx.mjs.
// Column names follow Editor's own CSV export (support.google.com/google-ads/editor/answer/56368). Editor matches
// columns by header and reports anything it can't map on the Review step, before anything is posted.
import { PLATFORMS, childrenOf, googleTypes } from "./model.mjs";

const TYPE = { SEARCH: "Search", PERFORMANCE_MAX: "Performance Max", DEMAND_GEN: "Demand Gen", DISPLAY: "Display", VIDEO: "Video" };
const NETWORK = { search: "Google search", search_partners: "Search Partners", display: "Display Network" };
const BID = { MAXIMIZE_CONVERSIONS: "Maximize conversions", MAXIMIZE_CONVERSION_VALUE: "Maximize conversion value", TARGET_SPEND: "Maximize clicks", TARGET_IMPRESSION_SHARE: "Target impression share", MANUAL_CPC: "Manual CPC", TARGET_CPA: "Target CPA", TARGET_CPM: "Target CPM", TARGET_CPV: "Target CPV" };
const LANG = { english: "en", french: "fr", spanish: "es", german: "de", italian: "it", portuguese: "pt", dutch: "nl", japanese: "ja", chinese: "zh_CN", korean: "ko", arabic: "ar", hindi: "hi", polish: "pl", swedish: "sv", danish: "da", norwegian: "no", finnish: "fi", turkish: "tr", russian: "ru" };
const LIMIT = PLATFORMS.google.limits;

const cell = (v) => {
	const s = v == null ? "" : String(v);
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// UTF-8 with a byte-order mark, so Editor and Excel read accents and en dashes correctly.
const csv = (rows) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
const table = (cols, rows) => [cols, ...rows.map((r) => cols.map((c) => r[c] ?? ""))];

// "[exact]", "\"phrase\"" or broad, as the planner stores keywords.
export function parseKeyword(raw) {
	const s = String(raw ?? "").trim();
	if (/^\[.*\]$/.test(s)) return { text: s.slice(1, -1).trim(), match: "Exact" };
	if (/^".*"$/.test(s)) return { text: s.slice(1, -1).trim(), match: "Phrase" };
	return { text: s.replace(/^\+/, "").trim(), match: "Broad" };
}
const location = (l) => String(l).replace(/\s*\((presence|interest|presence or interest)\)\s*$/i, "").trim();
const language = (l) => LANG[String(l).trim().toLowerCase()] ?? String(l).trim();
const audience = (a) => String(a).replace(/^(observation|targeting)\s*:\s*/i, "").trim();
const money = (n) => (Number(n) > 0 ? Number(Number(n).toFixed(2)) : "");

export function googleAdsEditorFiles(plan) {
	const camps = plan.nodes.filter((n) => n.type === "campaign" && n.data.platforms.includes("google"));
	const currency = camps[0]?.data.budget.currency ?? plan.settings?.budget?.currency ?? "USD";
	const rows = { campaigns: [], locations: [], adGroups: [], keywords: [], negatives: [], rsas: [], audiences: [], manual: [] };
	const checks = [];
	for (const c of camps) {
		const d = c.data;
		const cname = d.name;
		const bid = BID[d.bidStrategy] ?? "";
		const amount = Number(d.bidAmount) > 0 ? Number(d.bidAmount) : "";
		rows.campaigns.push({
			Campaign: cname,
			"Campaign Type": TYPE[d.campaignType] ?? googleTypes().find((t) => t.id === d.campaignType)?.label ?? "Search",
			Networks: (d.networks.length ? d.networks : ["search"]).map((n) => NETWORK[n] ?? n).join(";"),
			Budget: money(d.budget.amount),
			"Budget type": "Daily",
			"Bid Strategy Type": bid,
			"Target CPA": ["MAXIMIZE_CONVERSIONS", "TARGET_CPA"].includes(d.bidStrategy) ? amount : "",
			"Target ROAS": d.bidStrategy === "MAXIMIZE_CONVERSION_VALUE" && amount ? `${amount}%` : "",
			Languages: d.languages.map(language).join(";"),
			"Start Date": d.schedule.start ?? "",
			"End Date": d.schedule.end ?? "",
			"Campaign Status": "Paused",
		});
		if (!d.locations.length) checks.push(`${cname}: no locations, so it would target every country.`);
		if (!(Number(d.budget.amount) > 0)) checks.push(`${cname}: no daily budget.`);
		if (!bid) checks.push(`${cname}: no bid strategy.`);
		for (const l of d.locations) rows.locations.push({ Campaign: cname, Location: location(l), Status: "Enabled" });
		const search = d.campaignType === "SEARCH" || !d.campaignType;
		for (const s of childrenOf(plan, c.id).filter((n) => n.type === "adset")) {
			const sd = s.data;
			const g = sd.name;
			rows.adGroups.push({ Campaign: cname, "Ad Group": g, "Ad Group Type": search ? "Standard" : "", "Max CPC": d.bidStrategy === "MANUAL_CPC" ? money(sd.bidAmount || d.bidAmount) : "", "Ad Group Status": "Enabled" });
			const kws = sd.targeting?.keywords ?? [];
			if (search && !kws.length) checks.push(`${cname} › ${g}: no keywords.`);
			for (const k of kws) {
				const { text, match } = parseKeyword(k);
				if (!text) continue;
				if (/[!@%^*()={}~`<>?\\|;]/.test(text)) checks.push(`${cname} › ${g}: keyword "${text}" has characters Google rejects.`);
				rows.keywords.push({ Campaign: cname, "Ad Group": g, Keyword: text, "Criterion Type": match, "Max CPC": "", "Final URL": "", Status: "Enabled" });
			}
			for (const k of sd.targeting?.negativeKeywords ?? []) {
				const { text, match } = parseKeyword(k);
				if (text) rows.negatives.push({ Campaign: cname, "Ad Group": g, Keyword: text, "Criterion Type": `Negative ${match}` });
			}
			for (const a of [...(sd.customAudiences ?? []), ...(sd.targeting?.audienceSegments ?? []), ...(sd.targeting?.customAudiences ?? [])])
				rows.audiences.push({ Campaign: cname, "Ad Group": g, Audience: audience(a), "Targeting setting": /^observation/i.test(a) ? "Observation" : "Targeting" });
			for (const a of sd.exclusions ?? []) rows.audiences.push({ Campaign: cname, "Ad Group": g, Audience: audience(a), "Targeting setting": "Exclusion" });
			for (const ad of childrenOf(plan, s.id).filter((n) => n.type === "ad")) {
				const ah = ad.data;
				const where = `${cname} › ${g} › ${ah.name}`;
				if (ah.format !== "search") {
					rows.manual.push({ Campaign: cname, "Ad Group": g, Ad: ah.name, Format: PLATFORMS.google.formats[ah.format]?.name ?? ah.format, Headlines: [ah.headline, ah.headline2, ...(ah.extraHeadlines ?? [])].filter(Boolean).join(" | "), Descriptions: [ah.description, ...(ah.extraDescriptions ?? [])].filter(Boolean).join(" | "), CTA: ah.cta, "Final URL": ah.url, Media: [...ah.media, ...ah.cards].map((m) => m?.name || m?.src).filter(Boolean).join(" | ") });
					continue;
				}
				const heads = [ah.headline, ah.headline2, ...(ah.extraHeadlines ?? [])].map((h) => String(h ?? "").trim()).filter(Boolean).slice(0, 15);
				const descs = [ah.description, ...(ah.extraDescriptions ?? [])].map((h) => String(h ?? "").trim()).filter(Boolean).slice(0, 4);
				if (heads.length < 3) checks.push(`${where}: ${heads.length} headlines (needs 3–15).`);
				if (descs.length < 2) checks.push(`${where}: ${descs.length} descriptions (needs 2–4).`);
				heads.forEach((h, i) => h.length > LIMIT.headline && checks.push(`${where}: headline ${i + 1} is ${h.length} characters (max ${LIMIT.headline}).`));
				descs.forEach((h, i) => h.length > LIMIT.description && checks.push(`${where}: description ${i + 1} is ${h.length} characters (max ${LIMIT.description}).`));
				for (const [k, v] of [["Path 1", ah.path1], ["Path 2", ah.path2]]) if (String(v ?? "").length > LIMIT.path1) checks.push(`${where}: ${k} is over ${LIMIT.path1} characters.`);
				if (!/^https?:\/\//.test(ah.url ?? "")) checks.push(`${where}: no final URL.`);
				if ([...heads, ...descs].some((t) => /\[confirm/i.test(t))) checks.push(`${where}: copy still has a [confirm] marker.`);
				const r = { Campaign: cname, "Ad Group": g, "Ad type": "Responsive search ad" };
				for (let i = 0; i < 15; i++) r[`Headline ${i + 1}`] = heads[i] ?? "";
				for (let i = 0; i < 4; i++) r[`Description ${i + 1}`] = descs[i] ?? "";
				Object.assign(r, { "Path 1": ah.path1 ?? "", "Path 2": ah.path2 ?? "", "Final URL": ah.url ?? "", Status: "Enabled" });
				rows.rsas.push(r);
			}
		}
	}

	const COLS = {
		campaigns: ["Campaign", "Campaign Type", "Networks", "Budget", "Budget type", "Bid Strategy Type", "Target CPA", "Target ROAS", "Languages", "Start Date", "End Date", "Campaign Status"],
		locations: ["Campaign", "Location", "Status"],
		adGroups: ["Campaign", "Ad Group", "Ad Group Type", "Max CPC", "Ad Group Status"],
		keywords: ["Campaign", "Ad Group", "Keyword", "Criterion Type", "Max CPC", "Final URL", "Status"],
		negatives: ["Campaign", "Ad Group", "Keyword", "Criterion Type"],
		rsas: ["Campaign", "Ad Group", "Ad type", ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`), ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`), "Path 1", "Path 2", "Final URL", "Status"],
		audiences: ["Campaign", "Ad Group", "Audience", "Targeting setting"],
		manual: ["Campaign", "Ad Group", "Ad", "Format", "Headlines", "Descriptions", "CTA", "Final URL", "Media"],
	};
	// One file with every row type, for a single import. Editor reads each row by the columns it fills.
	const allCols = [...new Set(["campaigns", "locations", "adGroups", "keywords", "negatives", "rsas"].flatMap((k) => COLS[k]))];
	const all = ["campaigns", "locations", "adGroups", "keywords", "negatives", "rsas"].flatMap((k) => rows[k]);
	const files = [
		{ name: "00-import-everything.csv", data: csv(table(allCols, all)) },
		{ name: "01-campaigns.csv", data: csv(table(COLS.campaigns, rows.campaigns)) },
		{ name: "02-locations.csv", data: csv(table(COLS.locations, rows.locations)) },
		{ name: "03-ad-groups.csv", data: csv(table(COLS.adGroups, rows.adGroups)) },
		{ name: "04-keywords.csv", data: csv(table(COLS.keywords, rows.keywords)) },
		{ name: "05-negative-keywords.csv", data: csv(table(COLS.negatives, rows.negatives)) },
		{ name: "06-responsive-search-ads.csv", data: csv(table(COLS.rsas, rows.rsas)) },
	];
	if (rows.audiences.length) files.push({ name: "07-audiences.csv", data: csv(table(COLS.audiences, rows.audiences)) });
	if (rows.manual.length) files.push({ name: "08-non-search-ads-build-manually.csv", data: csv(table(COLS.manual, rows.manual)) });
	const count = (k) => rows[k].length;
	const readme = `# ${plan.name}: Google Ads Editor import

Exported ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC from the paid media planner.
${count("campaigns")} campaigns, ${count("adGroups")} ad groups, ${count("keywords")} keywords, ${count("negatives")} negative keywords, ${count("rsas")} responsive search ads.
Budgets and bids are in ${currency}: the account's own currency must match, because Editor doesn't convert.

## Import
1. In Google Ads Editor, download the account (Account → Download) so Editor has its current state.
2. Account → Import → From file, and pick \`00-import-everything.csv\`.
   To bring in one level at a time instead, import 01 to 06 in order (campaigns before ad groups, ad groups before keywords and ads).
3. Editor shows what it will add on the Review step. Fix anything it flags, then Finish and review.
4. Campaigns come in **Paused**. Check them in Editor, then Post. Enable them on their start dates.

## Not in the files: set these in Editor or Google Ads
- **Location options**: Editor sets countries from \`02-locations.csv\`. Set "Presence: people in or regularly in your locations" under the campaign's location options.
- **Conversion goals**: choose the campaign's conversion goals in Google Ads (campaign settings → Goals). Editor can't set them.
- **Portfolio bid strategies**: if campaigns should share one (the plan's notes say so), create it in Tools → Bid strategies and assign it after import.
${rows.audiences.length ? "- **Audiences** (`07-audiences.csv`): the lists must already exist in Audience manager under these names. Add them in Editor on each ad group (Keywords and targeting → Audiences), with the targeting setting shown.\n" : ""}- **Assets**: sitelinks, callouts, structured snippets, images and the business logo aren't in the plan.
${rows.manual.length ? "- **Non-search ads** (`08-non-search-ads-build-manually.csv`): Display, YouTube and Performance Max need image and video assets, so build those in Google Ads.\n" : ""}
## Check before import
${checks.length ? checks.map((c) => `- ${c}`).join("\n") : "- Nothing flagged: every responsive search ad has 3–15 headlines and 2–4 descriptions within limits, and a final URL."}
`;
	files.push({ name: "README.md", data: readme });
	return { files, checks, counts: Object.fromEntries(Object.keys(rows).map((k) => [k, count(k)])) };
}
