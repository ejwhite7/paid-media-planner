// Ad accounts through Composio: connect a network's ad account, list its accounts, and read active campaigns, ad sets
// and ads into planner nodes. Read-only: only list and search tools are called, never a create, update or delete.
// The servers (tools/canvas.mjs with the plugin's composio_api_key setting, the hosted planner) call it with a Composio API key; the browser only sees
// the results. Tool slugs and response shapes are Composio's (docs.composio.dev, toolkits metaads, googleads,
// tiktok_ads, linkedin_ads, reddit_ads, pinterest_ads, snapchat). X has no Composio ads toolkit.
import { CATALOG, PLATFORMS, defaultNative, newNode } from "./model.mjs";

const API = "https://backend.composio.dev/api/v3";
const MAX_PAGES = 10;

// ---------- the Composio REST client ----------
export function composio({ apiKey, fetch: f = globalThis.fetch, base = API } = {}) {
	if (!apiKey) throw Object.assign(new Error("Composio isn't set up: the planner has no Composio API key."), { status: 501 });
	const call = async (method, path, body) => {
		const r = await f(`${base}${path}`, { method, headers: { "x-api-key": apiKey, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
		const j = await r.json().catch(() => ({}));
		if (!r.ok) throw Object.assign(new Error(j?.error?.message ?? j?.message ?? `Composio ${r.status}`), { status: r.status >= 500 ? 502 : r.status === 401 ? 502 : r.status });
		return j;
	};
	const authConfig = async (toolkit) => {
		const list = await call("GET", `/auth_configs?toolkit_slug=${encodeURIComponent(toolkit)}&limit=50`);
		const found = (list.items ?? []).find((a) => a.status !== "DISABLED");
		if (found) return found.id;
		const made = await call("POST", "/auth_configs", { toolkit: { slug: toolkit }, auth_config: { type: "use_composio_managed_auth" } });
		return made.auth_config?.id ?? made.id;
	};
	return {
		// Active connections for a user, by toolkit.
		async connections(userId) {
			const q = new URLSearchParams({ user_ids: userId, statuses: "ACTIVE", limit: "100" });
			const list = await call("GET", `/connected_accounts?${q}`);
			return (list.items ?? []).map((a) => ({ id: a.id, toolkit: a.toolkit?.slug ?? a.toolkit_slug ?? a.appName, status: a.status, createdAt: a.created_at }));
		},
		// A sign-in link for the network (opens the network's own OAuth consent), valid for 10 minutes.
		async link(toolkit, userId, callbackUrl) {
			const r = await call("POST", "/connected_accounts/link", { auth_config_id: await authConfig(toolkit), user_id: userId, ...(callbackUrl ? { callback_url: callbackUrl } : {}) });
			return { url: r.redirect_url ?? r.redirectUrl, id: r.connected_account_id ?? r.id };
		},
		async disconnect(id) {
			await call("DELETE", `/connected_accounts/${encodeURIComponent(id)}`);
		},
		// Runs one read tool; returns its data or throws with the tool's own error.
		async run(slug, args, { userId, connectedAccountId }) {
			const r = await call("POST", `/tools/execute/${slug}`, { user_id: userId, connected_account_id: connectedAccountId, arguments: args });
			if (r.successful === false) throw Object.assign(new Error(`${slug}: ${r.error ?? "failed"}`), { status: 502 });
			return r.data ?? {};
		},
	};
}

// ---------- helpers ----------
const arr = (v) => (Array.isArray(v) ? v : []);
const groupBy = (list, key) => {
	const m = new Map();
	for (const x of list) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
	return m;
};
const num = (v) => (v == null || v === "" ? null : Number(v));
// GAQL rows come back camelCase from the REST API; accept snake_case too.
const g = (row, ...path) => path.reduce((o, k) => (o == null ? undefined : o[k] ?? o[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())]), row);
const day = (v) => (v == null || v === "" ? "" : /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : Number.isFinite(Number(v)) ? new Date(Number(v) > 1e12 ? Number(v) : Number(v) * 1000).toISOString().slice(0, 10) : "");
async function pages(fetchPage) {
	const all = [];
	let cursor;
	for (let i = 0; i < MAX_PAGES; i++) {
		const { items, next } = await fetchPage(cursor);
		all.push(...items);
		if (!next || next === cursor) return { items: all, truncated: false };
		cursor = next;
	}
	return { items: all, truncated: true };
}
const tokenFrom = (url) => (url ? (new URL(url, "https://x").searchParams.get("page.token") ?? new URL(url, "https://x").searchParams.get("cursor")) : null);

// The planner's objective for a network's raw objective code: the catalog id when it matches, else the nearest
// generic objective's default.
function objectiveFor(net, raw) {
	const s = String(raw ?? "").toUpperCase();
	const hit = (CATALOG[net]?.objectives ?? []).find((o) => o.id === s);
	if (hit) return { objective: hit.generic, nativeObjective: hit.id };
	const generic = /SALE|CONVERSION|PURCHASE|SHOP|CATALOG|PRODUCT|PERFORMANCE_MAX|WEB_CONVERSION/.test(s) ? "sales" : /LEAD/.test(s) ? "leads" : /APP/.test(s) ? "app" : /VIDEO|VIEW/.test(s) ? "video_views" : /ENGAGE|INTERACT/.test(s) ? "engagement" : /TRAFFIC|CLICK|VISIT|SEARCH|CONSIDERATION/.test(s) ? "traffic" : /AWARE|REACH|BRAND|DISPLAY/.test(s) ? "awareness" : "traffic";
	return { objective: generic, nativeObjective: defaultNative(net, generic)?.id ?? "" };
}
const live = (s) => /^(ACTIVE|ENABLED|ENABLE|STATUS_DELIVERY_OK|DELIVERING|RUNNING)$/i.test(String(s ?? ""));

// ---------- per network: accounts and the account's campaign tree ----------
// read() returns { campaigns: [{ id, name, status, objective, budget, start, end, notes, adsets: [{ id, name, status,
// notes, data, ads: [{ id, name, status, data }] }] }], truncated: [] }.
const GAQL = (q) => q.replace(/\s+/g, " ").trim();
export const CONNECTORS = {
	meta: {
		toolkit: "metaads",
		async accounts(run) {
			const d = await run("METAADS_GET_AD_ACCOUNTS", { limit: 200, fields: "id,account_id,name,currency,account_status" });
			return arr(d.data).map((a) => ({ id: a.id, name: a.name || a.id, currency: a.currency ?? "" }));
		},
		async read(run, account) {
			const truncated = [];
			const camps = await pages(async (after) => {
				const d = await run("METAADS_LIST_CAMPAIGNS", { ad_account_id: account, limit: 100, after, effective_status: ["ACTIVE"], fields: ["id", "name", "objective", "status", "effective_status", "daily_budget", "lifetime_budget", "bid_strategy", "start_time", "stop_time", "special_ad_categories"] });
				return { items: arr(d.data), next: d.paging?.cursors?.after && d.paging?.next ? d.paging.cursors.after : null };
			});
			if (camps.truncated) truncated.push("campaigns");
			const sets = await run("METAADS_READ_ADSETS", { ad_account_id: account, limit: 1000, effective_status: ["ACTIVE"], fields: ["id", "name", "status", "effective_status", "campaign_id", "daily_budget", "lifetime_budget", "optimization_goal", "destination_type", "targeting", "bid_strategy", "bid_amount"] });
			const ads = await run("METAADS_LIST_ADS", { ad_account_id: account, limit: 100, fields: "id,name,status,effective_status,adset_id,campaign_id,creative{id,title,body,object_type,call_to_action_type,link_url}" });
			if (arr(ads.data).length >= 100) truncated.push("ads (first 100)");
			const adsBySet = groupBy(arr(ads.data), (a) => a.adset_id);
			const setsByCamp = groupBy(arr(sets.data), (s) => s.campaign_id ?? s.campaign?.id);
			const cur = (x) => (x ? Number(x) / 100 : null);
			return {
				truncated,
				campaigns: camps.items.map((c) => ({
					id: c.id, name: c.name, status: c.effective_status ?? c.status, objective: c.objective, budget: cur(c.daily_budget) ?? cur(c.lifetime_budget), budgetType: c.daily_budget ? "daily" : c.lifetime_budget ? "lifetime" : "", start: day(c.start_time), end: day(c.stop_time),
					special: arr(c.special_ad_categories).filter((x) => x !== "NONE")[0],
					adsets: arr(setsByCamp.get(c.id)).map((s) => {
						const t = s.targeting ?? {};
						const geo = t.geo_locations ?? {};
						return {
							id: s.id, name: s.name, status: s.effective_status ?? s.status, budget: cur(s.daily_budget) ?? cur(s.lifetime_budget),
							data: {
								locations: [...arr(geo.countries), ...arr(geo.regions).map((r) => r.name), ...arr(geo.cities).map((r) => r.name)].filter(Boolean),
								ageMin: num(t.age_min) ?? 18, ageMax: num(t.age_max) ?? 65,
								genders: arr(t.genders).length === 1 ? (t.genders[0] === 1 ? "male" : "female") : "all",
								interests: arr(t.flexible_spec).flatMap((f) => arr(f.interests).map((i) => i.name)).concat(arr(t.interests).map((i) => i.name)).filter(Boolean),
								customAudiences: arr(t.custom_audiences).map((a) => a.name || a.id),
								exclusions: arr(t.excluded_custom_audiences).map((a) => a.name || a.id),
								optimization: s.optimization_goal ?? "",
								placements: arr(t.publisher_platforms).length ? "manual" : "automatic",
							},
							notes: [t.targeting_automation?.advantage_audience ? "Advantage+ audience on." : "", s.destination_type ? `Conversion location: ${s.destination_type}.` : ""].filter(Boolean).join(" "),
							ads: arr(adsBySet.get(s.id)).map((a) => ({ id: a.id, name: a.name, status: a.effective_status ?? a.status, data: { primaryText: a.creative?.body ?? "", headline: a.creative?.title ?? "", url: a.creative?.link_url ?? "", notes: a.creative?.object_type ? `Creative type: ${a.creative.object_type}.` : "" } })),
						};
					}),
				})),
			};
		},
	},
	google: {
		toolkit: "googleads",
		async accounts(run) {
			const d = await run("GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS", {});
			const ids = arr(d.resourceNames ?? d.resource_names).map((r) => String(r).split("/").pop());
			const out = [];
			for (const id of ids.slice(0, 50)) {
				try {
					const r = await run("GOOGLEADS_SEARCH_STREAM_GAQL", { customer_id: id, query: "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer" });
					const c = g(arr(r.results)[0] ?? {}, "customer") ?? {};
					out.push({ id, name: `${c.descriptiveName ?? c.descriptive_name ?? id} (${id.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")})${c.manager ? " · manager" : ""}`, currency: c.currencyCode ?? c.currency_code ?? "" });
				} catch {
					out.push({ id, name: id, currency: "" });
				}
			}
			return out;
		},
		async read(run, customer) {
			const q = (query) => run("GOOGLEADS_SEARCH_STREAM_GAQL", { customer_id: customer, query: GAQL(query) }).then((r) => arr(r.results));
			const [camps, perf, groups, kws, ads] = await Promise.all([
				q(`SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.target_cpa.target_cpa_micros, campaign.maximize_conversions.target_cpa_micros, campaign_budget.amount_micros, campaign.start_date, campaign.end_date FROM campaign WHERE campaign.status = 'ENABLED'`),
				q(`SELECT campaign.id, metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_30_DAYS`),
				q(`SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status FROM ad_group WHERE ad_group.status = 'ENABLED' AND campaign.status = 'ENABLED'`),
				q(`SELECT ad_group.id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.negative FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status = 'ENABLED' AND campaign.status = 'ENABLED' LIMIT 5000`),
				q(`SELECT ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2 FROM ad_group_ad WHERE ad_group_ad.status = 'ENABLED' AND campaign.status = 'ENABLED' LIMIT 2000`),
			]);
			const m = (v) => (v == null ? null : Number(v) / 1e6);
			const perfBy = new Map();
			for (const r of perf) {
				const id = String(g(r, "campaign", "id"));
				const p = perfBy.get(id) ?? { cost: 0, clicks: 0, conv: 0, value: 0 };
				p.cost += m(g(r, "metrics", "cost_micros")) ?? 0;
				p.clicks += Number(g(r, "metrics", "clicks") ?? 0);
				p.conv += Number(g(r, "metrics", "conversions") ?? 0);
				p.value += Number(g(r, "metrics", "conversions_value") ?? 0);
				perfBy.set(id, p);
			}
			const fmt = (k) => ({ EXACT: (t) => `[${t}]`, PHRASE: (t) => `"${t}"`, BROAD: (t) => t })[k] ?? ((t) => t);
			const kwBy = groupBy(kws, (r) => String(g(r, "ad_group", "id")));
			const adsBy = groupBy(ads, (r) => String(g(r, "ad_group", "id")));
			const groupsBy = groupBy(groups, (r) => String(g(r, "campaign", "id")));
			return {
				truncated: [kws.length >= 5000 ? "keywords (first 5,000)" : "", ads.length >= 2000 ? "ads (first 2,000)" : ""].filter(Boolean),
				campaigns: camps.map((r) => {
					const id = String(g(r, "campaign", "id"));
					const p = perfBy.get(id);
					const type = g(r, "campaign", "advertising_channel_type");
					return {
						id, name: g(r, "campaign", "name"), status: g(r, "campaign", "status"), objective: type,
						campaignType: ["SEARCH", "PERFORMANCE_MAX", "DEMAND_GEN", "DISPLAY", "VIDEO"].includes(type) ? type : "SEARCH",
						bidStrategy: g(r, "campaign", "bidding_strategy_type"), bidAmount: m(g(r, "campaign", "target_cpa", "target_cpa_micros") ?? g(r, "campaign", "maximize_conversions", "target_cpa_micros")),
						budget: m(g(r, "campaign_budget", "amount_micros")), budgetType: "daily", start: day(g(r, "campaign", "start_date")), end: day(g(r, "campaign", "end_date")),
						notes: p ? `Last 30 days: ${p.cost.toFixed(2)} spend, ${p.clicks.toLocaleString()} clicks, ${p.conv.toFixed(1)} conversions${p.value ? `, ${p.value.toFixed(2)} conversion value` : ""} (account currency).` : "",
						adsets: arr(groupsBy.get(id)).map((ag) => {
							const gid = String(g(ag, "ad_group", "id"));
							const k = arr(kwBy.get(gid));
							return {
								id: gid, name: g(ag, "ad_group", "name"), status: g(ag, "ad_group", "status"),
								data: { targeting: { keywords: k.filter((x) => !g(x, "ad_group_criterion", "negative")).map((x) => fmt(g(x, "ad_group_criterion", "keyword", "match_type"))(g(x, "ad_group_criterion", "keyword", "text"))), negativeKeywords: k.filter((x) => g(x, "ad_group_criterion", "negative")).map((x) => fmt(g(x, "ad_group_criterion", "keyword", "match_type"))(g(x, "ad_group_criterion", "keyword", "text"))) } },
								ads: arr(adsBy.get(gid)).map((a) => {
									const rsa = g(a, "ad_group_ad", "ad", "responsive_search_ad") ?? {};
									const h = arr(rsa.headlines).map((x) => x.text).filter(Boolean);
									const ds = arr(rsa.descriptions).map((x) => x.text).filter(Boolean);
									return { id: String(g(a, "ad_group_ad", "ad", "id")), name: g(a, "ad_group_ad", "ad", "name") || `${g(a, "ad_group_ad", "ad", "type") ?? "Ad"} ${g(a, "ad_group_ad", "ad", "id")}`, status: g(a, "ad_group_ad", "status"), data: { format: h.length ? "search" : "display", headline: h[0] ?? "", headline2: h[1] ?? "", extraHeadlines: h.slice(2, 15), description: ds[0] ?? "", extraDescriptions: ds.slice(1, 4), path1: rsa.path1 ?? "", path2: rsa.path2 ?? "", url: arr(g(a, "ad_group_ad", "ad", "final_urls"))[0] ?? "" } };
								}),
							};
						}),
					};
				}),
			};
		},
	},
	tiktok: {
		toolkit: "tiktok_ads",
		async accounts(run) {
			const d = await run("TIKTOK_ADS_GET_ADVERTISER_ACCOUNTS", {});
			return arr(d.advertiser_accounts).map((a) => ({ id: a.advertiser_id, name: a.name || a.advertiser_id, currency: a.currency ?? "" }));
		},
		async read(run, advertiser) {
			const list = (slug, key, extra = {}) =>
				pages(async (cursor) => {
					const d = await run(slug, { advertiser_id: advertiser, page_size: 1000, ...(cursor ? { next_cursor: cursor } : {}), ...extra });
					return { items: arr(d[key]), next: d.has_more ? d.next_cursor : null };
				});
			const [camps, groups, ads] = await Promise.all([list("TIKTOK_ADS_LIST_CAMPAIGNS", "campaigns", { primary_status: "STATUS_NOT_DELETE" }), list("TIKTOK_ADS_LIST_AD_GROUPS", "ad_groups"), list("TIKTOK_ADS_LIST_ADS", "ads")]);
			const gBy = groupBy(groups.items, (x) => x.campaign_id);
			const aBy = groupBy(ads.items, (x) => x.adgroup_id);
			return {
				truncated: [camps, groups, ads].some((x) => x.truncated) ? ["some pages"] : [],
				campaigns: camps.items.map((c) => ({
					id: c.campaign_id, name: c.campaign_name, status: c.operation_status === "ENABLE" ? "ACTIVE" : c.operation_status, objective: c.objective_type, budget: c.budget_mode === "BUDGET_MODE_INFINITE" ? null : num(c.budget), budgetType: /DAY/.test(c.budget_mode ?? "") ? "daily" : "lifetime",
					adsets: arr(gBy.get(c.campaign_id)).map((s) => ({
						id: s.adgroup_id, name: s.adgroup_name, status: s.operation_status === "ENABLE" ? "ACTIVE" : s.operation_status, budget: num(s.budget),
						data: { optimization: s.optimization_goal ?? "", ageBuckets: arr(s.age_groups), genders: /MALE$/.test(s.gender ?? "") ? (s.gender === "GENDER_MALE" ? "male" : "female") : "all", placements: arr(s.placements).length ? "manual" : "automatic" },
						notes: [arr(s.location_ids).length ? `Location ids: ${s.location_ids.join(", ")}.` : "", arr(s.interest_category_ids).length ? `Interest category ids: ${s.interest_category_ids.join(", ")}.` : ""].filter(Boolean).join(" "),
						ads: arr(aBy.get(s.adgroup_id)).map((a) => ({ id: a.ad_id, name: a.ad_name, status: a.operation_status === "ENABLE" ? "ACTIVE" : a.operation_status, data: { notes: a.ad_format ? `Format: ${a.ad_format}.` : "" } })),
					})),
				})),
			};
		},
	},
	linkedin: {
		toolkit: "linkedin_ads",
		async accounts(run) {
			const d = await run("LINKEDIN_ADS_SEARCH_AD_ACCOUNTS", { status: ["ACTIVE"], page_size: 1000 });
			return arr(d.elements).map((a) => ({ id: String(a.id), name: a.name || String(a.id), currency: a.currency ?? "" }));
		},
		async read(run, account) {
			const camps = await pages(async (token) => {
				const d = await run("LINKEDIN_ADS_SEARCH_CAMPAIGNS", { adAccountId: Number(account), pageSize: 1000, search: "(status:(values:List(ACTIVE)))", ...(token ? { pageToken: token } : {}) });
				return { items: arr(d.elements), next: d.metadata?.nextPageToken };
			});
			const creatives = await pages(async (token) => {
				const d = await run("LINKEDIN_ADS_SEARCH_CREATIVES", { ad_account_id: String(account), page_size: 100, intended_statuses: ["ACTIVE"], ...(token ? { page_token: token } : {}) });
				return { items: arr(d.elements), next: d.metadata?.next_page_token };
			});
			const crBy = groupBy(creatives.items, (c) => String(c.campaign ?? "").split(":").pop());
			// LinkedIn's levels are campaign group → campaign → ad: each campaign group is a planner campaign.
			const byGroup = groupBy(camps.items, (c) => c.campaignGroup ?? "ungrouped");
			return {
				truncated: camps.truncated || creatives.truncated ? ["some pages"] : [],
				campaigns: [...byGroup].map(([grp, cs]) => ({
					id: String(grp).split(":").pop(), name: grp === "ungrouped" ? "Campaigns without a group" : `Campaign group ${String(grp).split(":").pop()}`, status: cs.some((c) => live(c.status)) ? "ACTIVE" : "PAUSED", objective: cs[0]?.objectiveType,
					adsets: cs.map((c) => ({
						id: String(c.id), name: c.name, status: c.status, budget: num(c.dailyBudget?.amount),
						data: {}, notes: [c.format ? `Format: ${c.format}.` : "", c.costType ? `Bid: ${c.costType}${c.unitCost?.amount ? ` ${c.unitCost.amount} ${c.unitCost.currencyCode ?? ""}` : ""}.` : "", c.audienceExpansionEnabled ? "Audience expansion on." : ""].filter(Boolean).join(" "),
						ads: arr(crBy.get(String(c.id))).map((cr) => ({ id: String(cr.id).split(":").pop(), name: cr.name || `Creative ${String(cr.id).split(":").pop()}`, status: cr.intended_status, data: { notes: cr.content?.reference ? `Content: ${cr.content.reference}.` : "" } })),
					})),
				})),
			};
		},
	},
	reddit: {
		toolkit: "reddit_ads",
		async accounts() {
			throw Object.assign(new Error("Enter the Reddit ad account id (it starts with a2_ or t2_), from Reddit Ads → Account settings."), { status: 400, needsId: true });
		},
		async read(run, account) {
			const list = (slug) =>
				pages(async (token) => {
					const d = await run(slug, { ad_account_id: account, page_size: 100, ...(token ? { page_token: token } : {}) });
					return { items: arr(d.data), next: tokenFrom(d.pagination?.next_url) };
				});
			const [camps, groups, ads] = await Promise.all([list("REDDIT_ADS_LIST_CAMPAIGNS"), list("REDDIT_ADS_LIST_AD_GROUPS"), list("REDDIT_ADS_LIST_ADS")]);
			const gBy = groupBy(groups.items, (x) => x.campaign_id);
			const aBy = groupBy(ads.items, (x) => x.ad_group_id);
			const keep = (x) => !/ARCHIVED|DELETED/.test(x.configured_status ?? x.effective_status ?? "");
			return {
				truncated: [camps, groups, ads].some((x) => x.truncated) ? ["some pages"] : [],
				campaigns: camps.items.filter(keep).map((c) => ({
					id: c.id, name: c.name, status: c.effective_status ?? c.configured_status, objective: c.objective, special: arr(c.special_ad_categories).filter((x) => x !== "NONE")[0], start: day(c.start_time), end: day(c.end_time),
					adsets: arr(gBy.get(c.id)).filter(keep).map((s) => ({ id: s.id, name: s.name, status: s.effective_status ?? s.configured_status, data: { optimization: s.optimization_goal ?? "" }, notes: s.bid_strategy ? `Bid strategy: ${s.bid_strategy}.` : "", ads: arr(aBy.get(s.id)).filter(keep).map((a) => ({ id: a.id, name: a.name ?? `Ad ${a.id}`, status: a.effective_status ?? a.configured_status, data: { headline: a.headline ?? "", url: a.click_url ?? a.destination_url ?? "" } })) })),
				})),
			};
		},
	},
	pinterest: {
		toolkit: "pinterest_ads",
		async accounts(run) {
			const d = await run("PINTEREST_ADS_LIST_AD_ACCOUNTS", { page_size: 250 });
			return arr(d.items).map((a) => ({ id: a.id, name: a.name || a.id, currency: a.currency ?? "" }));
		},
		async read(run, account) {
			const list = (slug) =>
				pages(async (cursor) => {
					const d = await run(slug, { ad_account_id: account, page_size: 250, entity_statuses: ["ACTIVE"], ...(cursor ? { next_cursor: cursor } : {}) });
					return { items: arr(d.items), next: d.has_more ? d.next_cursor : null };
				});
			const [camps, groups, ads] = await Promise.all([list("PINTEREST_ADS_LIST_CAMPAIGNS"), list("PINTEREST_ADS_LIST_AD_GROUPS"), list("PINTEREST_ADS_LIST_ADS")]);
			const gBy = groupBy(groups.items, (x) => x.campaign_id);
			const aBy = groupBy(ads.items, (x) => x.ad_group_id);
			return {
				truncated: [camps, groups, ads].some((x) => x.truncated) ? ["some pages"] : [],
				campaigns: camps.items.map((c) => ({
					id: c.id, name: c.name, status: c.status, objective: c.objective_type, budget: c.daily_spend_cap ? c.daily_spend_cap / 1e6 : null, budgetType: c.daily_spend_cap ? "daily" : "", start: day(c.start_time), end: day(c.end_time),
					adsets: arr(gBy.get(c.id)).map((s) => ({ id: s.id, name: s.name, status: s.status, budget: s.budget_in_micro_currency ? s.budget_in_micro_currency / 1e6 : null, data: {}, notes: s.billable_event ? `Billable event: ${s.billable_event}.` : "", ads: arr(aBy.get(s.id)).map((a) => ({ id: a.id, name: a.name || `Pin ${a.pin_id}`, status: a.status, data: { url: a.destination_url ?? "", notes: `Pin ${a.pin_id}${a.creative_type ? `, ${a.creative_type}` : ""}.` } })) })),
				})),
			};
		},
	},
	snapchat: {
		toolkit: "snapchat",
		async accounts(run) {
			const d = await run("SNAPCHAT_LIST_ORGANIZATIONS", { with_ad_accounts: true });
			const out = [];
			for (const o of arr(d.organizations)) {
				const org = o.organization ?? o;
				const accts = arr(org.ad_accounts).length ? org.ad_accounts : arr((await run("SNAPCHAT_LIST_AD_ACCOUNTS", { organization_id: org.id }).catch(() => ({}))).adaccounts).map((x) => x.adaccount ?? x);
				for (const a of accts) out.push({ id: a.id, name: `${a.name ?? a.id}${org.name ? ` (${org.name})` : ""}`, currency: a.currency ?? "" });
			}
			return out;
		},
		async read(run, account) {
			const list = (slug, key, inner) =>
				pages(async (cursor) => {
					const d = await run(slug, { ad_account_id: account, limit: 1000, ...(cursor ? { cursor } : {}) });
					return { items: arr(d[key]).map((x) => x[inner] ?? x), next: d.paging?.has_next_page ? tokenFrom(d.paging.next_link) : null };
				});
			const [camps, squads, ads] = await Promise.all([list("SNAPCHAT_LIST_CAMPAIGNS", "campaigns", "campaign"), list("SNAPCHAT_GET_ADACCOUNTS_ADSQUADS", "adsquads", "adsquad"), list("SNAPCHAT_LIST_ADS_BY_ACCOUNT", "ads", "ad")]);
			const sBy = groupBy(squads.items, (x) => x.campaign_id);
			const aBy = groupBy(ads.items.filter((a) => !a.deleted), (x) => x.ad_squad_id);
			return {
				truncated: [camps, squads, ads].some((x) => x.truncated) ? ["some pages"] : [],
				campaigns: camps.items.filter((c) => !c.deleted).map((c) => ({
					id: c.id, name: c.name, status: c.status, objective: c.objective_v2_properties?.objective_v2_type ?? c.objective, budget: c.daily_budget_micro ? c.daily_budget_micro / 1e6 : null, budgetType: c.daily_budget_micro ? "daily" : "", start: day(c.start_time), end: day(c.end_time),
					adsets: arr(sBy.get(c.id)).map((s) => ({ id: s.id, name: s.name, status: s.status, budget: s.daily_budget_micro ? s.daily_budget_micro / 1e6 : null, data: { optimization: s.optimization_goal ?? "" }, notes: s.bid_strategy ? `Bid strategy: ${s.bid_strategy}.` : "", ads: arr(aBy.get(s.id)).map((a) => ({ id: a.id, name: a.name, status: a.status, data: { notes: a.type ? `Type: ${a.type}.` : "" } })) })),
				})),
			};
		},
	},
};
export const connectable = () => Object.keys(CONNECTORS).filter((k) => PLATFORMS[k]);

// ---------- into the plan ----------
// Only what's running comes in: active campaigns, and their active ad sets and ads. The reads above already ask each
// network for active items; this drops anything a network's filter let through.
// The account's tree as new planner nodes (fresh ids; the platform ids go in each node's notes so a re-import can be
// matched by hand). Budgets are derived from the channel budget, so the live budget is recorded in the notes and the
// account's monthly spend is offered as the channel budget.
export function toNodes(net, account, tree, { currency = "", today = new Date().toISOString().slice(0, 10) } = {}) {
	const nodes = [];
	const P = PLATFORMS[net];
	const money = (v, type) => (v ? `${currency ? `${currency} ` : ""}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}${type === "lifetime" ? " lifetime" : "/day"}` : "");
	const status = (s) => (live(s) ? "live" : "draft");
	const src = (kind, x) => `Imported from ${P.name} ${account.name ?? account.id} on ${today}: ${kind} ${x.id}, ${String(x.status ?? "").toLowerCase() || "status unknown"}.`;
	let daily = 0;
	for (const c of tree.campaigns.filter((x) => live(x.status))) {
		const obj = objectiveFor(net, c.objective);
		const cp = newNode("campaign", { platform: net, data: { label: c.name, ...obj, schedule: { start: c.start ?? "", end: c.end ?? "" }, ...(net === "google" ? { campaignType: c.campaignType ?? "SEARCH", bidStrategy: c.bidStrategy && CATALOG.google.bid.strategies.some((s) => s[0] === c.bidStrategy) ? c.bidStrategy : "", bidAmount: c.bidAmount ?? "" } : {}) } });
		cp.data.name = c.name;
		cp.status = status(c.status);
		cp.data.notes = [src("campaign", c), c.budget ? `Live budget: ${money(c.budget, c.budgetType)}.` : "", c.objective && !CATALOG[net]?.objectives.some((o) => o.id === String(c.objective).toUpperCase()) ? `Objective in ${P.short}: ${c.objective}.` : "", c.special ? `Special ad category: ${c.special}.` : "", c.notes ?? ""].filter(Boolean).join("\n");
		if (c.budgetType !== "lifetime") daily += c.budget ?? 0;
		nodes.push(cp);
		for (const s of (c.adsets ?? []).filter((x) => live(x.status))) {
			const as = newNode("adset", { parent: cp.id, platform: net, data: { label: s.name, ...s.data, targeting: { ...(s.data?.targeting ?? {}) } } });
			as.data.name = s.name;
			as.status = status(s.status);
			as.data.notes = [src(P.levels[1].toLowerCase(), s), s.budget ? `Live budget: ${money(s.budget)}.` : "", s.notes ?? ""].filter(Boolean).join("\n");
			if (!c.budget) daily += s.budget ?? 0;
			nodes.push(as);
			for (const a of (s.ads ?? []).filter((x) => live(x.status))) {
				const ad = newNode("ad", { parent: as.id, platform: net, data: { label: a.name, ...a.data } });
				ad.data.name = a.name;
				ad.status = status(a.status);
				ad.data.notes = [src("ad", a), a.data?.notes ?? ""].filter(Boolean).join("\n");
				nodes.push(ad);
			}
		}
	}
	return { nodes, monthly: Math.round(daily * 30.4), counts: { campaigns: nodes.filter((n) => n.type === "campaign").length, adsets: nodes.filter((n) => n.type === "adset").length, ads: nodes.filter((n) => n.type === "ad").length }, truncated: tree.truncated ?? [] };
}

// What the servers expose: one Composio user per planner (the plugin) or per organization (the portal), so everyone
// on a team sees the same connected accounts.
export function adAccounts(client, userId) {
	const net = (n) => {
		if (!CONNECTORS[n]) throw Object.assign(new Error(`${PLATFORMS[n]?.name ?? n} can't be connected through Composio yet.`), { status: 400 });
		return CONNECTORS[n];
	};
	const connection = async (n) => {
		const c = (await client.connections(userId)).find((x) => x.toolkit === net(n).toolkit);
		if (!c) throw Object.assign(new Error(`Connect ${PLATFORMS[n].name} first.`), { status: 409 });
		return c.id;
	};
	const runner = (id) => (slug, args) => client.run(slug, args, { userId, connectedAccountId: id });
	return {
		async status() {
			const conns = await client.connections(userId);
			return connectable().map((n) => ({ net: n, name: PLATFORMS[n].name, connected: conns.some((c) => c.toolkit === CONNECTORS[n].toolkit), needsId: n === "reddit" }));
		},
		connect: (n, callbackUrl) => client.link(net(n).toolkit, userId, callbackUrl),
		async disconnect(n) {
			for (const c of (await client.connections(userId)).filter((x) => x.toolkit === net(n).toolkit)) await client.disconnect(c.id);
			return { ok: true };
		},
		async accounts(n) {
			return net(n).accounts(runner(await connection(n)));
		},
		async import(n, account) {
			if (!account?.id) throw Object.assign(new Error("Pick an ad account."), { status: 400 });
			const tree = await net(n).read(runner(await connection(n)), String(account.id));
			return toNodes(n, account, tree, { currency: account.currency ?? "" });
		},
	};
}
