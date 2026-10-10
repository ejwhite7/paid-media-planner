// The hand-off brief: what a reviewer approves and what the person building it in each ads manager follows. One
// renderer for the canvas's Brief view and the exported pack, plus CSV (a build sheet, one row per ad per network) and
// Markdown (for Slack, email or a doc).
import { FUNNEL, OBJECTIVES, PLATFORMS, STATUS_LABEL, TYPES, FIELD_LABEL, adsetSummary, budgetPlan, budgetSummary, childrenOf, issuesByNode, money } from "./model.mjs";
import { esc, formatLabel, renderMock } from "./mocks.mjs";

const list = (a) => (a?.length ? a.join(", ") : "—");
const gender = (g) => ({ all: "All", male: "Men", female: "Women" })[g] ?? g ?? "All";
const pill = (status) => `<span class="st st-${status}">${STATUS_LABEL[status] ?? status}</span>`;
const who = (n) => (n.assignee ? `<span class="who">@${esc(n.assignee)}</span>` : "");
const SEV = { error: "Blocker", warn: "Fix", info: "Note", good: "Good" };

function copyRows(ad) {
	const p = PLATFORMS[ad.data.platform];
	const fields = ad.data.format === "search" ? ["headline", "headline2", "description"] : ["primaryText", "headline", "description"].filter((f) => f !== "description" || p?.limits.description);
	return fields
		.map((f) => {
			const v = ad.data[f] ?? "";
			const max = p?.limits[f];
			return `<tr><th>${FIELD_LABEL[f]}</th><td>${esc(v) || "—"}</td><td class="num ${max && v.length > max ? "over" : ""}">${v.length}${max ? `/${max}` : ""}</td></tr>`;
		})
		.join("");
}

