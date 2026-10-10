// The plan model, shared by the canvas (browser), the server and the CLI: the platform catalog, defaults, normalize()
// (shape + validation) and lint() (the instant checks that run before Claude's review). Pure functions, no I/O.
//
// A plan holds any number of campaign trees: campaign (objective) → ad set (audience) → ad (creative). Each node keeps
// its parent id; the canvas draws the edges from that. Platform catalogs drift: update PLATFORMS when a network renames
// an objective or changes a limit.

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
		ctas: ["Learn more", "Shop now", "Sign up", "Get quote", "Book now", "Contact us", "Download", "Apply now"],
		limits: { headline: 30, headline2: 30, description: 90 },
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
		levels: ["Campaign group", "Campaign", "Ad"],
		objectives: { awareness: "Brand awareness", traffic: "Website visits", engagement: "Engagement", video_views: "Video views", leads: "Lead generation", app: "Website visits*", sales: "Website conversions" },
		formats: {
			single_image: { name: "Single image", ratio: [191, 100], size: "1200×627" },
			li_carousel: { name: "Carousel", ratio: [1, 1], size: "1080×1080", cards: true },
		},
		ctas: ["Learn more", "Sign up", "Register", "Download", "Request demo", "Apply", "Subscribe", "Join"],
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
		ctas: ["More", "Shop now", "Sign up", "Book now", "Get now", "Install now", "Watch", "Apply now"],
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
export const FIELD_LABEL = { primaryText: "Primary text", headline: "Headline", headline2: "Headline 2", description: "Description", brandName: "Brand name" };

