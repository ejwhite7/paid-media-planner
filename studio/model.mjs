// The plan model, shared by the canvas (browser), the server and the CLI: the platform catalog, defaults, normalize()
// (shape + validation) and lint() (the instant checks that run before Claude's review). Pure functions, no I/O.
//
// A plan holds any number of campaign trees: campaign (objective) → ad set (audience) → ad (creative). Each node keeps
// its parent id; the canvas draws the edges from that. Platform catalogs drift: update PLATFORMS when a network renames
// an objective or changes a limit.

import { CATALOG, ageLabel, bidLevel, bidStrategies, budgetLevels, defaultNative, goalsFor, googleTypes, nativeObjective, options, placementOptions, specialCategories } from "./platforms.mjs";
export * from "./platforms.mjs";

export const LOREM = {
	primaryText: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.",
	headline: "Lorem ipsum dolor sit amet",
	headline2: "Consectetur adipiscing",
	description: "Sed do eiusmod tempor.",
};

// Generic objectives, mapped to each network's own name. A name ending in * is the closest native objective, not an
// exact one: the build sheet tells whoever builds it to confirm in that network's ads manager.
export const OBJECTIVES = {
	awareness: "Awareness",
	traffic: "Traffic",
	engagement: "Engagement",
	video_views: "Video views",
	leads: "Leads",
	app: "App installs",
	sales: "Sales / conversions",
};

export const PLATFORMS = {
	meta: {
		name: "Meta Ads",
		short: "Meta",
		color: "#0866FF",
		levels: ["Campaign", "Ad set", "Ad"],
		objectives: { awareness: "Awareness", traffic: "Traffic", engagement: "Engagement", video_views: "Engagement*", leads: "Leads", app: "App promotion", sales: "Sales" },
		formats: {
			fb_feed: { name: "Facebook feed", ratio: [1, 1], size: "1080×1080" },
			fb_carousel: { name: "Facebook carousel", ratio: [1, 1], size: "1080×1080", cards: true },
			ig_feed: { name: "Instagram feed", ratio: [4, 5], size: "1080×1350" },
			ig_story: { name: "Instagram Stories / Reels", ratio: [9, 16], size: "1080×1920" },
		},
		ctas: ["Learn more", "Shop now", "Sign up", "Get quote", "Book now", "Contact us", "Download", "Subscribe", "Get offer"],
		limits: { primaryText: 125, headline: 40, description: 30 },
		// Text options: Meta takes up to 5 primary texts, headlines and descriptions per ad and picks per person.
		options: { primaryText: 5, headline: 5, description: 5 },
	},
	google: {
		name: "Google Ads",
		short: "Google",
		color: "#1A73E8",
		levels: ["Campaign", "Ad group", "Ad"],
		objectives: { awareness: "Awareness and consideration", traffic: "Website traffic", engagement: "Awareness and consideration*", video_views: "Awareness and consideration (YouTube)*", leads: "Leads", app: "App promotion", sales: "Sales" },
		formats: {
			search: { name: "Search (responsive search ad)", media: false },
			display: { name: "Display / Performance Max", ratio: [191, 100], size: "1200×628" },
			youtube: { name: "YouTube in-stream", ratio: [16, 9], size: "1920×1080" },
		},
		ctas: ["Learn more", "Shop now", "Sign up", "Get quote", "Book now", "Contact us", "Download", "Apply now", "Buy now", "Order now", "Subscribe", "Visit site", "Watch now", "Start now", "Play now", "See more", "Donate now"],
		limits: { headline: 30, headline2: 30, description: 90, path1: 15, path2: 15 },
	},
	tiktok: {
		name: "TikTok Ads",
		short: "TikTok",
		color: "#FE2C55",
		levels: ["Campaign", "Ad group", "Ad"],
		objectives: { awareness: "Reach", traffic: "Traffic", engagement: "Community interaction", video_views: "Video views", leads: "Lead generation", app: "App promotion", sales: "Website conversions" },
		formats: { infeed: { name: "In-feed video", ratio: [9, 16], size: "1080×1920" } },
		ctas: ["Learn more", "Shop now", "Sign up", "Book now", "Contact us", "Download", "Get quote", "Order now"],
		limits: { primaryText: 100 },
	},
	linkedin: {
		name: "LinkedIn Ads",
		short: "LinkedIn",
		color: "#0A66C2",
		levels: ["Campaign", "Ad set", "Ad"],
		objectives: { awareness: "Brand awareness", traffic: "Website visits", engagement: "Engagement", video_views: "Video views", leads: "Lead generation", app: "Website visits*", sales: "Website conversions" },
		formats: {
			single_image: { name: "Single image", ratio: [191, 100], size: "1200×627" },
			li_carousel: { name: "Carousel", ratio: [1, 1], size: "1080×1080", cards: true },
		},
		ctas: ["Learn more", "Sign up", "Register", "Download", "Request demo", "Apply", "Subscribe", "Join", "Attend", "View quote", "See more", "Buy now", "Shop now"],
		limits: { primaryText: 150, headline: 70 },
	},
	reddit: {
		name: "Reddit Ads",
		short: "Reddit",
		color: "#FF4500",
		levels: ["Campaign", "Ad group", "Ad"],
		objectives: { awareness: "Brand awareness and reach", traffic: "Traffic", engagement: "Engagement", video_views: "Video views", leads: "Lead generation", app: "App installs", sales: "Conversions" },
		formats: { promoted: { name: "Promoted post", ratio: [4, 3], size: "1200×900" } },
		ctas: ["Learn more", "Shop now", "Sign up", "Get quote", "Contact us", "Download", "Install", "View more"],
		limits: { headline: 300 },
	},
	x: {
		name: "X Ads",
		short: "X",
		color: "#0F1419",
		levels: ["Campaign", "Ad group", "Ad"],
		objectives: { awareness: "Reach", traffic: "Website traffic", engagement: "Engagements", video_views: "Video views", leads: "Website traffic*", app: "App installs", sales: "Website conversions" },
		formats: { promoted: { name: "Promoted post (website card)", ratio: [191, 100], size: "1200×628" } },
		ctas: ["Learn more", "Shop now", "Sign up", "Book now", "Get quote", "Download"],
		limits: { primaryText: 280, headline: 70 },
	},
	pinterest: {
		name: "Pinterest Ads",
		short: "Pinterest",
		color: "#E60023",
		levels: ["Campaign", "Ad group", "Ad"],
		objectives: { awareness: "Brand awareness", traffic: "Consideration", engagement: "Consideration*", video_views: "Video views", leads: "Lead generation", app: "Consideration*", sales: "Conversions" },
		formats: { pin: { name: "Standard pin", ratio: [2, 3], size: "1000×1500" } },
		ctas: ["Learn more", "Shop now", "Sign up", "Book now", "Get quote", "Visit site"],
		limits: { headline: 100, description: 500 },
	},
	snapchat: {
		name: "Snapchat Ads",
		short: "Snapchat",
		color: "#FFFC00",
		levels: ["Campaign", "Ad set", "Ad"],
		objectives: { awareness: "Awareness & engagement", traffic: "Traffic", engagement: "Awareness & engagement", video_views: "Awareness & engagement*", leads: "Leads", app: "App promotion", sales: "Sales" },
		formats: { single: { name: "Single image or video", ratio: [9, 16], size: "1080×1920" } },
		ctas: ["Learn more", "More", "Shop now", "Sign up", "Book now", "Get now", "Install now", "Watch", "Apply now", "Order now", "Download"],
		limits: { brandName: 25, headline: 34 },
	},
};

export const TYPES = {
	campaign: { label: "Campaign", sub: "Objective", parent: null, child: "adset" },
	adset: { label: "Ad set", sub: "Audience", parent: "campaign", child: "ad" },
	ad: { label: "Ad", sub: "Creative", parent: "adset", child: null },
};

