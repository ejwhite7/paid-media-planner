// The plan as a slide deck (16:9, one <section class="slide"> per page) for sign-off meetings and the PDF export. It
// walks the structure top-down: cover, brief and budget, the structure at a glance, then each campaign (objective,
// budget, its ad sets), each ad set (targeting), its ads as native mockups, open issues, and the build checklist.
// Pure: returns HTML. tools/canvas.mjs wraps it in a page with the fonts and styles, and prints it to PDF.
import { FUNNEL, FUNNEL_LABEL, OBJECTIVES, PLATFORMS, STATUS_LABEL, FIELD_LABEL, adFormatLabel, textOptions, adsetFacts, adsetSummary, budgetPlan, campaignFacts, channelPlans, childrenOf, goalLabel, issuesByNode, money, objectiveLabel } from "./model.mjs";
import { esc, renderMock } from "./mocks.mjs";

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const list = (a) => (a?.length ? a.map(esc).join(", ") : '<span class="dim">—</span>');
const gender = (g) => ({ all: "All", male: "Men", female: "Women" })[g] ?? "All";
const kvRows = (rows) => rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
const pill = (status) => `<span class="st st-${status}">${STATUS_LABEL[status] ?? status}</span>`;
const funnelTag = (f) => (f ? `<span class="fun fun-${f}">${FUNNEL[f]}</span>` : "");
const netDots = (ps) => ps.map((p) => `<span class="net"><i style="background:${PLATFORMS[p].color}"></i>${PLATFORMS[p].short}</span>`).join("");
// Shrinks long text so it still fits its box: font size by length, then a cut with a pointer to the full brief.
const fitText = (s, max = 1600) => {
	const t = String(s ?? "");
	const size = t.length < 380 ? 22 : t.length < 700 ? 18 : t.length < 1100 ? 15 : 13;
	return `<div class="fit-text" style="font-size:${size}px">${esc(t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, "")} …` : t)}</div>`;
};

export function renderSlides(plan) {
	const camps = plan.nodes.filter((n) => n.type === "campaign");
	const sets = plan.nodes.filter((n) => n.type === "adset");
	const ads = plan.nodes.filter((n) => n.type === "ad");
	const nets = [...new Set(camps.flatMap((c) => c.data.platforms))];
	const issues = issuesByNode(plan);
	const bp = budgetPlan(plan.settings);
	const cur = bp.currency;
	const daily = camps.filter((c) => c.data.budget.type === "daily").reduce((a, c) => a + (Number(c.data.budget.amount) || 0), 0);
	const scope = plan.viewOf ? PLATFORMS[plan.viewOf].name : nets.map((p) => PLATFORMS[p].short).join(" · ") || "No networks yet";
	const slides = [];
	const slide = (cls, title, body, { eyebrow = "", tag = "" } = {}) =>
		slides.push(`<section class="slide ${cls}">${title ? `<header class="sh"><div>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ""}<h2>${title}</h2></div>${tag}</header>` : ""}<div class="sb">${body}</div></section>`);

	// 1. Cover
	slides.push(`<section class="slide cover">
		<div class="cv-top"><span class="wordmark">GrowthCast</span><span class="mono">Paid media plan · ${esc(scope)}</span></div>
		<div class="cv-mid"><div class="eyebrow">${esc(plan.brand.name)}</div><h1>${esc(plan.name)}</h1><p class="mono">${pill(plan.status)}${plan.owner ? ` · Owner ${esc(plan.owner)}` : ""} · ${new Date(plan.updatedAt ?? Date.now()).toLocaleDateString("en-US", { dateStyle: "long" })}</p></div>
		<div class="cv-stats">
			<div><b>${camps.length}</b><span>campaigns</span></div><div><b>${sets.length}</b><span>ad sets</span></div><div><b>${ads.length}</b><span>ads</span></div>
			<div><b>${nets.length}</b><span>${nets.length === 1 ? "network" : "networks"}</span></div>
			<div><b>${bp.monthly ? `${cur} ${bp.monthly.toLocaleString()}` : daily ? `${camps[0].data.budget.currency} ${daily.toLocaleString()}` : "—"}</b><span>${bp.monthly ? "budget / month" : "daily budget"}</span></div>
		</div></section>`);

	// 2. Brief and budget
	const bar = bp.stages
		.filter((s) => s.weight)
		.map((s) => `<div class="seg fun-${s.key}" style="flex:${s.weight}"><b>${s.label} ${s.weight}%</b><span>${bp.monthly ? `${cur} ${Math.round(s.monthly).toLocaleString()}/mo` : ""}</span></div>`)
		.join("");
	const budgetBlock = `<div class="budget"><h3>Budget by funnel stage</h3><div class="bar">${bar}</div>
		${channelPlans(plan).filter((b) => b.monthly).length ? `<table class="t"><thead><tr><th>Channel</th><th>Monthly</th><th>Daily</th></tr></thead><tbody>${channelPlans(plan).filter((b) => b.monthly).map((b) => `<tr><td>${netDots([b.network])}</td><td>${cur} ${b.monthly.toLocaleString()}</td><td>${cur} ${Math.round(b.daily)}</td></tr>`).join("")}</tbody></table>` : ""}
		<table class="t"><thead><tr><th>Stage</th><th>Daily</th><th>Campaigns</th></tr></thead><tbody>${bp.stages
			.map((s) => `<tr><td>${funnelTag(s.key)} <span class="dim">${esc(FUNNEL_LABEL[s.key].split(": ")[1] ?? "")}</span></td><td>${bp.monthly ? `${cur} ${Math.round(s.daily)}` : "—"}</td><td>${camps.filter((c) => c.data.funnel === s.key).length}</td></tr>`)
			.join("")}</tbody></table>
		${bp.monthly ? "" : `<p class="note">No channel budget set. Campaign budgets total ${daily ? `${camps[0].data.budget.currency} ${daily.toLocaleString()}/day` : "nothing yet"}.</p>`}</div>`;
	slide("two", "The brief", `<div class="col">${plan.brief ? fitText(plan.brief) : '<p class="dim">No brief written yet.</p>'}${plan.settings?.context?.length ? `<p class="note">Grounded in: ${plan.settings.context.map((c) => esc(c.name)).join(", ")}</p>` : ""}</div><div class="col">${budgetBlock}</div>`, { eyebrow: "Context" });

	// 3. Structure at a glance, paginated by campaign
	const rowsOf = (c) => 1 + Math.max(1, childrenOf(plan, c.id).length);
	const pages = [];
	let page = [];
	let used = 0;
	for (const c of camps) {
		if (used && used + rowsOf(c) > 11) pages.push(page), (page = []), (used = 0);
		page.push(c);
		used += rowsOf(c);
	}
	if (page.length) pages.push(page);
	pages.forEach((pg, i) =>
		slide(
			"structure",
			`Structure${pages.length > 1 ? ` <small>${i + 1}/${pages.length}</small>` : ""}`,
			pg
				.map((c) => {
					const kids = childrenOf(plan, c.id);
					return `<div class="tree"><div class="tc"><span class="lvl">Campaign</span><b>${esc(c.data.name)}</b><div class="meta">${funnelTag(c.data.funnel)} ${esc(objectiveLabel(c))} · ${money(c.data.budget)}</div><div>${netDots(c.data.platforms)}</div></div>
					<div class="tk">${kids.map((s) => `<div class="ts"><span class="lvl lvl-as">Ad set</span><b>${esc(s.data.name)}</b><span class="dim">${childrenOf(plan, s.id).length} ads · ${esc(s.data.optimization || "—")}</span></div>`).join("") || '<div class="ts dim">No ad sets yet</div>'}</div></div>`;
				})
				.join(""),
			{ eyebrow: "Campaign → ad set → ad" },
		),
	);

	for (const c of camps) {
		const d = c.data;
		const kids = childrenOf(plan, c.id);
		// Campaign slide
		slide(
			"two campaign",
			esc(d.name),
			`<div class="col"><table class="kv">
				${kvRows(campaignFacts(c))}
				${d.funnel ? `<tr><th>Funnel stage</th><td>${FUNNEL_LABEL[d.funnel]}</td></tr>` : ""}
				<tr><th>Schedule</th><td>${esc(d.schedule.start || "On approval")} → ${esc(d.schedule.end || "Ongoing")}</td></tr>
				${d.kpi ? `<tr><th>KPI</th><td>${esc(d.kpi)}</td></tr>` : ""}
				<tr><th>Status</th><td>${pill(c.status)}${c.assignee ? ` · ${esc(c.assignee)}` : ""}</td></tr>
			</table>${d.notes ? `<div class="notes">${esc(d.notes.slice(0, 500))}</div>` : ""}</div>
			<div class="col"><h3>${kids.length} ad set${kids.length === 1 ? "" : "s"}</h3>${kids
				.slice(0, 6)
				.map((s) => `<div class="card"><b>${esc(s.data.name)}</b><div class="dim">${esc(adsetSummary(s.data, d.platforms[0]))}</div><div>${esc([s.data.interests.slice(0, 3).join(", "), s.data.customAudiences.slice(0, 2).join(", ")].filter(Boolean).join(" · ") || "Broad")}</div><div class="dim">${childrenOf(plan, s.id).length} ads · ${esc(goalLabel(plan, s) || "no goal set")}</div></div>`)
				.join("")}${kids.length > 6 ? `<p class="dim">+ ${kids.length - 6} more</p>` : ""}</div>`,
			{ eyebrow: `Campaign · ${esc(objectiveLabel(c))}`, tag: `<div class="tags">${funnelTag(d.funnel)}${netDots(d.platforms)}</div>` },
		);
		for (const s of kids) {
			const a = s.data;
			const sAds = childrenOf(plan, s.id);
			// Ad set targeting slide
			slide(
				"two adset",
				esc(a.name),
				`<div class="col"><table class="kv">
					${kvRows(adsetFacts(plan, s))}
				</table>${a.notes ? `<div class="notes">${esc(a.notes.slice(0, 420))}</div>` : ""}</div>
				<div class="col"><h3>${sAds.length} ad${sAds.length === 1 ? "" : "s"}</h3>${sAds
					.slice(0, 6)
					.map((ad) => `<div class="card ad-line"><b>${esc(ad.data.name)}</b><div>${esc(ad.data.headline || ad.data.primaryText.slice(0, 90))}</div><div class="dim">${esc(adFormatLabel(plan, ad))}${ad.data.creative === "ugc" ? " · creator (UGC)" : ""}</div></div>`)
					.join("")}${sAds.length > 6 ? `<p class="dim">+ ${sAds.length - 6} more</p>` : ""}</div>`,
				{ eyebrow: `Ad set · ${esc(d.name)}`, tag: `<div class="tags">${funnelTag(d.funnel)}</div>` },
			);
			// Ads as native mocks, three to a slide
			const groups = chunk(sAds, 3);
			groups.forEach((g, i) =>
				slide(
					"ads",
					`${esc(a.name)} <small>ads${groups.length > 1 ? ` ${i + 1}/${groups.length}` : ""}</small>`,
					`<div class="mocks n${g.length}">${g
						.map((ad) => {
							const P = PLATFORMS[ad.data.platform];
							const over = Object.entries(P.limits).filter(([k, max]) => k !== "brandName" && String(ad.data[k] ?? "").length > max);
							return `<figure><div class="mbox"><div class="fit">${renderMock(ad.data, plan.brand)}</div></div><figcaption><b>${esc(ad.data.name)}</b><span>${esc(adFormatLabel(plan, ad))} · ${esc(ad.data.cta)}${ad.data.creative === "ugc" ? ' · <em>creator (UGC)</em>' : ""}</span><span class="url">${esc(ad.data.url)}</span>${textOptions(ad.data, "primaryText").length > 1 || textOptions(ad.data, "headline").length > 1 ? `<span>${textOptions(ad.data, "primaryText").length} primary texts · ${textOptions(ad.data, "headline").length} headlines</span>` : ""}${over.length ? `<span class="warn">${over.map(([k, max]) => `${FIELD_LABEL[k]} over ${max}`).join(", ")}</span>` : ""}</figcaption></figure>`;
						})
						.join("")}</div>`,
					{ eyebrow: `Ads · ${esc(d.name)}` },
				),
			);
			// Text options (Meta's multiple text options), two ads to a slide, so every variant is signed off.
			const withOptions = sAds.filter((ad) => textOptions(ad.data, "primaryText").length > 1 || textOptions(ad.data, "headline").length > 1);
			chunk(withOptions, 2).forEach((g, i, all) =>
				slide(
					"copyopts",
					`${esc(a.name)} <small>text options${all.length > 1 ? ` ${i + 1}/${all.length}` : ""}</small>`,
					g
						.map((ad) => `<div class="opts"><h3>${esc(ad.data.name)}</h3><div class="opts-cols"><div><h4>Primary text</h4><ol>${textOptions(ad.data, "primaryText").map((t) => `<li>${esc(t)}</li>`).join("")}</ol></div><div><h4>Headline</h4><ol>${textOptions(ad.data, "headline").map((t) => `<li>${esc(t)}</li>`).join("")}</ol></div></div></div>`)
						.join(""),
					{ eyebrow: `Copy · ${esc(d.name)}` },
				),
			);
		}
	}


	const total = slides.length;
	return slides.map((s, i) => s.replace(/<\/section>$/, `<footer class="sf"><span>${esc(plan.name)}</span><span>${i + 1} / ${total}</span><span class="wordmark">GrowthCast</span></footer></section>`)).join("\n");
}

// Scales each mock down to fit its box. Runs in the page (inlined by the exporter) once fonts and images are in.
export const FIT_SCRIPT = `function fitMocks(){for(const box of document.querySelectorAll('.mbox')){const el=box.firstElementChild;el.style.transform='';const s=Math.min(1,(box.clientHeight-4)/el.scrollHeight,(box.clientWidth-4)/el.scrollWidth);el.style.transform='scale('+s+')';}}
fitMocks();(document.fonts?document.fonts.ready:Promise.resolve()).then(fitMocks);addEventListener('load',fitMocks);`;