export const uid = (prefix = "n") => `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
export const firstFormat = (platform) => Object.keys(PLATFORMS[platform]?.formats ?? {})[0] ?? null;

export function nodeDefaults(type, platform = "meta") {
	if (type === "campaign")
		return { name: "New campaign", label: "", funnel: "", platforms: [platform], objective: "traffic", budget: { type: "daily", amount: 50, currency: "USD", level: "campaign" }, schedule: { start: "", end: "" }, kpi: "", notes: "" };
	if (type === "adset")
		return { name: "New ad set", label: "", locations: ["United States"], ageMin: 18, ageMax: 65, genders: "all", languages: [], interests: [], customAudiences: [], exclusions: [], placements: "automatic", budget: null, optimization: "", notes: "" };
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
		notes: "",
		// produced: designed or generated by the team (Claude can make it). ugc: shot by a creator, so the mock keeps a
		// placeholder and notes hold the creator brief. prompt: the generation prompt or shot list for produced creative.
		creative: "produced",
		prompt: "",
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
		if (n.type === "campaign") {
			data.platforms = arr(data.platforms).filter((p) => PLATFORMS[p]);
			if (!OBJECTIVES[data.objective]) errors.push(`${id}: unknown objective "${data.objective}" (use ${Object.keys(OBJECTIVES).join(", ")})`);
			data.budget = { ...nodeDefaults("campaign").budget, ...(data.budget ?? {}) };
			data.schedule = { start: "", end: "", ...(data.schedule ?? {}) };
			if (n.data?.funnel === undefined) data.funnel = inferFunnel(str(data.name));
			if (!FUNNEL[data.funnel]) data.funnel = "";
		}
		if (n.type === "adset") for (const k of ["locations", "languages", "interests", "customAudiences", "exclusions"]) data[k] = arr(data[k]);
		if (n.type === "ad") {
			if (!PLATFORMS[data.platform]) errors.push(`${id}: unknown platform "${data.platform}" (use ${Object.keys(PLATFORMS).join(", ")})`);
			else if (!PLATFORMS[data.platform].formats[data.format]) data.format = firstFormat(data.platform);
			data.media = Array.isArray(data.media) ? data.media.filter((m) => m && typeof m.src === "string") : [];
			data.cards = Array.isArray(data.cards) ? data.cards : [];
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
	if (plan.settings.naming.auto && !errors.length) applyNaming(plan);
	return { plan, errors };
}

export const childrenOf = (plan, id) => plan.nodes.filter((n) => n.parent === id);
export const nodeById = (plan, id) => plan.nodes.find((n) => n.id === id);
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
export function lint(plan) {
	const out = [];
	const add = (node, severity, text) => out.push({ node, severity, text, source: "check" });
	const campaigns = plan.nodes.filter((n) => n.type === "campaign");
	if (!campaigns.length) add(null, "error", "The plan has no campaign. Drag one in from the left.");
	const bp = budgetPlan(plan.settings);
	if (bp.monthly) {
		const cur = bp.currency;
		const have = { campaign: campaigns.length, adset: plan.nodes.filter((n) => n.type === "adset").length, ad: plan.nodes.filter((n) => n.type === "ad").length };
		if (have.adset > bp.adsets) add(null, "warn", `${have.adset} ad sets on ${cur} ${bp.monthly.toLocaleString()}/month: about ${bp.adsets} can each get enough spend to leave learning. Merge or pause the rest.`);
		if (have.ad > Math.ceil(bp.ads * 1.25)) add(null, "warn", `${have.ad} ads on this budget: about ${bp.ads} can each get enough spend to read a result. Test fewer, more different angles.`);
		if (have.campaign > Math.max(bp.campaigns, 1)) add(null, "info", `${have.campaign} campaigns; the budget funds about ${bp.campaigns} funnel stage${bp.campaigns === 1 ? "" : "s"} on its own.`);
	}
	for (const n of plan.nodes) {
		const d = n.data;
		const kids = childrenOf(plan, n.id);
		if (n.type === "campaign") {
			if (!d.platforms.length) add(n.id, "error", "Pick at least one ad network.");
			if (!kids.length) add(n.id, "warn", "No ad sets yet: add an audience.");
			if (!(Number(d.budget.amount) > 0)) add(n.id, "warn", "No budget set.");
			else if (d.budget.type === "daily" && kids.length && Number(d.budget.amount) / kids.length < 10)
				add(n.id, "warn", `${d.budget.currency} ${(Number(d.budget.amount) / kids.length).toFixed(0)}/day per ad set is thin: most networks need more to exit learning.`);
			if (d.objective === "awareness" && plan.nodes.some((a) => a.type === "ad" && campaignOf(plan, a) === n && a.data.format === "search"))
				add(n.id, "warn", "Awareness objective with search ads: search captures existing demand rather than building awareness.");
			if (d.schedule.start && d.schedule.end && d.schedule.end < d.schedule.start) add(n.id, "error", "End date is before start date.");
			if (bp.monthly && !d.funnel) add(n.id, "info", "Set a funnel stage (TOF, MOF or BOF) to get a suggested budget.");
			const sug = bp.monthly && d.funnel ? suggestedBudget(plan, n) : null;
			if (sug && d.budget.type === "daily" && Number(d.budget.amount) > 0 && Math.abs(Number(d.budget.amount) - sug.amount) / Math.max(sug.amount, 1) > 0.3)
				add(n.id, "info", `The funnel weighting suggests ${sug.currency} ${sug.amount}/day for this campaign (${FUNNEL[d.funnel]} ${sug.stage.weight}%${sug.peers > 1 ? `, split ${sug.peers} ways` : ""}).`);
		}
		if (n.type === "adset") {
			if (!n.parent) add(n.id, "error", "Not connected to a campaign.");
			if (!kids.length) add(n.id, "warn", "No ads yet: add a creative.");
			if (!d.locations.length) add(n.id, "error", "No locations targeted.");
			if (Number(d.ageMin) > Number(d.ageMax)) add(n.id, "error", "Minimum age is above maximum age.");
			if (Number(d.ageMin) < 18) add(n.id, "warn", "Targets under-18s: most networks restrict this and some ban it for many categories.");
			const sib = n.parent ? childrenOf(plan, n.parent).filter((s) => s.id !== n.id) : [];
			const key = (s) => [s.data.locations, s.data.interests, s.data.customAudiences].map((a) => [...a].sort().join("|")).join("/") + `/${s.data.ageMin}-${s.data.ageMax}/${s.data.genders}`;
			const twin = sib.find((s) => key(s) === key(n));
			if (twin) add(n.id, "warn", `Same targeting as "${twin.data.name}": the two will bid against each other.`);
		}
		if (n.type === "ad") {
			if (!n.parent) add(n.id, "error", "Not connected to an ad set.");
			const camp = campaignOf(plan, n);
			const p = PLATFORMS[d.platform];
			if (camp && !camp.data.platforms.includes(d.platform)) add(n.id, "error", `${p?.short ?? d.platform} isn't one of the campaign's networks.`);
			if (p) {
				for (const [field, max] of Object.entries(p.limits)) {
					const len = field === "brandName" ? (plan.brand.name ?? "").length : str(d[field]).length;
					if (len > max) add(n.id, "warn", `${FIELD_LABEL[field] ?? field} is ${len} characters; ${p.short} shows ${max} before truncating.`);
				}
				const f = p.formats[d.format];
				if (f && f.media !== false && !d.media.length && !(f.cards && d.cards.some((c) => c.src))) add(n.id, "info", "Creative is still a placeholder.");
			}
			if (["primaryText", "headline", "headline2", "description"].some((k) => isLorem(d[k]))) add(n.id, "info", "Copy is still lorem ipsum.");
			if (!d.url || d.url === "https://example.com") add(n.id, "warn", "Landing page URL isn't set.");
		}
	}
	return out;
}

// Issues per node, merging the checks with Claude's open feedback.
export function issuesByNode(plan) {
	const map = {};
	for (const i of [...lint(plan), ...plan.feedback.items.filter((f) => !f.resolved).map((f) => ({ ...f, source: "claude" }))]) (map[i.node ?? "plan"] ??= []).push(i);
	return map;
}

export function adsetSummary(d) {
	const parts = [d.locations.slice(0, 2).join(", ") + (d.locations.length > 2 ? ` +${d.locations.length - 2}` : "")];
	parts.push(`${d.ageMin}–${d.ageMax}${Number(d.ageMax) >= 65 ? "+" : ""}`);
	if (d.genders && d.genders !== "all") parts.push(d.genders);
	if (d.interests.length) parts.push(`${d.interests.length} interest${d.interests.length > 1 ? "s" : ""}`);
	if (d.customAudiences.length) parts.push(`${d.customAudiences.length} custom`);
	return parts.filter(Boolean).join(" · ");
}

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
	// monthly: the total paid media budget to test with. cpa: expected cost per optimisation event, if known.
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
		objective: OBJECTIVES[camp?.data.objective]?.split(" /")[0] ?? "",
		network: node.type === "ad" ? PLATFORMS[d.platform]?.short ?? "" : networkName(camp?.data.platforms ?? []),
		date: (camp?.data.schedule?.start || new Date().toISOString()).slice(0, 7).replace("-", ""),
		label: labelOf(node, s.naming[node.type]),
	};
	if (node.type === "campaign") t.seq = cSeq;
	if (node.type === "adset") Object.assign(t, { seq: aSeq, geo: d.locations?.[0] ?? "", optimization: shortOpt(d.optimization) });
	if (node.type === "ad") Object.assign(t, { seq: `${aSeq}.${letter}`, letter, format: PLATFORMS[d.platform]?.formats[d.format]?.name.split(" (")[0] ?? "", cta: d.cta ?? "" });
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

// How much structure a test budget can carry. Each ad set needs about TESTING.eventsPerWeek optimisation events a week
// to leave learning (Meta's rule; the others are similar), or at least TESTING.minAdsetDaily a day when the cost per
// event isn't known, and each ad needs enough spend to be read. The funnel weights split the budget by stage.
export function budgetPlan(settings) {
	const s = normalizeSettings(settings);
	const { monthly, cpa, currency } = s.budget;
	const totalW = Object.values(s.funnel).reduce((a, b) => a + b, 0) || 1;
	const perAdsetDaily = Math.max(TESTING.minAdsetDaily, cpa ? (TESTING.eventsPerWeek * cpa) / 7 : 0);
	const notes = [];
	const stages = Object.keys(FUNNEL).map((key) => {
		const share = s.funnel[key] / totalW;
		const daily = (monthly * share * 12) / 365;
		const adsets = s.funnel[key] > 0 ? Math.min(6, Math.floor(daily / perAdsetDaily)) : 0;
		const ads = adsets ? Math.max(TESTING.minAdsPerAdset, Math.min(TESTING.maxAdsPerAdset, Math.floor(daily / adsets / TESTING.minAdDaily))) : 0;
		return { key, label: FUNNEL[key], weight: s.funnel[key], share, monthly: monthly * share, daily, adsets, ads };
	});
	if (!monthly) return { currency, monthly, daily: 0, perAdsetDaily, stages, campaigns: 0, adsets: 0, ads: 0, notes: ["Set a monthly test budget to size the structure."] };
	const funded = stages.filter((st) => st.adsets > 0);
	if (funded.length) for (const st of stages.filter((st) => st.weight > 0 && !st.adsets))
		notes.push(`${st.label} gets ${currency} ${Math.round(st.daily)}/day, under one ad set's ${currency} ${Math.round(perAdsetDaily)}/day: fold it into ${funded[0]?.label ?? "a single campaign"} or raise its weight.`);
	if (!funded.length) {
		notes.push(cpa ? `At ${currency} ${cpa} per event, one ad set needs about ${currency} ${Math.round(perAdsetDaily)}/day to leave learning. Run one campaign with one ad set, or optimise for a cheaper event higher in the funnel.` : "Run one campaign with one broad ad set until the budget grows.");
		const all = (monthly * 12) / 365;
		return { currency, monthly, daily: all, perAdsetDaily, stages, campaigns: 1, adsets: 1, ads: Math.max(TESTING.minAdsPerAdset, Math.min(TESTING.maxAdsPerAdset, Math.floor(all / TESTING.minAdDaily))), notes };
	}
	const adsets = funded.reduce((a, st) => a + st.adsets, 0);
	return { currency, monthly, daily: (monthly * 12) / 365, perAdsetDaily, stages, campaigns: funded.length, adsets, ads: funded.reduce((a, st) => a + st.adsets * st.ads, 0), notes };
}
// A campaign's suggested daily budget: its stage's share, split evenly across the campaigns in that stage.
export function suggestedBudget(plan, camp) {
	const bp = budgetPlan(plan.settings);
	const st = bp.stages.find((x) => x.key === camp.data.funnel);
	if (!bp.monthly || !st) return null;
	const peers = plan.nodes.filter((n) => n.type === "campaign" && n.data.funnel === camp.data.funnel).length || 1;
	return { amount: Math.round(st.daily / peers), currency: bp.currency, stage: st, peers };
}
export const inferFunnel = (name) => (/\bTOF\b|prospect|acquisition|cold/i.test(name) ? "tof" : /\bMOF\b|nurture|consideration|engaged/i.test(name) ? "mof" : /\bBOF\b|retarget|remarket|conversion|high[- ]intent/i.test(name) ? "bof" : "");
export function budgetSummary(plan) {
	const bp = budgetPlan(plan.settings);
	if (!bp.monthly) return "No test budget set (Settings).";
	const have = ["campaign", "adset", "ad"].map((t) => plan.nodes.filter((n) => n.type === t).length);
	return [
		`Test budget ${bp.currency} ${bp.monthly.toLocaleString()}/month (about ${bp.currency} ${Math.round(bp.daily)}/day), split ${bp.stages.map((s) => `${s.label} ${s.weight}%`).join(" / ")}.`,
		`It can carry about ${bp.campaigns} campaign${bp.campaigns === 1 ? "" : "s"}, ${bp.adsets} ad set${bp.adsets === 1 ? "" : "s"} and ${bp.ads} ads at ${bp.currency} ${Math.round(bp.perAdsetDaily)}+/day per ad set: ${bp.stages.filter((s) => s.adsets).map((s) => `${s.label} ${s.adsets} ad set${s.adsets === 1 ? "" : "s"} × ${s.ads} ads (${bp.currency} ${Math.round(s.daily)}/day)`).join(", ") || "one campaign, one ad set"}. The plan has ${have[0]} / ${have[1]} / ${have[2]}.`,
		...bp.notes,
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