export const STATUSES = ["draft", "in_review", "changes_requested", "approved", "live"];
export const STATUS_LABEL = { draft: "Draft", in_review: "In review", changes_requested: "Changes requested", approved: "Approved", live: "Live" };
export const FIELD_LABEL = { primaryText: "Primary text", headline: "Headline", headline2: "Headline 2", description: "Description", brandName: "Brand name", path1: "Path 1", path2: "Path 2" };

export const uid = (prefix = "n") => `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
export const firstFormat = (platform) => Object.keys(PLATFORMS[platform]?.formats ?? {})[0] ?? null;

export function nodeDefaults(type, platform = "meta") {
	if (type === "campaign")
		// One network per campaign, as in every ads manager. nativeObjective is that network's own objective; objective is
		// its generic equivalent. budget is derived from the channel budget (Settings) and the funnel weights.
		// campaignType, networks, locations and languages are Google campaign settings.
		return {
			name: "New campaign", label: "", funnel: "", platforms: [platform], objective: "traffic", nativeObjective: defaultNative(platform, "traffic")?.id ?? "",
			budget: { type: "daily", amount: 0, currency: "USD", level: budgetLevels(platform)[0]?.[0] ?? "campaign" }, bidStrategy: "", bidAmount: "", special: "NONE",
			campaignType: platform === "google" ? "SEARCH" : "", networks: platform === "google" ? ["search"] : [], locations: [], languages: [],
			schedule: { start: "", end: "" }, kpi: "", notes: "",
		};
	if (type === "adset")
		// Targeting dimensions without a field of their own live in targeting[key] (see CATALOG[platform].targeting).
		// optimization is the network's goal id; placements is "automatic" or a list of placement ids.
		return { name: "New ad set", label: "", locations: ["United States"], ageMin: 18, ageMax: 65, ageBuckets: [], genders: "all", languages: [], interests: [], customAudiences: [], exclusions: [], targeting: {}, placements: "automatic", destination: "", optimization: "", bidStrategy: "", bidAmount: "", budget: null, notes: "" };
	return {
		name: "New ad",
		label: "",
		platform,
		format: firstFormat(platform),
		...LOREM,
		cta: PLATFORMS[platform]?.ctas[0] ?? "Learn more",
		url: "https://example.com",
		displayUrl: "example.com",
		media: [],
		cards: [],
		// Google responsive search ads: headline and headline2 plus up to 13 more headlines and 3 more descriptions.
		extraPrimaryTexts: [],
		extraHeadlines: [],
		extraDescriptions: [],
		path1: "",
		path2: "",
		notes: "",
		// produced: designed or generated by the team (Claude can make it). ugc: shot by a creator, so the mock keeps a
		// placeholder and notes hold the creator brief. prompt: the generation prompt or shot list for produced creative.
		creative: "produced",
		prompt: "",
		// video | static | carousel, or "" to infer it from the media, the format and who makes it (see mediaType).
		mediaType: "",
	};
}

export function newNode(type, { x = 0, y = 0, parent = null, platform = "meta", data = {} } = {}) {
	return { id: uid(type === "adset" ? "as" : type === "ad" ? "ad" : "cp"), type, x, y, parent, status: "draft", assignee: "", comments: [], data: { ...nodeDefaults(type, platform), ...data } };
}

export function newPlan(name = "Untitled plan") {
	const now = new Date().toISOString();
	const campaign = newNode("campaign", { x: 80, y: 200, data: { name: "Campaign 1" } });
	const adset = newNode("adset", { x: 440, y: 200, parent: campaign.id, data: { name: "Ad set 1" } });
	const ad = newNode("ad", { x: 800, y: 200, parent: adset.id, data: { name: "Ad 1" } });
	return {
		schema: 1,
		id: uid("plan").replace("plan_", ""),
		name,
		owner: "",
		status: "draft",
		createdAt: now,
		updatedAt: now,
		brand: { name: "Your Brand", handle: "yourbrand", website: "example.com", color: "#5B5BD6", logo: "" },
		brief: "",
		settings: structuredClone(DEFAULT_SETTINGS),
		nodes: [campaign, adset, ad],
		feedback: { at: null, summary: "", items: [] },
		activity: [],
	};
}

const arr = (v) => (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
const str = (v, d = "") => (v == null ? d : String(v));

// Shapes a plan read from disk or sent by the canvas, filling defaults. Returns { plan, errors }: errors are problems
// the file cannot be saved with (bad parent links, unknown types); everything else is lint().
export function normalize(input) {
	const errors = [];
	if (!input || typeof input !== "object") return { plan: null, errors: ["Plan is not a JSON object"] };
	const base = newPlan(str(input.name, "Untitled plan"));
	const plan = { ...base, ...input, brand: { ...base.brand, ...(input.brand ?? {}) }, feedback: { ...base.feedback, ...(input.feedback ?? {}) } };
	plan.feedback.items = Array.isArray(plan.feedback.items) ? plan.feedback.items : [];
	plan.feedback.dismissed = Array.isArray(plan.feedback.dismissed) ? plan.feedback.dismissed.filter((k) => typeof k === "string") : [];
	plan.settings = normalizeSettings(input.settings);
	plan.activity = Array.isArray(plan.activity) ? plan.activity.slice(-200) : [];
	if (!STATUSES.includes(plan.status)) plan.status = "draft";
	const ids = new Set();
	plan.nodes = (Array.isArray(input.nodes) ? input.nodes : []).map((n, i) => {
		if (!TYPES[n?.type]) {
			errors.push(`nodes[${i}]: unknown type "${n?.type}" (use campaign, adset or ad)`);
			return null;
		}
		const id = str(n.id) || uid(n.type);
		if (ids.has(id)) errors.push(`nodes[${i}]: duplicate id "${id}"`);
		ids.add(id);
		const platform = n.data?.platform && PLATFORMS[n.data.platform] ? n.data.platform : "meta";
		const data = { ...nodeDefaults(n.type, platform), ...(n.data ?? {}) };
		if (n.type === "ad" && !MEDIA_TYPES[data.mediaType]) data.mediaType = "";
		if (n.type === "campaign") {
			data.platforms = arr(data.platforms).filter((p) => PLATFORMS[p]);
			const net = data.platforms[0] ?? "meta";
			const native = nativeObjective(net, n.data?.nativeObjective) ?? (OBJECTIVES[data.objective] ? defaultNative(net, data.objective) : null);
			if (!native) errors.push(`${id}: unknown objective "${data.nativeObjective || data.objective}" (use one of ${net}'s: ${CATALOG[net].objectives.map((o) => o.id).join(", ")})`);
			else Object.assign(data, { nativeObjective: native.id, objective: native.generic });
			data.budget = { ...nodeDefaults("campaign", net).budget, ...(data.budget ?? {}) };
			if (data.budget.share !== undefined) data.budget.share = Number(data.budget.share) > 0 ? Math.min(100, Number(data.budget.share)) : "";
			if (!budgetLevels(net).some(([k]) => k === data.budget.level)) data.budget.level = budgetLevels(net)[0][0];
			for (const k of ["networks", "locations", "languages"]) data[k] = arr(data[k]);
			if (net === "google" && !googleTypes().some((t) => t.id === data.campaignType)) data.campaignType = "SEARCH";
			if (net === "google" && !data.networks.length) data.networks = ["search"];
			if (!specialCategories(net).some((o) => o.id === data.special)) data.special = "NONE";
			data.schedule = { start: "", end: "", ...(data.schedule ?? {}) };
			if (n.data?.funnel === undefined) data.funnel = inferFunnel(str(data.name));
			if (!FUNNEL[data.funnel]) data.funnel = "";
		}
		if (n.type === "adset") {
			for (const k of ["locations", "languages", "interests", "customAudiences", "exclusions", "ageBuckets"]) data[k] = arr(data[k]);
			data.targeting = Object.fromEntries(Object.entries(data.targeting && typeof data.targeting === "object" ? data.targeting : {}).map(([k, v]) => [k, arr(v)]));
			if (!(Array.isArray(data.placements) || data.placements === "automatic")) data.placements = arr(data.placements).length && !/^automatic$/i.test(String(data.placements)) ? arr(data.placements) : "automatic";
		}
		if (n.type === "ad") {
			if (!PLATFORMS[data.platform]) errors.push(`${id}: unknown platform "${data.platform}" (use ${Object.keys(PLATFORMS).join(", ")})`);
			else if (!PLATFORMS[data.platform].formats[data.format]) data.format = firstFormat(data.platform);
			data.media = Array.isArray(data.media) ? data.media.filter((m) => m && typeof m.src === "string") : [];
			data.cards = Array.isArray(data.cards) ? data.cards : [];
			data.extraPrimaryTexts = arr(data.extraPrimaryTexts).slice(0, 4);
			data.extraHeadlines = arr(data.extraHeadlines).slice(0, 13);
			data.extraDescriptions = arr(data.extraDescriptions).slice(0, 4);
			if (n.data?.creative === undefined) data.creative = /\b(ugc|creator|influencer)\b/i.test(`${data.name} ${data.notes}`) ? "ugc" : "produced";
			if (!["produced", "ugc"].includes(data.creative)) data.creative = "produced";
		}
		return {
			id,
			type: n.type,
			x: Number.isFinite(n.x) ? n.x : 80 + i * 40,
			y: Number.isFinite(n.y) ? n.y : 80 + i * 40,
			parent: n.parent ?? null,
			status: STATUSES.includes(n.status) ? n.status : "draft",
			assignee: str(n.assignee),
			comments: Array.isArray(n.comments) ? n.comments : [],
			// Positions on each network's own canvas; x/y are the all-networks canvas.
			views: Object.fromEntries(Object.entries(n.views ?? {}).filter(([k, v]) => PLATFORMS[k] && Number.isFinite(v?.x) && Number.isFinite(v?.y)).map(([k, v]) => [k, { x: v.x, y: v.y }])),
			data,
		};
	}).filter(Boolean);
	const byId = Object.fromEntries(plan.nodes.map((n) => [n.id, n]));
	for (const n of plan.nodes) {
		if (n.parent == null) continue;
		const p = byId[n.parent];
		if (!p) errors.push(`${n.id}: parent "${n.parent}" doesn't exist`);
		else if (p.type !== TYPES[n.type].parent) errors.push(`${n.id}: a ${TYPES[n.type].label.toLowerCase()} can't sit under a ${TYPES[p.type].label.toLowerCase()}`);
	}
	if (!errors.length) splitByNetwork(plan);
	if (!errors.length) fitAges(plan);
	if (!errors.length) fitGoals(plan);
	migrateChannelBudgets(plan);
	if (!errors.length) applyBudgets(plan);
	if (plan.settings.naming.auto && !errors.length) applyNaming(plan);
	return { plan, errors };
}

