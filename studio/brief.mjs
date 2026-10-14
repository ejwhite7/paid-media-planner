// The hand-off brief: what a reviewer approves and what the person building it in each ads manager follows. One
// renderer for the canvas's Brief view and the exported pack, plus CSV (a build sheet, one row per ad per network) and
// Markdown (for Slack, email or a doc).
import { FUNNEL, OBJECTIVES, PLATFORMS, STATUS_LABEL, TYPES, FIELD_LABEL, adFormatLabel, autoPlaced, mediaLabel, textOptions, adsetFacts, adsetSummary, budgetPlan, budgetSummary, campaignFacts, childrenOf, goalLabel, issueKey, issuesByNode, money, objectiveLabel } from "./model.mjs";
import { esc, renderMock } from "./mocks.mjs";

const list = (a) => (a?.length ? a.join(", ") : "—");
const gender = (g) => ({ all: "All", male: "Men", female: "Women" })[g] ?? g ?? "All";
const pill = (status) => `<span class="st st-${status}">${STATUS_LABEL[status] ?? status}</span>`;
const who = (n) => (n.assignee ? `<span class="who">@${esc(n.assignee)}</span>` : "");
const kvRows = (rows) => rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
const SEV = { error: "Blocker", warn: "Fix", info: "Note", good: "Good" };

function copyRows(ad, ed) {
	const p = PLATFORMS[ad.data.platform];
	const fields = ad.data.format === "search" ? ["headline", "headline2", "description"] : ["primaryText", "headline", "description"].filter((f) => f !== "description" || p?.limits.description);
	const EXTRA = { primaryText: "extraPrimaryTexts", headline: "extraHeadlines", description: "extraDescriptions" };
	const row = (label, path, v, f) => {
		const max = p?.limits[f];
		return `<tr><th>${label}</th><td>${ed ? ed(ad.id, path, v, { multi: f === "primaryText" || f === "description" }) : esc(v) || "—"}</td><td class="num ${max && v.length > max ? "over" : ""}" data-max="${max ?? ""}">${v.length}${max ? `/${max}` : ""}</td></tr>`;
	};
	return fields
		.map((f) => {
			const extras = p?.options && ad.data.format !== "search" ? ad.data[EXTRA[f]] ?? [] : [];
			const n = extras.length ? " 1" : "";
			return row(FIELD_LABEL[f] + n, f, ad.data[f] ?? "", f) + extras.map((v, i) => row(`${FIELD_LABEL[f]} ${i + 2}`, `${EXTRA[f]}.${i}`, v ?? "", f)).join("");
		})
		.join("");
}