export function renderBrief(plan, { interactive = false } = {}) {
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
			? `<ul class="iss">${items.map((i) => `<li class="sev-${i.severity}"><b>${SEV[i.severity] ?? i.severity}</b> ${esc(i.text)}${i.suggestion ? `<div class="sugg">→ ${esc(i.suggestion)}</div>` : ""}<small>${i.source === "claude" ? "Claude" : "Check"}</small></li>`).join("")}</ul>`
			: "";

	let h = `<article class="brief">
<header class="b-head">
	<div><div class="eyebrow">Campaign plan · ${pill(plan.status)}</div><h1>${esc(plan.name)}</h1>
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
	if (plan.brief) h += `<section><h2>Brief</h2><p class="pre">${esc(plan.brief)}</p></section>`;
	if (plan.settings?.budget.monthly) h += `<section><h2>Test budget</h2><p class="pre">${esc(budgetSummary(plan))}</p></section>`;
	if (fb.summary || issues.plan?.length)
		h += `<section class="review"><h2>Review${fb.at ? ` <small>Claude · ${new Date(fb.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</small>` : ""}</h2>${fb.summary ? `<p class="pre">${esc(fb.summary)}</p>` : ""}${issueList(issues.plan ?? [])}</section>`;

	for (const c of campaigns) {
		const d = c.data;
		h += `<section class="camp" id="b-${c.id}">
<h2><span class="lvl lvl-campaign">Campaign</span> ${esc(d.name)} ${pill(c.status)} ${who(c)}</h2>
<table class="kv">
	<tr><th>Objective</th><td>${OBJECTIVES[d.objective] ?? d.objective}</td></tr>
	${d.funnel ? `<tr><th>Funnel stage</th><td>${FUNNEL[d.funnel]}</td></tr>` : ""}
	<tr><th>Budget</th><td>${money(d.budget)}${d.budget.level === "adset" ? " (set per ad set)" : ""}</td></tr>
	<tr><th>Schedule</th><td>${d.schedule.start || "Start on approval"} → ${d.schedule.end || "Ongoing"}</td></tr>
	${d.kpi ? `<tr><th>KPI</th><td>${esc(d.kpi)}</td></tr>` : ""}
	${d.notes ? `<tr><th>Notes</th><td class="pre">${esc(d.notes)}</td></tr>` : ""}
</table>
<table class="grid"><thead><tr><th>Network</th><th>Objective to pick</th><th>Levels there</th></tr></thead><tbody>${d.platforms
			.map((p) => {
				const o = PLATFORMS[p].objectives[d.objective] ?? "—";
				return `<tr><td><i class="dot" style="background:${PLATFORMS[p].color}"></i>${PLATFORMS[p].name}</td><td>${esc(o.replace(/\*$/, ""))}${o.endsWith("*") ? ' <small class="warn">closest match, confirm</small>' : ""}</td><td>${PLATFORMS[p].levels.join(" → ")}</td></tr>`;
			})
			.join("")}</tbody></table>
${issueList(issues[c.id] ?? [])}`;
		for (const s of childrenOf(plan, c.id)) {
			const a = s.data;
			h += `<div class="adset" id="b-${s.id}">
<h3><span class="lvl lvl-adset">Ad set</span> ${esc(a.name)} ${pill(s.status)} ${who(s)}</h3>
<table class="kv">
	<tr><th>Locations</th><td>${esc(list(a.locations))}</td></tr>
	<tr><th>Age · gender</th><td>${a.ageMin}–${a.ageMax}${Number(a.ageMax) >= 65 ? "+" : ""} · ${gender(a.genders)}</td></tr>
	${a.languages.length ? `<tr><th>Languages</th><td>${esc(list(a.languages))}</td></tr>` : ""}
	<tr><th>Interests</th><td>${esc(list(a.interests))}</td></tr>
	<tr><th>Custom audiences</th><td>${esc(list(a.customAudiences))}</td></tr>
	<tr><th>Exclusions</th><td>${esc(list(a.exclusions))}</td></tr>
	<tr><th>Placements</th><td>${esc(a.placements || "Automatic")}</td></tr>
	${a.optimization ? `<tr><th>Optimize for</th><td>${esc(a.optimization)}</td></tr>` : ""}
	${a.budget ? `<tr><th>Budget</th><td>${money(a.budget)}</td></tr>` : ""}
	${a.notes ? `<tr><th>Notes</th><td class="pre">${esc(a.notes)}</td></tr>` : ""}
</table>
${issueList(issues[s.id] ?? [])}
<div class="ads">`;
			for (const ad of childrenOf(plan, s.id))
				h += `<div class="ad" id="b-${ad.id}">
	<div class="ad-mock">${renderMock(ad.data, plan.brand)}</div>
	<div class="ad-info"><h4>${esc(ad.data.name)} ${pill(ad.status)} ${who(ad)}</h4><div class="fmt">${formatLabel(ad.data.platform, ad.data.format)}${ad.data.creative === "ugc" ? " · creator (UGC)" : ""}</div>
	<table class="kv copy">${copyRows(ad)}<tr><th>CTA</th><td>${esc(ad.data.cta)}</td><td></td></tr><tr><th>URL</th><td class="url">${esc(ad.data.url)}</td><td></td></tr></table>
	${ad.data.notes ? `<p class="pre note">${esc(ad.data.notes)}</p>` : ""}
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
			const obj = (P.objectives[c.data.objective] ?? "").replace(/\*$/, "");
			h += check(`${p}:${c.id}`, `${P.levels[0]} <b>${esc(c.data.name)}</b>, objective <b>${esc(obj)}</b>, ${money(c.data.budget)}`);
			for (const s of childrenOf(plan, c.id)) {
				h += `<div class="ind">${check(`${p}:${s.id}`, `${P.levels[1]} <b>${esc(s.data.name)}</b>: ${esc(adsetSummary(s.data))}`)}`;
				for (const ad of childrenOf(plan, s.id).filter((a) => a.data.platform === p)) h += `<div class="ind">${check(`${p}:${ad.id}`, `${P.levels[2]} <b>${esc(ad.data.name)}</b> (${esc(P.formats[ad.data.format]?.name ?? ad.data.format)})`)}</div>`;
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
export function buildSheet(plan) {
	const cols = ["Network", "Campaign", "Objective (network's name)", "Budget", "Start", "End", "Ad set", "Locations", "Age", "Genders", "Languages", "Interests", "Custom audiences", "Exclusions", "Placements", "Ad", "Format", "Primary text", "Headline", "Headline 2", "Description", "CTA", "URL", "Display URL", "Media", "Status", "Assignee"];
	const rows = [cols];
	for (const ad of plan.nodes.filter((n) => n.type === "ad")) {
		const s = plan.nodes.find((n) => n.id === ad.parent);
		const c = s && plan.nodes.find((n) => n.id === s.parent);
		const P = PLATFORMS[ad.data.platform];
		const a = s?.data ?? {};
		const d = ad.data;
		rows.push([
			P?.name ?? d.platform, c?.data.name ?? "", (P?.objectives[c?.data.objective] ?? "").replace(/\*$/, " (confirm)"), c ? money(c.data.budget) : "", c?.data.schedule.start ?? "", c?.data.schedule.end ?? "",
			a.name ?? "", a.locations ?? [], s ? `${a.ageMin}-${a.ageMax}` : "", gender(a.genders), a.languages ?? [], a.interests ?? [], a.customAudiences ?? [], a.exclusions ?? [], a.placements ?? "",
			d.name, P?.formats[d.format]?.name ?? d.format, d.primaryText, d.headline, d.format === "search" ? d.headline2 : "", d.description, d.cta, d.url, d.displayUrl,
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
		["Campaign", "Funnel stage", "Objective", "Networks", "Objective to pick in each network", "Budget type", "Amount", "Currency", "Budget level", "Start", "End", "KPI", "Ad sets", "Ads", "Status", "Assignee", "Notes"],
		...camps.map((c) => {
			const d = c.data;
			const kids = childrenOf(plan, c.id);
			return [d.name, FUNNEL[d.funnel] ?? "", OBJECTIVES[d.objective], d.platforms.map((p) => PLATFORMS[p].short), d.platforms.map((p) => `${PLATFORMS[p].short}: ${PLATFORMS[p].objectives[d.objective]}`), d.budget.type, Number(d.budget.amount) || null, d.budget.currency, d.budget.level === "adset" ? "Ad set (ABO)" : "Campaign (CBO)", d.schedule.start, d.schedule.end, d.kpi, kids.length, kids.reduce((a, s) => a + childrenOf(plan, s.id).length, 0), STATUS_LABEL[c.status], c.assignee, d.notes];
		}),
	];
	const adsets = [
		["Campaign", "Ad set", "Locations", "Age from", "Age to", "Genders", "Languages", "Interests", "Custom audiences", "Exclusions", "Placements", "Optimize for", "Budget", "Ads", "Status", "Assignee", "Notes"],
		...sets.map((s) => {
			const a = s.data;
			return [name(s.parent), a.name, a.locations, Number(a.ageMin), Number(a.ageMax), gender(a.genders), a.languages, a.interests, a.customAudiences, a.exclusions, a.placements, a.optimization, a.budget ? money(a.budget) : "", childrenOf(plan, s.id).length, STATUS_LABEL[s.status], s.assignee, a.notes];
		}),
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
	if (plan.settings?.budget.monthly) L.push("## Test budget", "", budgetSummary(plan), "");
	if (plan.feedback.summary) L.push("## Review", "", plan.feedback.summary, "");
	for (const c of plan.nodes.filter((n) => n.type === "campaign")) {
		const d = c.data;
		L.push(`## ${TYPES.campaign.label}: ${d.name} (${STATUS_LABEL[c.status]}${c.assignee ? `, @${c.assignee}` : ""})`, "");
		if (d.funnel) L.push(`- Funnel stage: ${FUNNEL[d.funnel]}`);
		L.push(`- Objective: ${OBJECTIVES[d.objective]} (${d.platforms.map((p) => `${PLATFORMS[p].short}: ${PLATFORMS[p].objectives[d.objective]}`).join("; ")})`);
		L.push(`- Budget: ${money(d.budget)}`, `- Schedule: ${d.schedule.start || "on approval"} → ${d.schedule.end || "ongoing"}`);
		if (d.kpi) L.push(`- KPI: ${d.kpi}`);
		L.push("");
		for (const s of childrenOf(plan, c.id)) {
			L.push(`### Ad set: ${s.data.name}`, "", `- Audience: ${adsetSummary(s.data)}`, `- Interests: ${list(s.data.interests)}`, `- Custom: ${list(s.data.customAudiences)} · Exclude: ${list(s.data.exclusions)}`, "");
			for (const ad of childrenOf(plan, s.id)) {
				const d = ad.data;
				L.push(`- **${d.name}** · ${formatLabel(d.platform, d.format)} · ${STATUS_LABEL[ad.status]}`);
				if (d.format !== "search" && d.primaryText) L.push(`  - Text: ${d.primaryText}`);
				L.push(`  - Headline: ${d.headline}${d.format === "search" ? ` | ${d.headline2}` : ""}`);
				if (d.description) L.push(`  - Description: ${d.description}`);
				L.push(`  - CTA: ${d.cta} → ${d.url}`);
			}
			L.push("");
		}
	}
	return L.join("\n");
}