export const childrenOf = (plan, id) => plan.nodes.filter((n) => n.parent === id);
export const nodeById = (plan, id) => plan.nodes.find((n) => n.id === id);

// Every text option an ad carries for a field: the main one first, then the extras (Meta's multiple text options).
export function textOptions(d, field) {
	const extra = { primaryText: d.extraPrimaryTexts, headline: d.extraHeadlines, description: d.extraDescriptions }[field] ?? [];
	return [d[field], ...(PLATFORMS[d.platform]?.options && d.format !== "search" ? extra ?? [] : [])].filter((v) => String(v ?? "").trim());
}
// What the creative is, independent of where it runs: video, static or carousel. Set on the ad, or inferred.
export const MEDIA_TYPES = { video: "Video", static: "Static", carousel: "Carousel" };
const VIDEO_FORMATS = new Set(["ig_story", "infeed", "youtube", "single"]);
export function mediaType(d) {
	if (MEDIA_TYPES[d.mediaType]) return d.mediaType;
	if (PLATFORMS[d.platform]?.formats[d.format]?.cards) return "carousel";
	const kind = d.media?.find((m) => m?.kind)?.kind;
	if (kind) return kind === "video" ? "video" : "static";
	return d.creative === "ugc" || VIDEO_FORMATS.has(d.format) ? "video" : "static";
}
// "Video · 9:16": the creative spec without a placement.
export function mediaLabel(d) {
	const r = PLATFORMS[d.platform]?.formats[d.format]?.ratio;
	return `${MEDIA_TYPES[mediaType(d)]}${r && r[0] < 100 ? ` · ${r[0]}:${r[1]}` : ""}`;
}
// True when the ad's ad set leaves placement to the network (Meta's Advantage+ placements and the like): the format
// is then a creative spec, not a placement decision.
export function autoPlaced(plan, ad) {
	const s = nodeById(plan, ad.parent);
	return !!CATALOG[ad.data.platform]?.placements?.automatic && (s?.data.placements ?? "automatic") === "automatic";
}
// How an ad's format reads in the brief, slides and names: the creative spec under automatic placements, otherwise the
// placement format.
export const adFormatLabel = (plan, ad) => `${PLATFORMS[ad.data.platform]?.short ?? ad.data.platform} · ${autoPlaced(plan, ad) ? mediaLabel(ad.data) : PLATFORMS[ad.data.platform]?.formats[ad.data.format]?.name ?? ad.data.format}`;
export function campaignOf(plan, node) {
	let n = node;
	for (let i = 0; n && n.type !== "campaign" && i < 3; i++) n = nodeById(plan, n.parent);
	return n?.type === "campaign" ? n : null;
}
export function subtree(plan, id) {
	const out = [id];
	for (let i = 0; i < out.length; i++) for (const c of childrenOf(plan, out[i])) out.push(c.id);
	return out;
}

const isLorem = (s) => typeof s === "string" && /lorem ipsum|consectetur adipiscing|sed do eiusmod/i.test(s);