// What a ✕ on a note removes: a Claude feedback item by index, or a check by its key.
export const dismissId = (i) => (i.source === "claude" ? `fb:${i.fb}` : `chk:${issueKey(i)}`);
export function renderBrief(plan, { interactive = false, editable = false } = {}) {
	// ed(): a field the reviewer can rewrite in place in the canvas's Brief view. node is a node id or "plan"; the
	// export pack renders the same text, not editable.
	const ed = (node, path, value, { multi = false, ph = "" } = {}) =>
		editable ? `<span class="ed" data-bnode="${node}" data-bfield="${path}"${multi ? " data-multi" : ""} data-ph="${esc(ph)}" contenteditable="plaintext-only" spellcheck="true">${esc(value ?? "")}</span>` : esc(value ?? "");
	const issues = issuesByNode(plan);
	const campaigns = plan.nodes.filter((n) => n.type === "campaign");
	const ads = plan.nodes.filter((n) => n.type === "ad");
	const networks = [...new Set(campaigns.flatMap((c) => c.data.platforms))];
	const daily = campaigns.filter((c) => c.data.budget.type === "daily").reduce((a, c) => a + (Number(c.data.budget.amount) || 0), 0);
	const open = Object.values(issues).flat();
	const blockers = open.filter((i) => i.severity === "error").length;
	const fb = plan.feedback;
	const check = (key, label) => `<label class="chk"><input type="checkbox" data-check="${esc(key)}"> <span>${label}</span></label>`;
	const issueList = (items) =>
		items.length
			? `<ul class="iss">${items.map((i) => `<li class="sev-${i.severity}"><b>${SEV[i.severity] ?? i.severity}</b> ${esc(i.text)}${i.suggestion ? `<div class="sugg">→ ${esc(i.suggestion)}</div>` : ""}${i.source === "claude" ? "" : "<small>Check</small>"}${editable ? `<button class="iss-x" data-dismiss-issue="${esc(dismissId(i))}" title="Remove this note">✕</button>` : ""}</li>`).join("")}</ul>`
			: "";

	let h = `<article class="brief">
<header class="b-head">
	<div><div class="eyebrow">Campaign plan · ${pill(plan.status)}</div><h1>${ed("plan", "name", plan.name)}</h1>
	<p class="meta">${esc(plan.brand.name)}${plan.owner ? ` · Owner @${esc(plan.owner)}` : ""} · Updated ${new Date(plan.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p></div>
</header>
<section class="stats">
	<div><b>${campaigns.length}</b><span>campaign${campaigns.length === 1 ? "" : "s"}</span></div>
	<div><b>${plan.nodes.filter((n) => n.type === "adset").length}</b><span>ad sets</span></div>
	<div><b>${ads.length}</b><span>ads</span></div>
	<div><b>${networks.length}</b><span>${networks.map((p) => PLATFORMS[p].short).join(", ") || "networks"}</span></div>
	<div><b>${daily ? `${campaigns[0]?.data.budget.currency ?? "USD"} ${daily.toLocaleString()}` : "—"}</b><span>daily budget</span></div>
	<div class="${blockers ? "bad" : ""}"><b>${blockers}</b><span>blocker${blockers === 1 ? "" : "s"}</span></div>
</section>`;
	if (plan.brief || editable) h += `<section><h2>Brief</h2><p class="pre">${ed("plan", "brief", plan.brief, { multi: true, ph: "Product, offer, audience, budget, what success looks like." })}</p></section>`;
	if (fb.summary || issues.plan?.length)
		h += `<section class="review"><h2>Review${fb.at ? ` <small>${new Date(fb.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</small>` : ""}</h2>${fb.summary ? `<p class="pre">${ed("plan", "feedback.summary", fb.summary, { multi: true })}</p>` : ""}${issueList(issues.plan ?? [])}</section>`;

	for (const c of campaigns) {
		const d = c.data;
		h += `<section class="camp" id="b-${c.id}">
<h2><span class="lvl lvl-campaign">Campaign</span> ${esc(d.name)} ${pill(c.status)} ${who(c)}</h2>
<table class="kv">
	${kvRows(campaignFacts(c))}
	${d.funnel ? `<tr><th>Funnel stage</th><td>${FUNNEL[d.funnel]}</td></tr>` : ""}
	<tr><th>Schedule</th><td>${d.schedule.start || "Start on approval"} → ${d.schedule.end || "Ongoing"}</td></tr>
	${d.kpi || editable ? `<tr><th>KPI</th><td>${ed(c.id, "kpi", d.kpi)}</td></tr>` : ""}
	${d.notes || editable ? `<tr><th>Notes</th><td class="pre">${ed(c.id, "notes", d.notes, { multi: true })}</td></tr>` : ""}
</table>
${issueList(issues[c.id] ?? [])}`;
		for (const s of childrenOf(plan, c.id)) {
			const a = s.data;
			h += `<div class="adset" id="b-${s.id}">
<h3><span class="lvl lvl-adset">Ad set</span> ${esc(a.name)} ${pill(s.status)} ${who(s)}</h3>
<table class="kv">
	${kvRows(adsetFacts(plan, s))}
	${a.notes || editable ? `<tr><th>Notes</th><td class="pre">${ed(s.id, "notes", a.notes, { multi: true })}</td></tr>` : ""}
</table>
${issueList(issues[s.id] ?? [])}
<div class="ads">`;
			for (const ad of childrenOf(plan, s.id))
				h += `<div class="ad" id="b-${ad.id}">
	<div class="ad-mock">${renderMock(ad.data, plan.brand)}</div>
	<div class="ad-info"><h4>${esc(ad.data.name)} ${pill(ad.status)} ${who(ad)}</h4><div class="fmt">${esc(adFormatLabel(plan, ad))}${ad.data.creative === "ugc" ? " · creator (UGC)" : ""}</div>
	<table class="kv copy">${copyRows(ad, editable && ed)}<tr><th>CTA</th><td>${esc(ad.data.cta)}</td><td></td></tr><tr><th>URL</th><td class="url">${ed(ad.id, "url", ad.data.url)}</td><td></td></tr></table>
	${ad.data.notes || editable ? `<p class="pre note">${ed(ad.id, "notes", ad.data.notes, { multi: true, ph: ad.data.creative === "ugc" ? "Creator brief" : "Creative direction" })}</p>` : ""}
	${issueList(issues[ad.id] ?? [])}</div>
</div>`;
			h += `</div></div>`;
		}
		h += `</section>`;
	}

	// Build checklist: one block per network, in the order someone works through an ads manager.
	h += `<section class="build"><h2>Build checklist</h2><p class="meta">Tick as you go${interactive ? "" : " (ticks are saved in this browser)"}. Names match the plan above, so the ads manager mirrors it.</p><div class="build-grid">`;
	for (const p of networks) {
		const P = PLATFORMS[p];
		h += `<div class="net"><h3><i class="dot" style="background:${P.color}"></i>${P.name}</h3>`;
		for (const c of campaigns.filter((c) => c.data.platforms.includes(p))) {
			const obj = objectiveLabel(c);
			h += check(`${p}:${c.id}`, `${P.levels[0]} <b>${esc(c.data.name)}</b>, objective <b>${esc(obj)}</b>, ${money(c.data.budget)}`);
			for (const s of childrenOf(plan, c.id)) {
				h += `<div class="ind">${check(`${p}:${s.id}`, `${P.levels[1]} <b>${esc(s.data.name)}</b>: ${esc(adsetSummary(s.data, p))}${s.data.optimization ? ` · ${esc(goalLabel(plan, s))}` : ""}`)}`;
				for (const ad of childrenOf(plan, s.id).filter((a) => a.data.platform === p)) h += `<div class="ind">${check(`${p}:${ad.id}`, `${P.levels[2]} <b>${esc(ad.data.name)}</b> (${esc(autoPlaced(plan, ad) ? mediaLabel(ad.data) : P.formats[ad.data.format]?.name ?? ad.data.format)})`)}</div>`;
				h += `</div>`;
			}
		}
		h += check(`${p}:tracking`, "Pixel / conversion tracking verified, UTMs on every URL");
		h += check(`${p}:review`, "Submitted, passed platform review, screenshots of live ads added to the plan");
		h += `</div>`;
	}
	h += `</div></section></article>`;
	return h;
}

const cell = (v) => {
	const s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// One row per ad: the build sheet, for CSV and the workbook's Ads sheet.
// One row per ad with every setting as the network names it: the build sheet, for CSV and the workbook's Ads sheet.
const TARGET_FACTS = new Set(["Locations", "Languages", "Conversion location", "Performance goal", "Conversion goal", "Age", "Gender", "Placements", "Bid strategy", "Budget"]);
export function buildSheet(plan) {
	const cols = ["Network", "Campaign", "Objective", "Campaign type", "Special ad category", "Campaign budget", "Campaign bid strategy", "Start", "End", "Ad set", "Locations", "Languages", "Conversion location", "Performance goal", "Age", "Gender", "Targeting", "Placements", "Ad set bid strategy", "Ad set budget", "Ad", "Format", "Primary text", "Headlines", "Descriptions", "Paths", "CTA", "URL", "Display URL", "Media", "Status", "Assignee"];
	const rows = [cols];
	for (const ad of plan.nodes.filter((n) => n.type === "ad")) {
		const s = plan.nodes.find((n) => n.id === ad.parent);
		const c = s && plan.nodes.find((n) => n.id === s.parent);
		const P = PLATFORMS[ad.data.platform];
		const d = ad.data;
		const cf = Object.fromEntries(c ? campaignFacts(c) : []);
		const sfRows = s && c ? adsetFacts(plan, s) : [];
		const sf = Object.fromEntries(sfRows);
		const search = d.format === "search";
		rows.push([
			P?.name ?? d.platform, c?.data.name ?? "", cf.Objective ?? "", cf["Campaign type"] ?? "", cf["Special ad category"] ?? "", cf.Budget ?? "", cf["Bid strategy"] ?? "", c?.data.schedule.start ?? "", c?.data.schedule.end ?? "",
			s?.data.name ?? "", sf.Locations ?? cf.Locations ?? "", sf.Languages ?? cf.Languages ?? "", sf["Conversion location"] ?? "", sf["Performance goal"] ?? sf["Conversion goal"] ?? "", sf.Age ?? "", sf.Gender ?? "",
			sfRows.filter(([k]) => !TARGET_FACTS.has(k)).map(([k, v]) => `${k}: ${v}`), sf.Placements ?? "", sf["Bid strategy"] ?? "", sf.Budget ?? "",
			d.name, autoPlaced(plan, ad) ? mediaLabel(d) : P?.formats[d.format]?.name ?? d.format, search ? "" : textOptions(d, "primaryText"), (search ? [d.headline, d.headline2, ...d.extraHeadlines] : textOptions(d, "headline")).filter(Boolean), (search ? [d.description, ...d.extraDescriptions] : textOptions(d, "description")).filter(Boolean), search ? [d.path1, d.path2].filter(Boolean).join("/") : "",
			search ? "" : d.cta, d.url, d.displayUrl,
			[...d.media, ...d.cards].map((m) => m?.name || (m?.src?.startsWith("data:") ? "embedded" : m?.src)).filter(Boolean), STATUS_LABEL[ad.status], ad.assignee,
		]);
	}
	return rows;
}
export const renderCsv = (plan) => buildSheet(plan).map((r) => r.map(cell).join(",")).join("\n") + "\n";

// The workbook: a summary, then one sheet per level, the build sheet and the open checks. Pure rows; tools/xlsx.mjs
// writes the file.
export function workbookSheets(plan) {
	const camps = plan.nodes.filter((n) => n.type === "campaign");
	const sets = plan.nodes.filter((n) => n.type === "adset");
	const ads = plan.nodes.filter((n) => n.type === "ad");
	const name = (id) => plan.nodes.find((n) => n.id === id)?.data.name ?? "";
	const bp = budgetPlan(plan.settings);
	const summary = [
		["Paid media plan", plan.name],
		["Brand", plan.brand.name],
		["Networks", plan.viewOf ? PLATFORMS[plan.viewOf].name : [...new Set(camps.flatMap((c) => c.data.platforms))].map((p) => PLATFORMS[p].name).join(", ")],
		["Status", STATUS_LABEL[plan.status]],
		["Owner", plan.owner],
		["Campaigns / ad sets / ads", `${camps.length} / ${sets.length} / ${ads.length}`],
		["Exported", new Date().toISOString().slice(0, 16).replace("T", " ")],
		[],
		["Brief", plan.brief],
		[],
		["Test budget", bp.monthly ? budgetSummary(plan) : "Not set"],
		[],
		["Funnel stage", "Weight %", `Monthly (${bp.currency})`, `Daily (${bp.currency})`, "Testable ad sets", "Ads per ad set", "Campaigns in plan"],
		...bp.stages.map((s) => [s.label, s.weight, bp.monthly ? Math.round(s.monthly) : null, bp.monthly ? Math.round(s.daily) : null, s.adsets, s.ads, camps.filter((c) => c.data.funnel === s.key).length]),
	];
	const campaigns = [
		["Campaign", "Network", "Funnel stage", "Objective", "Campaign type", "Special ad category", "Daily budget", "Currency", "Budget level", "Bid strategy", "Start", "End", "KPI", "Ad sets", "Ads", "Status", "Assignee", "Notes"],
		...camps.map((c) => {
			const d = c.data;
			const f = Object.fromEntries(campaignFacts(c));
			const kids = childrenOf(plan, c.id);
			return [d.name, f.Network, FUNNEL[d.funnel] ?? "", f.Objective, f["Campaign type"] ?? "", f["Special ad category"] ?? "", Number(d.budget.amount) || null, d.budget.currency, (f.Budget ?? "").split(" · ")[1] ?? "", f["Bid strategy"] ?? "", d.schedule.start, d.schedule.end, d.kpi, kids.length, kids.reduce((a, s) => a + childrenOf(plan, s.id).length, 0), STATUS_LABEL[c.status], c.assignee, d.notes];
		}),
	];
	const adsets = [
		["Campaign", "Ad set", "Settings", "Ads", "Status", "Assignee", "Notes"],
		...sets.map((s) => [name(s.parent), s.data.name, adsetFacts(plan, s).map(([k, v]) => `${k}: ${v}`).join("\n"), childrenOf(plan, s.id).length, STATUS_LABEL[s.status], s.assignee, s.data.notes]),
	];
	const sheet = buildSheet(plan);
	sheet[0].push("Creative by", "Generation prompt", "Creative notes");
	ads.forEach((ad, i) => sheet[i + 1].push(ad.data.creative === "ugc" ? "Creator (UGC)" : "Produced", ad.data.prompt, ad.data.notes));
	const issues = issuesByNode(plan);
	const checks = [["Severity", "Where", "Issue", "Suggestion", "From"], ...Object.entries(issues).flatMap(([id, list]) => list.map((i) => [{ error: "Blocker", warn: "Fix", info: "Note", good: "Good" }[i.severity] ?? i.severity, id === "plan" ? "Plan" : name(id), i.text, i.suggestion ?? "", i.source === "claude" ? "Claude" : "Check"]))];
	// Bold the summary's labels and give its funnel table a header row.
	for (const r of summary) if (r.length && typeof r[0] === "string") r[0] = { v: r[0], style: r[0] === "Funnel stage" ? "head" : "label" };
	const head = summary.find((r) => r[0]?.style === "head");
	for (let i = 1; i < head.length; i++) head[i] = { v: head[i], style: "head" };
	return [
		{ name: "Summary", rows: summary, header: false },
		{ name: "Campaigns", rows: campaigns },
		{ name: "Ad sets", rows: adsets },
		{ name: "Ads (build sheet)", rows: sheet },
		{ name: "Checks", rows: checks },
	];
}

export function renderMarkdown(plan) {
	const L = [`# ${plan.name}`, "", `${STATUS_LABEL[plan.status]} · ${plan.brand.name}${plan.owner ? ` · owner @${plan.owner}` : ""}`, ""];
	if (plan.brief) L.push(plan.brief, "");
	if (plan.feedback.summary) L.push("## Review", "", plan.feedback.summary, "");
	for (const c of plan.nodes.filter((n) => n.type === "campaign")) {
		const d = c.data;
		L.push(`## ${TYPES.campaign.label}: ${d.name} (${STATUS_LABEL[c.status]}${c.assignee ? `, @${c.assignee}` : ""})`, "");
		if (d.funnel) L.push(`- Funnel stage: ${FUNNEL[d.funnel]}`);
		for (const [k, v] of campaignFacts(c)) L.push(`- ${k}: ${v}`);
		L.push(`- Schedule: ${d.schedule.start || "on approval"} → ${d.schedule.end || "ongoing"}`);
		if (d.kpi) L.push(`- KPI: ${d.kpi}`);
		L.push("");
		for (const s of childrenOf(plan, c.id)) {
			L.push(`### Ad set: ${s.data.name}`, "", ...adsetFacts(plan, s).map(([k, v]) => `- ${k}: ${v}`), "");
			for (const ad of childrenOf(plan, s.id)) {
				const d = ad.data;
				L.push(`- **${d.name}** · ${adFormatLabel(plan, ad)} · ${STATUS_LABEL[ad.status]}`);
				if (d.format !== "search") textOptions(d, "primaryText").forEach((t, i, a) => L.push(`  - Text${a.length > 1 ? ` ${i + 1}` : ""}: ${t}`));
				if (d.format === "search") L.push(`  - Headline: ${d.headline} | ${d.headline2}`);
				else textOptions(d, "headline").forEach((t, i, a) => L.push(`  - Headline${a.length > 1 ? ` ${i + 1}` : ""}: ${t}`));
				if (d.description) L.push(`  - Description: ${d.description}`);
				L.push(`  - CTA: ${d.cta} → ${d.url}`);
			}
			L.push("");
		}
	}
	return L.join("\n");
}
