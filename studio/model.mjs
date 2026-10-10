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
		return { name: "New campaign", platforms: [platform], objective: "traffic", budget: { type: "daily", amount: 50, currency: "USD", level: "campaign" }, schedule: { start: "", end: "" }, kpi: "", notes: "" };
	if (type === "adset")
		return { name: "New ad set", locations: ["United States"], ageMin: 18, ageMax: 65, genders: "all", languages: [], interests: [], customAudiences: [], exclusions: [], placements: "automatic", budget: null, optimization: "", notes: "" };
	return {
		name: "New ad",
		platform,
		format: firstFormat(platform),
		...LOREM,
		cta: PLATFORMS[platform]?.ctas[0] ?? "Learn more",
		url: "https://example.com",
		displayUrl: "example.com",
		media: [],
		cards: [],
		notes: "",
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
		}
		if (n.type === "adset") for (const k of ["locations", "languages", "interests", "customAudiences", "exclusions"]) data[k] = arr(data[k]);
		if (n.type === "ad") {
			if (!PLATFORMS[data.platform]) errors.push(`${id}: unknown platform "${data.platform}" (use ${Object.keys(PLATFORMS).join(", ")})`);
			else if (!PLATFORMS[data.platform].formats[data.format]) data.format = firstFormat(data.platform);
			data.media = Array.isArray(data.media) ? data.media.filter((m) => m && typeof m.src === "string") : [];
			data.cards = Array.isArray(data.cards) ? data.cards : [];
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