// The instant checks. Each item: { node, severity: "error" | "warn" | "info", text }. node is null for plan-wide ones.
// Beyond structure and copy, every setting is checked against what its network's ads manager offers (platforms.mjs).
export function lint(plan) {
	const out = [];
	const add = (node, severity, text) => out.push({ node, severity, text, source: "check" });
	const campaigns = plan.nodes.filter((n) => n.type === "campaign");
	if (!campaigns.length) add(null, "error", "The plan has no campaign. Drag one in from the left.");
	for (const b of channelPlans(plan)) {
		const short = PLATFORMS[b.network].short;
		const mine = (t) => plan.nodes.filter((n) => n.type === t && campaignOf(plan, n)?.data.platforms[0] === b.network).length;
		if (!b.monthly) {
			add(null, "warn", `No ${short} budget: set the channel's monthly budget in Settings.`);
			continue;
		}
	}
	const want = (list, v) => !v || list.some((o) => o.id === v);
	for (const n of plan.nodes) {
		const d = n.data;
		const kids = childrenOf(plan, n.id);
		const camp = campaignOf(plan, n);
		const net = camp?.data.platforms[0] ?? (n.type === "ad" ? d.platform : null);
		const P = PLATFORMS[net];
		const C = CATALOG[net];
		if (n.type === "campaign") {
			if (d.platforms.length !== 1) add(n.id, "error", "Pick the network this campaign runs on.");
			if (!kids.length) add(n.id, "warn", "No ad sets yet: add an audience.");
			const native = nativeObjective(net, d.nativeObjective);
			if (native?.confirm) add(n.id, "info", `${P.short}'s "${native.label}" objective couldn't be checked against an official page: confirm it in ads manager.`);
			const min = C?.budget.minDaily[d.budget.level];
			if (d.budget.amount > 0 && min && d.budget.amount < min) add(n.id, "warn", `${P.short} needs at least ${d.budget.currency} ${min}/day at this level; the channel budget gives ${d.budget.currency} ${d.budget.amount}/day.`);
			const sets = kids.length || 1;
			const setMin = C?.budget.minDaily.adset;
			if (d.budget.level === "adset" && setMin && d.budget.amount / sets < setMin) add(n.id, "warn", `${d.budget.currency} ${Math.round(d.budget.amount / sets)}/day per ad set is under ${P.short}'s ${d.budget.currency} ${setMin} minimum.`);
			else if (d.budget.amount > 0 && kids.length && d.budget.amount / kids.length < TESTING.minAdsetDaily) add(n.id, "warn", `${d.budget.currency} ${Math.round(d.budget.amount / kids.length)}/day per ad set is thin: most networks need more to exit learning.`);
			if (!d.funnel && campaigns.some((c) => c !== n && c.data.platforms[0] === net && c.data.funnel)) add(n.id, "warn", "No funnel stage, so this campaign gets none of the channel budget. Set TOF, MOF or BOF.");
			if (bidLevel(net, d.budget.level) === "campaign") {
				const bids = bidStrategies(net, d.campaignType);
				if (!d.bidStrategy) add(n.id, "info", `Pick a bid strategy (${bids.map((b) => b.label).join(", ")}).`);
				else if (!want(bids, d.bidStrategy)) add(n.id, "error", `${P.short} doesn't offer that bid strategy here.`);
				else if (bids.find((b) => b.id === d.bidStrategy)?.flag === "amount" && !(Number(d.bidAmount) > 0)) add(n.id, "info", "Set the bid or cost target, or note that it's left open.");
			}
			if (net === "google") {
				if (!d.locations.length) add(n.id, "error", "No locations: Google sets locations on the campaign.");
				const type = googleTypes().find((t) => t.id === d.campaignType);
				const ads = plan.nodes.filter((a) => a.type === "ad" && campaignOf(plan, a) === n);
				for (const a of ads) if (type && !type.formats.includes(a.data.format)) add(a.id, "error", `A ${type.label} campaign can't run ${PLATFORMS.google.formats[a.data.format]?.name ?? a.data.format} ads.`);
				if (d.objective === "awareness" && ads.some((a) => a.data.format === "search")) add(n.id, "warn", "YouTube reach objective with search ads: search captures existing demand rather than building awareness.");
			}
			if (d.schedule.start && d.schedule.end && d.schedule.end < d.schedule.start) add(n.id, "error", "End date is before start date.");
		}
		if (n.type === "adset") {
			if (!n.parent) add(n.id, "error", "Not connected to a campaign.");
			if (!kids.length) add(n.id, "warn", "No ads yet: add a creative.");
			if (C?.geoLevel !== "campaign" && !d.locations.length) add(n.id, "error", "No locations targeted.");
			if (C) {
				const native = nativeObjective(net, camp?.data.nativeObjective);
				const goals = goalsFor(net, native?.id);
				if (goals.length && !d.optimization) add(n.id, "warn", `Pick a performance goal: ${goals.map((g) => g.label).slice(0, 4).join(", ")}${goals.length > 4 ? "…" : ""}.`);
				else if (goals.length && !want(goals, d.optimization)) add(n.id, "error", `"${d.optimization}" isn't a ${P.short} goal for ${native.label}. Pick one of: ${goals.map((g) => g.label).join(", ")}.`);
				if (native?.destinations && d.destination && !native.destinations.includes(d.destination)) add(n.id, "error", `${native.label} doesn't send people to "${d.destination}".`);
				if (bidLevel(net, camp?.data.budget.level) === "adset") {
					const bids = bidStrategies(net, camp?.data.campaignType);
					if (!d.bidStrategy) add(n.id, "info", `Pick a bid strategy (${bids.map((b) => b.label).join(", ")}).`);
					else if (!want(bids, d.bidStrategy)) add(n.id, "error", `${P.short} doesn't offer that bid strategy.`);
				}
				if (Array.isArray(d.placements)) {
					const known = placementOptions(net);
					const bad = d.placements.filter((x) => !known.some((o) => o.id === x));
					if (bad.length) add(n.id, "error", `${P.short} has no placement ${bad.join(", ")}.`);
					if (!d.placements.length) add(n.id, "error", "No placements selected: pick some or use automatic placements.");
				}
				const age = C.age;
				if (!age && (d.ageBuckets.length || Number(d.ageMin) !== 18 || Number(d.ageMax) !== 65)) add(n.id, "info", `${P.short} doesn't target by age; the age setting is ignored there.`);
				if (age?.kind === "buckets") {
					const bad = d.ageBuckets.filter((b) => !age.options.some((o) => o[0] === b));
					if (bad.length) add(n.id, "error", `${P.short} has no age group ${bad.join(", ")}.`);
				}
				if (age?.kind === "range") {
					if (Number(d.ageMin) < age.min || Number(d.ageMax) > age.max) add(n.id, "error", `${P.short} ages run ${age.min} to ${age.plusAt}+.`);
					if (age.confirm) add(n.id, "info", `Confirm ${P.short}'s age range options in ads manager.`);
				}
				if (age?.kind === "x" && (!age.from.includes(Number(d.ageMin)) || !age.to.includes(Number(d.ageMax)))) add(n.id, "error", `X age ranges start at ${age.from.join(", ")} and end at ${age.to.filter(Boolean).join(", ")} or "and up".`);
				if (!C.genders.some((g) => g[0] === d.genders)) add(n.id, "error", `${P.short} gender options are ${C.genders.map((g) => g[1]).join(", ")}.`);
				if (net === "linkedin" && camp?.data.nativeObjective === "JOB_APPLICANT" && d.ageBuckets.length) add(n.id, "error", "LinkedIn doesn't allow age targeting for job applicant campaigns.");
				const special = camp?.data.special && camp.data.special !== "NONE";
				if (special && (Number(d.ageMin) !== 18 || Number(d.ageMax) !== 65 || d.genders !== "all" || d.ageBuckets.length))
					add(n.id, "error", `Special ad category (${specialCategories(net).find((o) => o.id === camp.data.special)?.label}): age and gender can't be narrowed.`);
			}
			if (Number(d.ageMin) > Number(d.ageMax) && C?.age?.kind !== "x") add(n.id, "error", "Minimum age is above maximum age.");
			if (C?.age && Number(d.ageMin) < 18 && !d.ageBuckets.length) add(n.id, "warn", "Targets under-18s: most networks restrict this and some ban it for many categories.");
			const sib = n.parent ? childrenOf(plan, n.parent).filter((s) => s.id !== n.id) : [];
			const key = (s) => [s.data.locations, s.data.interests, s.data.customAudiences, ...Object.values(s.data.targeting ?? {})].map((a) => [...a].sort().join("|")).join("/") + `/${s.data.ageMin}-${s.data.ageMax}/${s.data.ageBuckets.join(",")}/${s.data.genders}`;
			const twin = sib.find((s) => key(s) === key(n));
			if (twin) add(n.id, "warn", `Same targeting as "${twin.data.name}": the two will bid against each other.`);
		}
		if (n.type === "ad") {
			if (!n.parent) add(n.id, "error", "Not connected to an ad set.");
			const p = PLATFORMS[d.platform];
			if (camp && camp.data.platforms[0] !== d.platform) add(n.id, "error", `${p?.short ?? d.platform} isn't this campaign's network.`);
			if (p) {
				for (const [field, max] of Object.entries(p.limits)) {
					if ((field === "headline2" || field.startsWith("path")) && d.format !== "search") continue;
					const len = field === "brandName" ? (plan.brand.name ?? "").length : str(d[field]).length;
					if (len > max) add(n.id, "warn", `${FIELD_LABEL[field] ?? field} is ${len} characters; ${p.short} shows ${max} before truncating.`);
				}
				if (d.format === "search") {
					const heads = [d.headline, d.headline2, ...d.extraHeadlines].filter((h) => str(h).trim());
					const descs = [d.description, ...d.extraDescriptions].filter((h) => str(h).trim());
					if (heads.length < 3) add(n.id, "warn", `Responsive search ads need at least 3 headlines (up to 15); this has ${heads.length}.`);
					if (descs.length < 2) add(n.id, "warn", `Responsive search ads need at least 2 descriptions (up to 4); this has ${descs.length}.`);
					for (const h of d.extraHeadlines) if (str(h).length > 30) add(n.id, "warn", `Headline "${h.slice(0, 20)}…" is over 30 characters.`);
					for (const h of d.extraDescriptions) if (str(h).length > 90) add(n.id, "warn", `A description is over 90 characters.`);
					if (descs.length > 4) add(n.id, "warn", `Responsive search ads take up to 4 descriptions; this has ${descs.length}.`);
				}
				if (p.options && d.format !== "search") {
					const extra = { primaryText: d.extraPrimaryTexts, headline: d.extraHeadlines, description: d.extraDescriptions };
					for (const [field, list] of Object.entries(extra)) {
						if (list.length > (p.options[field] ?? 1) - 1) add(n.id, "warn", `${p.short} takes up to ${p.options[field]} ${FIELD_LABEL[field].toLowerCase()} options; this has ${list.length + 1}.`);
						for (const v of list) if (str(v).length > p.limits[field]) add(n.id, "warn", `${FIELD_LABEL[field]} option "${str(v).slice(0, 24)}…" is ${str(v).length} characters; ${p.short} shows ${p.limits[field]}.`);
					}
				}
				if (!p.ctas.includes(d.cta)) add(n.id, "warn", `"${d.cta}" isn't one of ${p.short}'s call-to-action buttons (${p.ctas.slice(0, 6).join(", ")}…).`);
				const f = p.formats[d.format];
				if (f && f.media !== false && !d.media.length && !(f.cards && d.cards.some((c) => c.src))) add(n.id, "info", "Creative is still a placeholder.");
			}
			if (["primaryText", "headline", "headline2", "description"].some((k) => isLorem(d[k]))) add(n.id, "info", "Copy is still lorem ipsum.");
			if (!d.url || d.url === "https://example.com") add(n.id, "warn", "Landing page URL isn't set.");
		}
	}
	return out;
}

// Issues per node, merging the checks with Claude's open feedback. Checks someone removed (feedback.dismissed, keyed by
// issueKey) stay hidden while their text is unchanged; removed feedback items are resolved.
export const issueKey = (i) => `${i.node ?? "plan"}|${i.text}`;
export function issuesByNode(plan) {
	const map = {};
	const gone = new Set(plan.feedback.dismissed ?? []);
	const checks = lint(plan).filter((i) => !gone.has(issueKey(i)));
	const notes = plan.feedback.items.map((f, fb) => ({ ...f, fb, source: "claude" })).filter((f) => !f.resolved);
	for (const i of [...checks, ...notes]) (map[i.node ?? "plan"] ??= []).push(i);
	return map;
}

// One line for an ad set's audience. platform decides how age reads (a range, the network's age groups, or none).
export function adsetSummary(d, platform = "meta") {
	const parts = [d.locations.slice(0, 2).join(", ") + (d.locations.length > 2 ? ` +${d.locations.length - 2}` : "")];
	if (CATALOG[platform]?.age) parts.push(ageLabel(platform, d));
	if (d.genders && d.genders !== "all") parts.push(String(d.genders).toLowerCase());
	if (d.interests.length) parts.push(`${d.interests.length} interest${d.interests.length > 1 ? "s" : ""}`);
	const dims = Object.values(d.targeting ?? {}).reduce((a, v) => a + v.length, 0);
	if (dims) parts.push(`${dims} targeting`);
	if (d.customAudiences.length) parts.push(`${d.customAudiences.length} custom`);
	return parts.filter(Boolean).join(" · ");
}
// Labels for a campaign's network objective and an ad set's goal, as each ads manager names them.
export const objectiveLabel = (c) => nativeObjective(c.data.platforms[0], c.data.nativeObjective)?.label ?? OBJECTIVES[c.data.objective] ?? "";
export const goalLabel = (plan, adset) => {
	const c = campaignOf(plan, adset);
	return goalsFor(c?.data.platforms[0], c?.data.nativeObjective).find((g) => g.id === adset.data.optimization)?.label ?? adset.data.optimization ?? "";
};
export const optionLabel = (list, id) => options(list).find((o) => o.id === id)?.label ?? id;

export const money = (b) => (b && Number(b.amount) > 0 ? `${b.currency ?? "USD"} ${Number(b.amount).toLocaleString()}${b.type === "daily" ? "/day" : " lifetime"}` : "No budget");

// Tidy tree layout, left to right: campaigns, then their ad sets, then ads, each parent centred on its children.
// Nodes not connected to anything are stacked below.
export const COL = { campaign: 80, adset: 460, ad: 840 };
export function layoutPlan(plan, { gap = 26, h = { campaign: 150, adset: 130, ad: 150 } } = {}) {
	let y = 80;
	const place = (n) => {
		const kids = childrenOf(plan, n.id);
		n.x = COL[n.type];
		if (!kids.length) {
			n.y = y;
			y += h[n.type] + gap;
			return;
		}
		const top = y;
		kids.forEach(place);
		const last = kids[kids.length - 1];
		n.y = Math.max(top, Math.round((kids[0].y + last.y) / 2));
		y = Math.max(y, n.y + h[n.type] + gap);
	};
	for (const c of plan.nodes.filter((n) => n.type === "campaign")) {
		place(c);
		y += gap * 2;
	}
	const placed = new Set(plan.nodes.filter((n) => n.type === "campaign").flatMap((c) => subtree(plan, c.id)));
	for (const n of plan.nodes.filter((n) => !placed.has(n.id))) {
		n.x = COL[n.type];
		n.y = y;
		y += h[n.type] + gap;
	}
	return plan;
}

// ---------- plan settings: naming convention, test budget, funnel weighting, positioning context ----------
// plan.settings is shared by the canvas, the CLI and Claude. normalize() fills it, renames nodes when the naming
// convention is on, and infers a campaign's funnel stage from its name when it hasn't been set.

export const FUNNEL = { tof: "TOF", mof: "MOF", bof: "BOF" };
export const FUNNEL_LABEL = { tof: "Top of funnel: prospecting", mof: "Middle: engaged and nurture", bof: "Bottom: retargeting and high intent" };
export const NAME_TOKENS = {
	campaign: ["seq", "funnel", "objective", "network", "label", "brand", "date"],
	adset: ["seq", "label", "geo", "optimization", "funnel", "network"],
	ad: ["seq", "letter", "label", "format", "network", "cta"],
};
export const DEFAULT_SETTINGS = {
	naming: { auto: false, campaign: "{seq} // {funnel} // {objective} // {label}", adset: "{seq} // {label}", ad: "{seq} // {label} // {format}" },
	// Budgets are set per channel (network): channels[network] = { monthly, cpa }. Each channel's monthly budget splits
	// across its campaigns by the funnel weights; campaign and ad set budgets are derived from it, never typed in.
	// cpa: expected cost per optimisation event on that channel, if known. budget.monthly is the total, kept for display.
	channels: {},
	budget: { monthly: 0, currency: "USD", cpa: 0 },
	funnel: { tof: 60, mof: 25, bof: 15 },
	// Positioning and messaging files (from GrowthCast's positioning workshop or wizard), stored next to the plan.
	context: [],
};
// Rules of thumb the structure is sized with. Networks publish their own, so the brief says "roughly".
export const TESTING = { eventsPerWeek: 50, minAdsetDaily: 20, minAdDaily: 7, maxAdsPerAdset: 5, minAdsPerAdset: 2 };

export function normalizeSettings(s = {}) {
	const d = DEFAULT_SETTINGS;
	const num = (v, def) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : def);
	return {
		naming: { ...d.naming, ...(s.naming ?? {}), auto: !!s.naming?.auto },
		channels: Object.fromEntries(Object.entries(s.channels && typeof s.channels === "object" ? s.channels : {}).filter(([k]) => PLATFORMS[k]).map(([k, v]) => [k, { monthly: num(v?.monthly, 0), cpa: num(v?.cpa, 0) }])),
		budget: { monthly: num(s.budget?.monthly, 0), currency: str(s.budget?.currency, "USD").slice(0, 3).toUpperCase() || "USD", cpa: num(s.budget?.cpa, 0) },
		funnel: Object.fromEntries(Object.keys(FUNNEL).map((k) => [k, num(s.funnel?.[k], d.funnel[k])])),
		context: (Array.isArray(s.context) ? s.context : []).filter((c) => c && typeof c.path === "string").map((c) => ({ name: str(c.name, c.path.split("/").pop()), path: c.path, size: num(c.size, 0), addedAt: str(c.addedAt) })),
	};
}

const pad = (n) => String(n).padStart(2, "0");
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
// A convention template as a regex, so a name built from it can be read back (for {label}) and checked.
function templateRegex(tpl) {
	const parts = tpl.split(/(\{[a-z]+\})/);
	const src = parts.map((p) => (/^\{[a-z]+\}$/.test(p) ? (p === "{label}" ? "(?<label>.*?)" : ".*?") : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("");
	return new RegExp(`^${src}$`, "s");
}
// The human part of a node's name: what {label} stands for. Read back from a convention-built name when possible.
export function labelOf(node, tpl) {
	if (node.data.label) return node.data.label;
	const name = str(node.data.name).trim();
	const m = tpl && /\{label\}/.test(tpl) ? templateRegex(tpl).exec(name) : null;
	if (m?.groups?.label?.trim()) return m.groups.label.trim();
	return name.includes("//") ? name.split("//").pop().trim() : name;
}
const networkName = (ps) => ps.map((p) => PLATFORMS[p]?.short ?? p).join("+");
const shortOpt = (s) => str(s).replace(/landing[- ]page views?/i, "LPV").trim();

// Every token's value for a node. seq is 01 for a campaign, 01.02 for an ad set, 01.02.A for an ad, in canvas order.
export function nameTokens(plan, node) {
	const s = normalizeSettings(plan.settings);
	const camps = plan.nodes.filter((n) => n.type === "campaign");
	const camp = campaignOf(plan, node);
	const adset = node.type === "ad" ? nodeById(plan, node.parent) : node.type === "adset" ? node : null;
	const cSeq = camp ? pad(camps.indexOf(camp) + 1) : "00";
	const aSeq = adset ? `${cSeq}.${pad((adset.parent ? childrenOf(plan, adset.parent) : [adset]).indexOf(adset) + 1)}` : cSeq;
	const letter = node.type === "ad" ? LETTERS[(node.parent ? childrenOf(plan, node.parent) : [node]).indexOf(node)] ?? "Z" : "";
	const d = node.data;
	const t = {
		brand: plan.brand?.name ?? "",
		funnel: FUNNEL[camp?.data.funnel] ?? "",
		objective: camp ? objectiveLabel(camp) : "",
		network: node.type === "ad" ? PLATFORMS[d.platform]?.short ?? "" : networkName(camp?.data.platforms ?? []),
		date: (camp?.data.schedule?.start || new Date().toISOString()).slice(0, 7).replace("-", ""),
		label: labelOf(node, s.naming[node.type]),
	};
	if (node.type === "campaign") t.seq = cSeq;
	if (node.type === "adset") Object.assign(t, { seq: aSeq, geo: (CATALOG[camp?.data.platforms[0]]?.geoLevel === "campaign" ? camp.data.locations : d.locations)?.[0] ?? "", optimization: shortOpt(goalLabel(plan, node).replace(/^Maximize (number of )?/i, "")) });
	if (node.type === "ad") Object.assign(t, { seq: `${aSeq}.${letter}`, letter, format: autoPlaced(plan, node) ? mediaLabel(d).replace(" · ", " ") : PLATFORMS[d.platform]?.formats[d.format]?.name.split(" (")[0] ?? "", cta: d.cta ?? "" });
	return t;
}
// Fills a template. Empty tokens drop out with their separator, so "{seq} // {funnel} // {label}" never shows "//  //".
export function applyTemplate(tpl, tokens) {
	const filled = tpl.replace(/\{([a-z]+)\}/g, (_, k) => `\u0000${tokens[k] ?? ""}\u0000`);
	return filled
		.split(/(\u0000[^\u0000]*\u0000)/)
		.reduce((acc, part, i, all) => {
			if (!part.startsWith("\u0000")) return acc + part;
			const v = part.slice(1, -1);
			if (v) return acc + v;
			// Drop the separator that follows an empty token (or the one before it, at the end).
			if (all.slice(i + 1).some((x) => x.trim() && !/^\u0000\u0000$/.test(x))) all[i + 1] = all[i + 1].replace(/^\s*[^A-Za-z0-9\s{]+\s*/, "");
			else acc = acc.replace(/\s*[^A-Za-z0-9\s}]+\s*$/, "");
			return acc;
		}, "")
		.replace(/\s{2,}/g, " ")
		.trim();
}
export const conventionName = (plan, node) => applyTemplate(normalizeSettings(plan.settings).naming[node.type], nameTokens(plan, node));
// Renames every node by the convention, keeping each one's label. Returns the number renamed.
export function applyNaming(plan) {
	const s = normalizeSettings(plan.settings);
	let changed = 0;
	for (const n of plan.nodes) n.data.label = labelOf(n, s.naming[n.type]);
	for (const n of plan.nodes) {
		const name = conventionName(plan, n);
		if (name && name !== n.data.name) (n.data.name = name), changed++;
	}
	return changed;
}

// How much structure a channel's budget can carry. Each ad set needs about TESTING.eventsPerWeek optimisation events a
// week to leave learning (Meta's rule; the others are similar), or at least the network's (or TESTING's) minimum a day
// when the cost per event isn't known, and each ad needs enough spend to be read. The funnel weights split it by stage.
// budgetPlan(settings) sizes the whole plan; budgetPlan(settings, network) one channel.
export function budgetPlan(settings, network) {
	const s = normalizeSettings(settings);
	const ch = network ? s.channels[network] ?? { monthly: 0, cpa: 0 } : null;
	const monthly = ch ? ch.monthly : Object.values(s.channels).reduce((a, c) => a + c.monthly, 0) || s.budget.monthly;
	const cpa = (ch ? ch.cpa : 0) || s.budget.cpa;
	const { currency } = s.budget;
	const totalW = Object.values(s.funnel).reduce((a, b) => a + b, 0) || 1;
	const floor = Math.max(TESTING.minAdsetDaily, network ? CATALOG[network]?.budget.minDaily.adset ?? 0 : 0);
	const perAdsetDaily = Math.max(floor, cpa ? (TESTING.eventsPerWeek * cpa) / 7 : 0);
	const notes = [];
	const stages = Object.keys(FUNNEL).map((key) => {
		const share = s.funnel[key] / totalW;
		const daily = (monthly * share * 12) / 365;
		const adsets = s.funnel[key] > 0 ? Math.min(6, Math.floor(daily / perAdsetDaily)) : 0;
		const ads = adsets ? Math.max(TESTING.minAdsPerAdset, Math.min(TESTING.maxAdsPerAdset, Math.floor(daily / adsets / TESTING.minAdDaily))) : 0;
		return { key, label: FUNNEL[key], weight: s.funnel[key], share, monthly: monthly * share, daily, adsets, ads };
	});
	const who = network ? PLATFORMS[network].short : "the plan";
	if (!monthly) return { network, currency, monthly, daily: 0, perAdsetDaily, stages, campaigns: 0, adsets: 0, ads: 0, notes: [`Set a monthly budget for ${who} in Settings.`] };
	const funded = stages.filter((st) => st.adsets > 0);
	if (funded.length) for (const st of stages.filter((st) => st.weight > 0 && !st.adsets))
		notes.push(`${network ? `${PLATFORMS[network].short} ` : ""}${st.label} gets ${currency} ${Math.round(st.daily)}/day, under one ad set's ${currency} ${Math.round(perAdsetDaily)}/day: fold it into ${funded[0]?.label ?? "a single campaign"} or raise its weight.`);
	if (!funded.length) {
		notes.push(cpa ? `At ${currency} ${cpa} per event, one ${network ? PLATFORMS[network].short : ""} ad set needs about ${currency} ${Math.round(perAdsetDaily)}/day to leave learning. Run one campaign with one ad set, or optimise for a cheaper event higher in the funnel.` : `Run one ${network ? PLATFORMS[network].short : ""} campaign with one broad ad set until the budget grows.`);
		const all = (monthly * 12) / 365;
		return { network, currency, monthly, daily: all, perAdsetDaily, stages, campaigns: 1, adsets: 1, ads: Math.max(TESTING.minAdsPerAdset, Math.min(TESTING.maxAdsPerAdset, Math.floor(all / TESTING.minAdDaily))), notes };
	}
	const adsets = funded.reduce((a, st) => a + st.adsets, 0);
	return { network, currency, monthly, daily: (monthly * 12) / 365, perAdsetDaily, stages, campaigns: funded.length, adsets, ads: funded.reduce((a, st) => a + st.adsets * st.ads, 0), notes };
}
export const channelPlans = (plan) => planNetworks(plan).map((p) => budgetPlan(plan.settings, p));

// A campaign's derived daily budget: its channel's monthly budget, split by the funnel weights across the stages that
// have campaigns on that channel, then evenly across the campaigns in a stage. Unstaged campaigns share the channel
// only when no campaign on it has a stage.
export function derivedBudget(plan, camp) {
	const s = normalizeSettings(plan.settings);
	const net = camp.data.platforms[0];
	const monthly = s.channels[net]?.monthly ?? 0;
	const peersOf = (key) => plan.nodes.filter((n) => n.type === "campaign" && n.data.platforms[0] === net && (n.data.funnel || "_") === key);
	const groups = [...new Set(plan.nodes.filter((n) => n.type === "campaign" && n.data.platforms[0] === net).map((n) => n.data.funnel || "_"))];
	const staged = groups.some((g) => g !== "_");
	const weight = (g) => (g === "_" ? (staged ? 0 : 1) : s.funnel[g] ?? 0);
	const total = groups.reduce((a, g) => a + weight(g), 0);
	const key = camp.data.funnel || "_";
	const peerList = peersOf(key);
	const peers = peerList.length || 1;
	const stageDaily = monthly && total ? (((monthly * 12) / 365) * weight(key)) / total : 0;
	// A campaign's share of its stage: budget.share (%) where set; campaigns without one split what's left evenly. Shares
	// over 100% in total are scaled down to fit.
	const pct = (n) => (Number(n.data.budget?.share) > 0 ? Number(n.data.budget.share) : 0);
	const set = peerList.reduce((a, n) => a + pct(n), 0);
	const unset = peerList.filter((n) => !pct(n)).length;
	const part = pct(camp) ? (set > 100 || !unset ? pct(camp) / set : pct(camp) / 100) : set >= 100 ? 0 : (1 - set / 100) / (unset || 1);
	return { network: net, monthly, daily: Math.round(stageDaily * part), currency: s.budget.currency, stage: key === "_" ? null : key, share: total ? weight(key) / total : 0, peers, part, custom: set > 0 };
}
export const suggestedBudget = (plan, camp) => {
	const d = derivedBudget(plan, camp);
	return d.monthly ? { amount: d.daily, currency: d.currency, stage: { key: d.stage, weight: Math.round(d.share * 100) }, peers: d.peers, network: d.network, monthly: d.monthly } : null;
};
// Writes derived budgets onto campaigns and, where the network budgets ad sets (ABO), onto their ad sets.
function applyBudgets(plan) {
	for (const c of plan.nodes.filter((n) => n.type === "campaign")) {
		const d = derivedBudget(plan, c);
		c.data.budget = { ...c.data.budget, type: "daily", amount: d.daily, currency: d.currency };
		const sets = childrenOf(plan, c.id);
		for (const a of sets) a.data.budget = c.data.budget.level === "adset" ? { type: "daily", amount: Math.round(d.daily / (sets.length || 1)), currency: d.currency } : null;
	}
}
// Ages on each network's own scale. An open top ("65+") stays open: Snapchat's 50+, X's "and up".
function fitAges(plan) {
	for (const s of plan.nodes.filter((n) => n.type === "adset")) {
		const age = CATALOG[campaignOf(plan, s)?.data.platforms[0]]?.age;
		const d = s.data;
		const min = Number(d.ageMin), max = Number(d.ageMax);
		if (age?.kind === "range") {
			d.ageMin = Math.min(Math.max(min, age.min), age.plusAt);
			d.ageMax = max >= age.plusAt || max >= 65 ? age.plusAt : Math.max(Math.min(max, age.max), d.ageMin);
		}
		if (age?.kind === "x") {
			d.ageMin = [...age.from].reverse().find((v) => v <= min) ?? age.from[0];
			d.ageMax = max >= 65 || max === 0 ? 0 : age.to.filter(Boolean).find((v) => v >= max) ?? 0;
		}
	}
}
// Free-text goals from older plans ("Purchase", "Landing-page views") become the network's goal id when one clearly
// matches; anything else is left for the checks to flag.
const GOAL_WORDS = [
	[/purchas|conversion|sale|checkout/i, ["OFFSITE_CONVERSIONS", "CONVERT", "PIXEL_PURCHASE", "PURCHASE", "MAX_CONVERSION", "CHECKOUT", "WEBSITE_CONVERSIONS"]],
	[/landing/i, ["LANDING_PAGE_VIEWS", "LANDING_PAGE_VIEW"]],
	[/lead/i, ["LEAD_GENERATION", "LEADS", "MAX_LEAD", "LEAD", "LEAD_FORM_SUBMISSIONS"]],
	[/click/i, ["LINK_CLICKS", "CLICK", "MAX_CLICK", "CLICKS", "PIN_CLICK"]],
	[/install/i, ["APP_INSTALLS", "INSTALL"]],
	[/thruplay|video view/i, ["THRUPLAY", "ENGAGED_VIEW", "MAX_VIDEO_VIEW", "VIDEO_VIEWS", "VIDEO_COMPLETION"]],
	[/reach/i, ["REACH", "MAX_REACH"]],
	[/impression/i, ["IMPRESSIONS", "IMPRESSION", "MAX_IMPRESSION"]],
];
function fitGoals(plan) {
	for (const s of plan.nodes.filter((n) => n.type === "adset" && n.data.optimization)) {
		const c = campaignOf(plan, s);
		const goals = goalsFor(c?.data.platforms[0], c?.data.nativeObjective);
		if (!goals.length || goals.some((g) => g.id === s.data.optimization)) continue;
		const words = GOAL_WORDS.find(([re]) => re.test(s.data.optimization));
		const hit = words?.[1].find((id) => goals.some((g) => g.id === id));
		if (hit) s.data.optimization = hit;
	}
}
// Plans from before channel budgets: the single test budget splits evenly across the networks in the plan.
function migrateChannelBudgets(plan) {
	const s = plan.settings;
	if (Object.keys(s.channels).length || !s.budget.monthly) return;
	const nets = planNetworks(plan);
	for (const n of nets) s.channels[n] = { monthly: Math.round(s.budget.monthly / nets.length), cpa: s.budget.cpa };
}
// A campaign runs on one network. Older plans could list several: the first keeps the campaign, and each other
// network gets its own copy (ids <campaign>-<network>, <ad set>-<network>) holding that network's ads.
function splitByNetwork(plan) {
	for (const c of plan.nodes.filter((n) => n.type === "campaign" && n.data.platforms.length > 1)) {
		const [first, ...rest] = c.data.platforms;
		c.data.platforms = [first];
		for (const net of rest) {
			const cid = `${c.id}-${net}`;
			if (!nodeById(plan, cid)) plan.nodes.push({ ...structuredClone(c), id: cid, y: c.y + 40, views: {}, comments: [], data: { ...structuredClone(c.data), platforms: [net], name: `${c.data.name} (${PLATFORMS[net].short})`, label: "", nativeObjective: defaultNative(net, c.data.objective)?.id ?? "", budget: { ...c.data.budget, level: budgetLevels(net)[0][0] }, bidStrategy: "", bidAmount: "", special: "NONE", campaignType: net === "google" ? "SEARCH" : "", networks: net === "google" ? ["search"] : [] } });
			for (const a of childrenOf(plan, c.id)) {
				const ads = childrenOf(plan, a.id).filter((ad) => ad.data.platform === net);
				if (!ads.length) continue;
				const aid = `${a.id}-${net}`;
				if (!nodeById(plan, aid)) plan.nodes.push({ ...structuredClone(a), id: aid, parent: cid, y: a.y + 40, views: {}, comments: [], data: { ...structuredClone(a.data), label: "", optimization: "", placements: "automatic", bidStrategy: "", bidAmount: "", ageBuckets: [] } });
				for (const ad of ads) ad.parent = aid;
			}
		}
	}
}
export const inferFunnel = (name) => (/\bTOF\b|prospect|acquisition|cold/i.test(name) ? "tof" : /\bMOF\b|nurture|consideration|engaged/i.test(name) ? "mof" : /\bBOF\b|retarget|remarket|conversion|high[- ]intent/i.test(name) ? "bof" : "");
export function budgetSummary(plan) {
	const plans = channelPlans(plan).filter((b) => b.monthly);
	if (!plans.length) return "No channel budgets set (Settings).";
	const cur = plans[0].currency;
	const count = (t, net) => plan.nodes.filter((n) => n.type === t && campaignOf(plan, n)?.data.platforms[0] === net).length;
	return [
		`Channel budgets: ${plans.map((b) => `${PLATFORMS[b.network].short} ${cur} ${b.monthly.toLocaleString()}/month`).join(", ")}; each split ${plans[0].stages.map((s) => `${s.label} ${s.weight}%`).join(" / ")} across its campaigns.`,
		...plans.map((b) => `${PLATFORMS[b.network].short} can carry about ${b.campaigns} campaign${b.campaigns === 1 ? "" : "s"}, ${b.adsets} ad set${b.adsets === 1 ? "" : "s"} and ${b.ads} ads at ${cur} ${Math.round(b.perAdsetDaily)}+/day per ad set; the plan has ${count("campaign", b.network)} / ${count("adset", b.network)} / ${count("ad", b.network)}.`),
		...plans.flatMap((b) => b.notes),
	].join(" ");
}

// ---------- per-network canvases ----------
// A plan holds one tree; each network's canvas shows the part of it that runs there: campaigns that include the
// network, their ad sets, and the ads on that network.
export function inView(plan, n, platform) {
	if (!platform) return true;
	if (n.type === "ad") return n.data.platform === platform;
	const camp = campaignOf(plan, n);
	return !!camp && camp.data.platforms.includes(platform);
}
// The plan as one network sees it, for exports: other networks' ads dropped, campaigns narrowed to that network.
export function viewPlan(plan, platform) {
	if (!platform || !PLATFORMS[platform]) return plan;
	const p = structuredClone(plan);
	p.nodes = p.nodes.filter((n) => inView(plan, nodeById(plan, n.id), platform));
	for (const n of p.nodes) if (n.type === "campaign") n.data.platforms = [platform];
	p.feedback = { ...p.feedback, items: p.feedback.items.filter((i) => !i.node || p.nodes.some((n) => n.id === i.node)) };
	p.viewOf = platform;
	return p;
}
// Networks used anywhere in the plan, in catalog order.
export const planNetworks = (plan) => Object.keys(PLATFORMS).filter((k) => plan.nodes.some((n) => (n.type === "campaign" ? n.data.platforms.includes(k) : n.type === "ad" && n.data.platform === k)));

// ---------- build facts: each setting as the network's ads manager names it, for the brief, sheets and slides ----------
const bidText = (net, type, id, amount, cur) => {
	const b = bidStrategies(net, type).find((x) => x.id === id);
	if (!b) return id || "";
	return `${b.label}${amount ? ` (${b.flag === "roas" ? `${amount}%` : `${cur} ${amount}`})` : ""}`;
};
export function campaignFacts(c) {
	const d = c.data;
	const net = d.platforms[0];
	const C = CATALOG[net];
	if (!C) return [["Network", "—"]];
	const native = nativeObjective(net, d.nativeObjective);
	const rows = [["Network", PLATFORMS[net].name], ["Objective", `${native?.label ?? "—"}${native?.confirm ? " (confirm in ads manager)" : ""}`]];
	if (net === "google") rows.push(["Campaign type", googleTypes().find((t) => t.id === d.campaignType)?.label ?? "—"], ["Networks", d.networks.map((x) => optionLabel(C.networks, x)).join(", ") || "—"], ["Locations", d.locations.join(", ") || "—"], ["Languages", d.languages.join(", ") || "All"]);
	if (C.special && d.special !== "NONE") rows.push(["Special ad category", optionLabel(C.special, d.special)]);
	rows.push(["Budget", `${money(d.budget)} · ${budgetLevels(net).find(([k]) => k === d.budget.level)?.[1] ?? d.budget.level}`]);
	if (bidLevel(net, d.budget.level) === "campaign") rows.push(["Bid strategy", bidText(net, d.campaignType, d.bidStrategy, d.bidAmount, d.budget.currency) || "—"]);
	return rows;
}
export function adsetFacts(plan, s) {
	const d = s.data;
	const camp = campaignOf(plan, s);
	const net = camp?.data.platforms[0];
	const C = CATALOG[net];
	if (!C) return [["Locations", d.locations.join(", ") || "—"]];
	const rows = [];
	if (C.geoLevel !== "campaign") rows.push(["Locations", d.locations.join(", ") || "—"], ["Languages", d.languages.join(", ") || "All"]);
	if (d.destination) rows.push(["Conversion location", d.destination]);
	rows.push([goalsFor(net, camp.data.nativeObjective).length ? "Performance goal" : "Conversion goal", goalLabel(plan, s) || "—"]);
	if (C.age) rows.push(["Age", ageLabel(net, d)]);
	rows.push(["Gender", optionLabel(C.genders, d.genders)]);
	for (const t of options(C.targeting)) {
		const v = ["interests", "customAudiences", "exclusions"].includes(t.id) ? d[t.id] : d.targeting?.[t.id] ?? [];
		if (v.length) rows.push([t.label, v.join(", ")]);
	}
	if (C.placements) rows.push(["Placements", Array.isArray(d.placements) ? d.placements.map((x) => optionLabel(C.placements.options, x)).join(", ") : C.placements.automatic]);
	if (bidLevel(net, camp.data.budget.level) === "adset") rows.push(["Bid strategy", bidText(net, camp.data.campaignType, d.bidStrategy, d.bidAmount, camp.data.budget.currency) || "—"]);
	if (d.budget) rows.push(["Budget", money(d.budget)]);
	return rows;
}
