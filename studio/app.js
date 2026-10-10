// Paid media planner front end. One plan is open at a time; every edit goes through mutate() (undo snapshot, debounced
// save, redraw). The server file is the source of truth: when its version changes underneath (Claude edited it), the
// canvas adopts it. Node graph: campaign → ad set → ad, parent links drawn as edges from out-ports to in-ports.
import { PLATFORMS, OBJECTIVES, TYPES, STATUSES, STATUS_LABEL, FIELD_LABEL, newNode, nodeById, childrenOf, campaignOf, subtree, issuesByNode, adsetSummary, money, layoutPlan, firstFormat, uid } from "./model.mjs";
import { renderMock, esc, formatLabel } from "./mocks.mjs";
import { renderBrief } from "./brief.mjs";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const W = 300; // node width
const PORT_Y = 42; // port height from a node's top
const store = {
	get(k, d) {
		try {
			const v = localStorage.getItem(k);
			return v == null ? d : JSON.parse(v);
		} catch {
			return d;
		}
	},
	set(k, v) {
		try {
			localStorage.setItem(k, JSON.stringify(v));
		} catch {}
	},
};
const S = { plans: [], plan: null, version: null, sel: null, selEdge: null, tab: store.get("cc-tab", {}), view: "canvas", z: 1, px: 40, py: 20, saving: false, dirty: false, undo: [], redo: [], request: null, allFormats: false, lastKey: null, lastAt: 0 };
const me = () => store.get("cc-name", "") || "Me";
const cv = $("#canvasView");

// ---------- server ----------
async function api(path, opts = {}) {
	const r = await fetch(path, opts);
	const body = (r.headers.get("content-type") ?? "").includes("json") ? await r.json() : await r.text();
	if (!r.ok && r.status !== 409) throw new Error(body?.error ?? body);
	return { status: r.status, body };
}
const post = (path, data, method = "POST") => api(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

async function refreshPlanList() {
	S.plans = (await api("/api/plans")).body;
	$("#planSel").innerHTML = S.plans.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
	if (S.plan) $("#planSel").value = S.plan.id;
}
async function openPlan(id) {
	const { body } = await api(`/api/plans/${id}`);
	S.plan = body.plan;
	S.version = body.version;
	S.sel = S.selEdge = null;
	S.undo = [];
	S.redo = [];
	if (location.hash.slice(1) !== id) history.replaceState(null, "", `#${id}`);
	store.set("cc-last", id);
	$("#planSel").value = id;
	renderAll();
	fit();
	pollRequest();
}
let saveTimer;
function scheduleSave() {
	S.dirty = true;
	setSave("Unsaved");
	clearTimeout(saveTimer);
	saveTimer = setTimeout(save, 450);
}
async function save() {
	if (S.saving) return scheduleSave();
	S.saving = true;
	S.dirty = false;
	setSave("Saving…");
	try {
		const r = await fetch(`/api/plans/${S.plan.id}`, { method: "PUT", headers: { "content-type": "application/json", "x-base-version": S.version ?? "" }, body: JSON.stringify(S.plan) });
		const b = await r.json();
		if (r.status === 409) {
			adopt(b);
			toast("This plan was changed outside the canvas, so the latest version is loaded. Your last edit may need redoing.");
		} else if (!r.ok) {
			setSave("Not saved");
			toast(b.error);
		} else {
			S.version = b.version;
			S.plan.updatedAt = b.plan.updatedAt;
			setSave("Saved");
			if (S.plans.find((p) => p.id === S.plan.id)?.name !== S.plan.name) refreshPlanList();
		}
	} catch {
		setSave("Offline");
		S.dirty = true;
	} finally {
		S.saving = false;
	}
}
function adopt(b) {
	S.undo.push(JSON.stringify(S.plan));
	S.plan = b.plan;
	S.version = b.version;
	if (S.sel && !nodeById(S.plan, S.sel)) S.sel = null;
	renderAll();
}
async function poll() {
	if (!S.plan || S.saving || S.dirty || document.hidden) return;
	try {
		const { body } = await api(`/api/plans/${S.plan.id}/version`);
		if (body.version && body.version !== S.version) {
			adopt((await api(`/api/plans/${S.plan.id}`)).body);
			toast(S.request?.deliveredAt ? "Claude updated the plan." : "The plan was updated.");
			refreshPlanList();
		}
	} catch {}
	pollRequest();
}
async function pollRequest() {
	try {
		const { body } = await api("/api/request");
		S.request = body && body.planId === S.plan?.id && Date.now() - body.at < 12 * 3600e3 ? body : null;
	} catch {
		S.request = null;
	}
	renderAsk();
}
const setSave = (t) => ($("#saveState").textContent = t);
let toastTimer;
function toast(text) {
	const t = $("#toast");
	t.textContent = text;
	t.classList.add("on");
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => t.classList.remove("on"), 3800);
}

// ---------- mutations & undo ----------
function mutate(fn, { coalesce = null, rerender = "all" } = {}) {
	if (!(coalesce && S.lastKey === coalesce && Date.now() - S.lastAt < 1500)) pushUndo(JSON.stringify(S.plan));
	S.lastKey = coalesce;
	S.lastAt = Date.now();
	fn(S.plan);
	scheduleSave();
	rerender === "all" ? renderAll() : renderLight();
}
function pushUndo(snapshot) {
	S.undo.push(snapshot);
	if (S.undo.length > 100) S.undo.shift();
	S.redo = [];
}
function undo(redo = false) {
	const from = redo ? S.redo : S.undo;
	if (!from.length) return;
	(redo ? S.undo : S.redo).push(JSON.stringify(S.plan));
	S.plan = JSON.parse(from.pop());
	S.lastKey = null;
	if (S.sel && !nodeById(S.plan, S.sel)) S.sel = null;
	scheduleSave();
	renderAll();
}
const count = (type) => S.plan.nodes.filter((n) => n.type === type).length;
const platformFor = (n) => campaignOf(S.plan, n)?.data.platforms[0] ?? "meta";
// Keep an ad's network one of its campaign's, after a move or a network change.
function conform(plan, ad) {
	const camp = campaignOf(plan, ad);
	if (camp?.data.platforms.length && !camp.data.platforms.includes(ad.data.platform)) {
		ad.data.platform = camp.data.platforms[0];
		ad.data.format = firstFormat(ad.data.platform);
	}
}
function addNode(type, { x, y, parent = null, data = {} } = {}) {
	const p = parent && nodeById(S.plan, parent);
	const n = newNode(type, { x, y, parent, platform: p ? platformFor(p) : data.platforms?.[0] ?? "meta", data: { name: `${TYPES[type].label} ${count(type) + 1}`, ...data } });
	mutate((plan) => plan.nodes.push(n));
	select(n.id);
	return n;
}
function addChild(pid, data = {}) {
	const p = nodeById(S.plan, pid);
	const type = TYPES[p.type].child;
	const kids = childrenOf(S.plan, pid);
	return addNode(type, { x: p.x + 380, y: kids.length ? Math.max(...kids.map((k) => k.y)) + 170 : p.y, parent: pid, data });
}
function removeNode(id) {
	const ids = subtree(S.plan, id);
	const n = nodeById(S.plan, id);
	if (ids.length > 1 && !confirm(`Delete "${n.data.name}" and the ${ids.length - 1} node${ids.length > 2 ? "s" : ""} under it?`)) return;
	S.sel = null;
	mutate((plan) => {
		plan.nodes = plan.nodes.filter((x) => !ids.includes(x.id));
		plan.feedback.items = plan.feedback.items.filter((f) => !ids.includes(f.node));
	});
}
function duplicate(id) {
	const ids = subtree(S.plan, id);
	const map = Object.fromEntries(ids.map((i) => [i, uid(nodeById(S.plan, i).type === "adset" ? "as" : nodeById(S.plan, i).type === "ad" ? "ad" : "cp")]));
	const dy = Math.max(...ids.map((i) => nodeById(S.plan, i).y)) - Math.min(...ids.map((i) => nodeById(S.plan, i).y)) + 190;
	mutate((plan) => {
		for (const i of ids) {
			const n = structuredClone(nodeById(plan, i));
			plan.nodes.push({ ...n, id: map[i], parent: map[n.parent] ?? n.parent, y: n.y + dy, status: "draft", comments: [], data: { ...n.data, name: i === id ? `${n.data.name} copy` : n.data.name } });
		}
	});
	select(map[id]);
}
function setPath(obj, path, value) {
	const keys = path.split(".");
	let o = obj;
	for (const k of keys.slice(0, -1)) o = o[k] ??= /^\d+$/.test(k) ? {} : {};
	o[keys.at(-1)] = value;
}
const getPath = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);
function ensureCards(ad, i) {
	while (ad.data.cards.length < Math.max(3, i + 1)) ad.data.cards.push({ headline: `Card ${ad.data.cards.length + 1} headline` });
}

// ---------- rendering ----------
function renderAll() {
	renderNodes();
	renderEdges();
	renderInspector();
	renderLeft();
	renderTop();
	if (S.view === "mocks") renderMocks();
	if (S.view === "brief") renderBriefView();
}
function renderLight() {
	renderNodes();
	renderEdges();
	renderLeft();
	if (S.view === "brief") renderBriefView();
}
function renderTop() {
	$("#planName").value = S.plan.name;
	$("#planStatus").value = S.plan.status;
	$("#planStatus").dataset.status = S.plan.status;
	$$(".views button").forEach((b) => b.classList.toggle("on", b.dataset.view === S.view));
}
const SEV_ORDER = { error: 0, warn: 1, info: 2, good: 3 };
function badges(items = []) {
	const c = { error: 0, warn: 0, info: 0, claude: 0 };
	for (const i of items) i.source === "claude" ? c.claude++ : c[i.severity]++;
	return [c.error && `<span class="bd bd-error" title="Blockers">${c.error}</span>`, c.warn && `<span class="bd bd-warn" title="To fix">${c.warn}</span>`, c.claude && `<span class="bd bd-claude" title="Claude's feedback">✦ ${c.claude}</span>`].filter(Boolean).join("");
}
function thumb(ad) {
	const m = ad.data.media[0] ?? ad.data.cards.find((c) => c.src);
	if (m?.src) return m.kind === "video" ? `<video src="${esc(m.src)}" muted></video>` : `<img src="${esc(m.src)}" alt="">`;
	return `<span>${PLATFORMS[ad.data.platform]?.formats[ad.data.format]?.media === false ? "Aa" : "▨"}</span>`;
}
function nodeHtml(n, issues) {
	const d = n.data;
	const t = TYPES[n.type];
	let body = "";
	if (n.type === "campaign")
		body = `<div class="n-line"><span class="k">Objective</span> ${OBJECTIVES[d.objective] ?? d.objective}</div><div class="n-nets">${d.platforms.map((p) => `<span class="net" style="--c:${PLATFORMS[p].color}">${PLATFORMS[p].short}</span>`).join("") || '<span class="muted">No networks</span>'}</div><div class="n-line muted">${money(d.budget)}</div>`;
	if (n.type === "adset") body = `<div class="n-line">${esc(adsetSummary(d))}</div>${d.interests.length ? `<div class="n-tags">${d.interests.slice(0, 3).map((i) => `<span>${esc(i)}</span>`).join("")}${d.interests.length > 3 ? `<span>+${d.interests.length - 3}</span>` : ""}</div>` : ""}`;
	if (n.type === "ad") body = `<div class="n-ad"><div class="n-thumb">${thumb(n)}</div><div class="n-adtext"><div class="n-hl">${esc(d.headline || "—")}</div><div class="n-line muted"><span class="net" style="--c:${PLATFORMS[d.platform]?.color}">${PLATFORMS[d.platform]?.short ?? d.platform}</span> ${esc(PLATFORMS[d.platform]?.formats[d.format]?.name ?? "")}</div></div></div>`;
	return `<div class="node t-${n.type}${S.sel === n.id ? " sel" : ""}" data-id="${n.id}" style="transform:translate(${n.x}px,${n.y}px)">
	<div class="n-head"><span class="n-type">${t.label} <i>· ${t.sub}</i></span><span class="n-badges">${badges(issues)}</span></div>
	<div class="n-body"><div class="n-name">${esc(d.name)}</div>${body}</div>
	<div class="n-foot"><span class="st st-${n.status}">${STATUS_LABEL[n.status]}</span>${n.assignee ? `<span class="who" title="Assignee">@${esc(n.assignee)}</span>` : ""}${n.comments.length ? `<span class="muted">💬 ${n.comments.length}</span>` : ""}</div>
	${t.parent ? `<span class="port in" title="Drag to a ${TYPES[t.parent].label.toLowerCase()} to connect"></span>` : ""}
	${t.child ? `<span class="port out" title="Drag to connect or to create a ${TYPES[t.child].label.toLowerCase()}"></span><button class="n-add" data-add="${n.id}" title="Add ${TYPES[t.child].label.toLowerCase()}">+</button>` : ""}
</div>`;
}
function renderNodes() {
	const issues = issuesByNode(S.plan);
	$("#nodes").innerHTML = S.plan.nodes.map((n) => nodeHtml(n, issues[n.id])).join("");
	$("#emptyHint").hidden = S.plan.nodes.length > 0;
}
const COLORS = { campaign: "var(--c-campaign)", adset: "var(--c-adset)" };
function curve(x1, y1, x2, y2) {
	const dx = Math.max(50, Math.abs(x2 - x1) / 2);
	return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}
function renderEdges() {
	let h = "";
	for (const n of S.plan.nodes) {
		const p = n.parent && nodeById(S.plan, n.parent);
		if (!p) continue;
		const d = curve(p.x + W, p.y + PORT_Y, n.x, n.y + PORT_Y);
		h += `<path class="edge${S.selEdge === n.id ? " sel" : ""}" d="${d}" style="stroke:${COLORS[p.type]}"/><path class="edge-hit" data-child="${n.id}" d="${d}"/>`;
	}
	$("#edges").innerHTML = h + `<path id="tempEdge" class="edge temp" d=""/>`;
}
function applyView() {
	$("#world").style.transform = `translate(${S.px}px,${S.py}px) scale(${S.z})`;
	cv.style.backgroundSize = `${22 * S.z}px ${22 * S.z}px`;
	cv.style.backgroundPosition = `${S.px}px ${S.py}px`;
	$("#zoomLbl").textContent = `${Math.round(S.z * 100)}%`;
}
function fit() {
	if (!S.plan.nodes.length) return (S.z = 1), (S.px = 40), (S.py = 20), applyView();
	const r = cv.getBoundingClientRect();
	const xs = S.plan.nodes.map((n) => n.x), ys = S.plan.nodes.map((n) => n.y);
	const x0 = Math.min(...xs), x1 = Math.max(...xs) + W, y0 = Math.min(...ys), y1 = Math.max(...ys) + 160;
	S.z = Math.max(0.25, Math.min(1.1, (r.width - 80) / (x1 - x0), (r.height - 80) / (y1 - y0)));
	S.px = (r.width - (x1 - x0) * S.z) / 2 - x0 * S.z;
	S.py = (r.height - (y1 - y0) * S.z) / 2 - y0 * S.z;
	applyView();
}
const toWorld = (cx, cy) => {
	const r = cv.getBoundingClientRect();
	return { x: (cx - r.left - S.px) / S.z, y: (cy - r.top - S.py) / S.z };
};

// ---------- left panel: palette, Ask Claude, checks ----------
function renderLeft() {
	const issues = issuesByNode(S.plan);
	const all = Object.entries(issues).flatMap(([node, list]) => list.map((i) => ({ ...i, node: node === "plan" ? null : node })));
	const n = (s) => all.filter((i) => i.severity === s && i.source !== "claude").length;
	const claude = all.filter((i) => i.source === "claude");
	const row = (i) => {
		const node = i.node && nodeById(S.plan, i.node);
		return `<li class="sev-${i.severity}${i.source === "claude" ? " from-claude" : ""}" ${node ? `data-goto="${node.id}"` : ""}>${node ? `<b>${esc(node.data.name)}</b> ` : ""}${esc(i.text)}</li>`;
	};
	$("#checks").innerHTML = `
		${S.plan.feedback.summary ? `<div class="fb-sum"><b>✦ Claude's review</b><p>${esc(S.plan.feedback.summary)}</p></div>` : ""}
		<div class="chk-counts"><span class="bd bd-error">${n("error")}</span> blockers <span class="bd bd-warn">${n("warn")}</span> to fix <span class="bd bd-info">${n("info")}</span> notes</div>
		<ul class="iss-list">${[...claude, ...all.filter((i) => i.source !== "claude")].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]).slice(0, 40).map(row).join("")}</ul>`;
}
const ASK = { generate: "Build from prompt", review: "Review plan", improve: "Improve selection", copy: "Write copy", share: "Publish share link" };
function renderAsk() {
	const r = S.request;
	const el = $("#askState");
	if (!r || (r.deliveredAt && Date.now() - r.deliveredAt > 30 * 60e3)) return (el.hidden = true);
	el.hidden = false;
	el.className = r.deliveredAt ? "ask-state got" : "ask-state queued";
	el.innerHTML = r.deliveredAt
		? `<b>✦ Claude picked up “${ASK[r.kind]}”.</b> Changes appear here as Claude saves them. <button data-ask-clear>Dismiss</button>`
		: `<b>Queued: “${ASK[r.kind]}”.</b> Switch to Claude Code and send any message (“go” is enough). The request goes with it. <button data-ask-clear>Cancel</button>`;
}
async function ask(kind) {
	const note = $("#askNote").value.trim();
	if (kind === "generate" && !note) return toast("Describe the campaign first: product, offer, audience, budget, networks.") || $("#askNote").focus();
	if (kind === "improve" && !S.sel) return toast("Select a node to improve first.");
	const nodeIds = S.sel && kind !== "generate" && kind !== "review" ? subtree(S.plan, S.sel) : [];
	if (S.dirty) await save();
	try {
		await post("/api/request", { kind, planId: S.plan.id, note, nodeIds });
		await pollRequest();
	} catch (e) {
		toast(e.message);
	}
}

// ---------- inspector ----------
const f = (label, input, extra = "") => `<label class="f"><span class="fl">${label}${extra}</span>${input}</label>`;
const inp = (bind, v, attrs = "") => `<input data-bind="${bind}" value="${esc(v)}" ${attrs}>`;
const area = (bind, v, rows = 3, attrs = "") => `<textarea data-bind="${bind}" rows="${rows}" ${attrs}>${esc(v)}</textarea>`;
const sel = (bind, options, v, attrs = "") => `<select data-bind="${bind}" ${attrs}>${options.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(v) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const listInp = (bind, v, ph = "") => `<input data-bind="${bind}" data-kind="list" value="${esc(v.join(", "))}" placeholder="${esc(ph)}">`;
const cnt = (v, max) => (max ? `<span class="cnt${(v ?? "").length > max ? " over" : ""}" data-max="${max}">${(v ?? "").length}/${max}</span>` : "");

function renderInspector() {
	const el = $("#inspector");
	const n = S.sel && nodeById(S.plan, S.sel);
	if (!n) return (el.innerHTML = planInspector());
	const tabs = n.type === "ad" ? ["mock", "details", "review"] : ["details", "review"];
	const tab = tabs.includes(S.tab[n.type]) ? S.tab[n.type] : tabs[0];
	const nIssues = issuesByNode(S.plan)[n.id] ?? [];
	el.innerHTML = `
	<div class="ins-head t-${n.type}"><span class="n-type">${TYPES[n.type].label} · ${TYPES[n.type].sub}</span><input class="ins-name" data-bind="data.name" value="${esc(n.data.name)}">
		<div class="ins-actions"><button data-dup title="Duplicate with everything under it (⌘D)">Duplicate</button><button data-del class="danger" title="Delete (⌫)">Delete</button></div></div>
	<nav class="tabs">${tabs.map((t) => `<button data-tab="${t}" class="${t === tab ? "on" : ""}">${{ mock: "Mock", details: "Details", review: `Review${nIssues.length ? ` <span class="bd ${nIssues.some((i) => i.severity === "error") ? "bd-error" : "bd-warn"}">${nIssues.length}</span>` : ""}` }[t]}</button>`).join("")}</nav>
	<div class="ins-body">${tab === "mock" ? mockTab(n) : tab === "review" ? reviewTab(n, nIssues) : n.type === "campaign" ? campaignForm(n) : n.type === "adset" ? adsetForm(n) : adForm(n)}</div>`;
}
function planInspector() {
	const p = S.plan;
	const b = p.brand;
	return `<div class="ins-head"><span class="n-type">Plan</span><input class="ins-name" data-pbind="name" value="${esc(p.name)}"></div>
	<div class="ins-body">
		<p class="muted small">Select a node to edit it. Drag from a node's right-hand dot to connect it or to create its next level. Shift-drag moves a whole branch.</p>
		${f("Owner", `<input data-pbind="owner" value="${esc(p.owner)}" placeholder="Who signs this off">`)}
		${f("Brief", `<textarea data-pbind="brief" rows="5" placeholder="Product, offer, audience, budget, what success looks like. Claude reads this for every request.">${esc(p.brief)}</textarea>`)}
		<h4>Brand, used in every mock</h4>
		<div class="row2">${f("Name", `<input data-pbind="brand.name" value="${esc(b.name)}">`)}${f("Handle", `<input data-pbind="brand.handle" value="${esc(b.handle)}">`)}</div>
		<div class="row2">${f("Website", `<input data-pbind="brand.website" value="${esc(b.website)}">`)}${f("Colour", `<input type="color" data-pbind="brand.color" value="${esc(b.color)}">`)}</div>
		<div class="logo-row">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : `<span class="mk-av" style="background:${esc(b.color)}">${esc((b.name || "B")[0])}</span>`}<button data-logo>Upload logo</button>${b.logo ? `<button data-logo-rm>Remove</button>` : ""}</div>
		<h4>Plan</h4>
		<div class="btn-row"><button data-plan-dup>Duplicate plan</button><button data-plan-del class="danger">Delete plan</button></div>
	</div>`;
}
function campaignForm(n) {
	const d = n.data;
	return `
	<div class="f"><span class="fl">Networks <small class="muted">click to toggle, or drag a network onto the node</small></span><div class="chips">${Object.entries(PLATFORMS).map(([k, p]) => `<button class="chip${d.platforms.includes(k) ? " on" : ""}" data-net="${k}" style="--c:${p.color}">${p.short}</button>`).join("")}</div></div>
	${f("Objective", sel("data.objective", Object.entries(OBJECTIVES), d.objective, "data-re"))}
	${d.platforms.length ? `<table class="native"><tbody>${d.platforms.map((p) => `<tr><td>${PLATFORMS[p].short}</td><td>${esc(PLATFORMS[p].objectives[d.objective] ?? "—")}</td></tr>`).join("")}</tbody></table><p class="muted small">The objective to pick in each ads manager. * means closest match: confirm when building.</p>` : ""}
	<div class="row3">${f("Budget", sel("data.budget.type", [["daily", "Daily"], ["lifetime", "Lifetime"]], d.budget.type))}${f("Amount", inp("data.budget.amount", d.budget.amount, 'type="number" min="0" data-kind="num"'))}${f("Currency", inp("data.budget.currency", d.budget.currency, 'maxlength="3"'))}</div>
	${f("Budget set at", sel("data.budget.level", [["campaign", "Campaign (CBO / Advantage+)"], ["adset", "Each ad set (ABO)"]], d.budget.level))}
	<div class="row2">${f("Start", inp("data.schedule.start", d.schedule.start, 'type="date"'))}${f("End", inp("data.schedule.end", d.schedule.end, 'type="date"'))}</div>
	${f("KPI / target", inp("data.kpi", d.kpi, 'placeholder="e.g. CPL under $40, 120 leads/month"'))}
	${f("Notes", area("data.notes", d.notes, 3))}
	<button class="wide" data-add="${n.id}">+ Add ad set</button>`;
}
function adsetForm(n) {
	const d = n.data;
	return `
	${f("Locations", listInp("data.locations", d.locations, "United States, Austin TX +25mi"))}
	<div class="row3">${f("Age from", inp("data.ageMin", d.ageMin, 'type="number" min="13" max="65" data-kind="num"'))}${f("to", inp("data.ageMax", d.ageMax, 'type="number" min="13" max="65" data-kind="num"'))}${f("Gender", sel("data.genders", [["all", "All"], ["female", "Women"], ["male", "Men"]], d.genders))}</div>
	${f("Languages", listInp("data.languages", d.languages, "English"))}
	${f("Interests & keywords", `<textarea data-bind="data.interests" data-kind="list" rows="2" placeholder="Home improvement, Lawn care">${esc(d.interests.join(", "))}</textarea>`)}
	${f("Custom / lookalike audiences", listInp("data.customAudiences", d.customAudiences, "Site visitors 30d, 1% LAL of customers"))}
	${f("Exclusions", listInp("data.exclusions", d.exclusions, "Existing customers"))}
	${f("Placements", inp("data.placements", d.placements, 'placeholder="automatic"'))}
	${f("Optimize for", inp("data.optimization", d.optimization, 'placeholder="e.g. Leads, Landing page views"'))}
	${f("Notes", area("data.notes", d.notes, 3))}
	<button class="wide" data-add="${n.id}">+ Add ad</button>`;
}
function netOptions(n) {
	const camp = campaignOf(S.plan, n);
	return camp?.data.platforms.length ? camp.data.platforms : Object.keys(PLATFORMS);
}
function adForm(n) {
	const d = n.data;
	const P = PLATFORMS[d.platform];
	const L = P.limits;
	const search = d.format === "search";
	return `
	<div class="row2">${f("Network", sel("data.platform", netOptions(n).map((k) => [k, PLATFORMS[k].name]), d.platform, "data-re"))}${f("Format", sel("data.format", Object.entries(P.formats).map(([k, v]) => [k, v.name]), d.format, "data-re"))}</div>
	${search ? "" : f("Primary text", area("data.primaryText", d.primaryText, 4), cnt(d.primaryText, L.primaryText))}
	${f(search ? "Headline 1" : "Headline", inp("data.headline", d.headline), cnt(d.headline, L.headline))}
	${search ? f("Headline 2", inp("data.headline2", d.headline2), cnt(d.headline2, L.headline2)) : ""}
	${f("Description", area("data.description", d.description, 2), cnt(d.description, L.description))}
	<div class="row2">${f("Call to action", sel("data.cta", [...new Set([...P.ctas, d.cta])].map((c) => [c, c]), d.cta))}${f("Display URL", inp("data.displayUrl", d.displayUrl))}</div>
	${f("Landing page URL", inp("data.url", d.url, 'type="url"'))}
	<div class="f"><span class="fl">Creative</span><div class="media-list">${d.media.map((m, i) => `<div class="mi">${m.kind === "video" ? `<video src="${esc(m.src)}" muted></video>` : `<img src="${esc(m.src)}" alt="">`}<button data-media-rm="${i}" title="Remove">✕</button></div>`).join("")}<button class="mi add" data-upload>+ Upload</button></div>
		<input class="url-add" data-media-url placeholder="…or paste an image URL and press Enter"></div>
	${f("Notes / creative direction", area("data.notes", d.notes, 3, 'placeholder="Shot, subject, text overlay, music…"'))}`;
}
function fmtChoices(n) {
	return netOptions(n).flatMap((p) => Object.entries(PLATFORMS[p].formats).map(([k, v]) => ({ p, k, label: `${PLATFORMS[p].short} · ${v.name}` })));
}
function mockTab(n) {
	const d = n.data;
	return `
	<div class="fmt-chips">${fmtChoices(n).map((c) => `<button class="chip${c.p === d.platform && c.k === d.format ? " on" : ""}" style="--c:${PLATFORMS[c.p].color}" data-setfmt="${c.p}:${c.k}">${esc(c.label)}</button>`).join("")}</div>
	<p class="muted small">Click any text in the mock to rewrite it. Drop an image or video on the grey block, or click it to choose a file.</p>
	<div class="mock-stage">${mockHost(n, d.platform, d.format, true)}</div>
	<div class="limits" data-limits="${n.id}">${limitsHtml(n)}</div>`;
}
function limitsHtml(n) {
	const d = n.data;
	const L = PLATFORMS[d.platform].limits;
	return Object.entries(L)
		.filter(([k]) => k !== "brandName" && (d.format === "search" || k !== "headline2"))
		.map(([k, max]) => `<span class="${(d[k] ?? "").length > max ? "over" : ""}">${FIELD_LABEL[k]} ${(d[k] ?? "").length}/${max}</span>`)
		.join("");
}
function reviewTab(n, items) {
	const fb = S.plan.feedback.items;
	return `
	<div class="row2">${f("Status", sel("status", STATUSES.map((s) => [s, STATUS_LABEL[s]]), n.status, "data-re"))}${f("Assignee", inp("assignee", n.assignee, 'placeholder="name"'))}</div>
	<h4>Feedback</h4>
	${items.length ? `<ul class="iss-list big">${items.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]).map((i) => `<li class="sev-${i.severity}${i.source === "claude" ? " from-claude" : ""}"><div>${i.source === "claude" ? "<b>✦</b> " : ""}${esc(i.text)}</div>${i.suggestion ? `<div class="sugg">→ ${esc(i.suggestion)}</div>` : ""}${i.source === "claude" ? `<button data-resolve="${fb.indexOf(fb.find((x) => x.text === i.text && x.node === n.id))}">Resolve</button>` : ""}</li>`).join("")}</ul>` : `<p class="muted small">No open feedback. Use “Review plan” on the left to ask Claude.</p>`}
	<h4>Comments</h4>
	<ul class="comments">${n.comments.map((c) => `<li><b>${esc(c.author)}</b> <small class="muted">${new Date(c.at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</small><p>${esc(c.text)}</p></li>`).join("") || '<li class="muted small">No comments yet.</li>'}</ul>
	<textarea id="commentText" rows="2" placeholder="Comment as ${esc(me())}…"></textarea>
	<button class="wide" data-comment>Comment</button>`;
}
function mockHost(n, platform, format, primary) {
	return `<figure class="mockhost${primary ? "" : " alt"}" data-ad="${n.id}" data-platform="${platform}" data-format="${format}">
		<figcaption><b>${esc(n.data.name)}</b><span>${esc(formatLabel(platform, format))}</span>${primary ? "" : `<button data-use="${platform}:${format}">Use</button>`}</figcaption>
		${renderMock(n.data, S.plan.brand, { editable: true, platform, format })}</figure>`;
}

// ---------- mocks & brief views ----------
function renderMocks() {
	const ads = S.plan.nodes.filter((n) => n.type === "ad");
	const host = (ad) => (S.allFormats ? fmtChoices(ad).map((c) => mockHost(ad, c.p, c.k, c.p === ad.data.platform && c.k === ad.data.format)).join("") : mockHost(ad, ad.data.platform, ad.data.format, true));
	let h = `<div class="mv-bar"><label><input type="checkbox" id="allFmt"${S.allFormats ? " checked" : ""}> Preview each ad in every format its campaign runs</label><span class="muted">Click text to rewrite it. Drop images or video on a block.</span></div>`;
	if (!ads.length) h += `<p class="muted pad">No ads yet. Add one on the canvas.</p>`;
	for (const c of S.plan.nodes.filter((n) => n.type === "campaign")) {
		h += `<section class="mv-camp"><h2><span class="lvl lvl-campaign">Campaign</span> ${esc(c.data.name)}</h2>`;
		for (const s of childrenOf(S.plan, c.id)) {
			const kids = childrenOf(S.plan, s.id);
			h += `<h3><span class="lvl lvl-adset">Ad set</span> ${esc(s.data.name)} <small class="muted">${esc(adsetSummary(s.data))}</small></h3><div class="mv-grid">${kids.map(host).join("") || '<p class="muted">No ads.</p>'}</div>`;
		}
		h += `</section>`;
	}
	const loose = ads.filter((a) => !a.parent || !nodeById(S.plan, a.parent)?.parent);
	if (loose.length) h += `<section class="mv-camp"><h2>Not connected</h2><div class="mv-grid">${loose.map(host).join("")}</div></section>`;
	$("#mocksView").innerHTML = h;
}
function renderBriefView() {
	const v = $("#briefView");
	const top = v.scrollTop;
	v.innerHTML = `<div class="brief-bar"><span class="muted">This is what the hand-off pack shows. Double-click any part to edit it on the canvas.</span><button data-share>Share…</button></div>${renderBrief(S.plan, { interactive: true })}`;
	const key = `cc-check-${S.plan.id}`;
	const ticks = store.get(key, {});
	for (const box of $$("[data-check]", v)) {
		box.checked = !!ticks[box.dataset.check];
		box.onchange = () => store.set(key, { ...store.get(key, {}), [box.dataset.check]: box.checked });
	}
	v.scrollTop = top;
}
function setView(view) {
	S.view = view;
	$("#canvasView").hidden = view !== "canvas";
	$("#mocksView").hidden = view !== "mocks";
	$("#briefView").hidden = view !== "brief";
	renderAll();
	if (view === "canvas") applyView();
}
function select(id, { edge = null } = {}) {
	S.sel = id;
	S.selEdge = edge;
	renderNodes();
	renderEdges();
	renderInspector();
}

// ---------- canvas interactions ----------
function drag(e, onMove, onUp) {
	const sx = e.clientX, sy = e.clientY;
	let moved = false;
	const mv = (ev) => {
		if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
		moved = true;
		onMove(ev, ev.clientX - sx, ev.clientY - sy);
	};
	const up = (ev) => {
		removeEventListener("pointermove", mv);
		removeEventListener("pointerup", up);
		onUp(ev, moved);
	};
	addEventListener("pointermove", mv);
	addEventListener("pointerup", up);
}
cv.addEventListener("pointerdown", (e) => {
	if (e.button !== 0 || e.target.closest(".zoomctl, .n-add")) return;
	const port = e.target.closest(".port");
	const nodeEl = e.target.closest(".node");
	const edge = e.target.closest(".edge-hit");
	if (port) return startConnect(e, port, nodeEl.dataset.id);
	if (nodeEl) return startNodeDrag(e, nodeEl.dataset.id);
	if (edge) return select(null, { edge: edge.dataset.child });
	const { px, py } = S;
	cv.classList.add("panning");
	drag(
		e,
		(ev, dx, dy) => {
			S.px = px + dx;
			S.py = py + dy;
			applyView();
		},
		(ev, moved) => {
			cv.classList.remove("panning");
			if (!moved && (S.sel || S.selEdge)) select(null);
		},
	);
});
function startNodeDrag(e, id) {
	if (S.sel !== id) select(id);
	const ids = e.shiftKey ? subtree(S.plan, id) : [id];
	const orig = ids.map((i) => [nodeById(S.plan, i), nodeById(S.plan, i).x, nodeById(S.plan, i).y]);
	const before = JSON.stringify(S.plan);
	drag(
		e,
		(ev, dx, dy) => {
			for (const [m, x, y] of orig) {
				m.x = Math.round(x + dx / S.z);
				m.y = Math.round(y + dy / S.z);
				const el = $(`.node[data-id="${m.id}"]`);
				if (el) el.style.transform = `translate(${m.x}px,${m.y}px)`;
			}
			renderEdges();
		},
		(ev, moved) => {
			if (!moved) return;
			pushUndo(before);
			scheduleSave();
		},
	);
}
function startConnect(e, port, id) {
	const src = nodeById(S.plan, id);
	const out = port.classList.contains("out");
	const want = out ? TYPES[src.type].child : TYPES[src.type].parent;
	const sx = out ? src.x + W : src.x, sy = src.y + PORT_Y;
	cv.classList.add("connecting");
	$$(".node").forEach((el) => el.classList.toggle("drop-ok", nodeById(S.plan, el.dataset.id)?.type === want));
	drag(
		e,
		(ev) => {
			const w = toWorld(ev.clientX, ev.clientY);
			$("#tempEdge").setAttribute("d", out ? curve(sx, sy, w.x, w.y) : curve(w.x, w.y, sx, sy));
		},
		(ev, moved) => {
			cv.classList.remove("connecting");
			$$(".node.drop-ok").forEach((el) => el.classList.remove("drop-ok"));
			$("#tempEdge")?.setAttribute("d", "");
			if (!moved) return;
			const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".node");
			const t = target && nodeById(S.plan, target.dataset.id);
			if (t && t.type === want) {
				const [child, parent] = out ? [t, src] : [src, t];
				mutate((plan) => {
					nodeById(plan, child.id).parent = parent.id;
					for (const a of subtree(plan, child.id).map((i) => nodeById(plan, i)).filter((n) => n.type === "ad")) conform(plan, a);
				});
			} else if (!t && out && want && ev.target.closest?.("#canvasView")) {
				const w = toWorld(ev.clientX, ev.clientY);
				addNode(want, { x: Math.round(w.x), y: Math.round(w.y - PORT_Y), parent: src.id });
			} else if (t) toast(`A ${TYPES[src.type].label.toLowerCase()} connects to ${want ? `a ${TYPES[want].label.toLowerCase()}` : "nothing on that side"}.`);
		},
	);
}
cv.addEventListener(
	"wheel",
	(e) => {
		e.preventDefault();
		if (e.ctrlKey || e.metaKey) {
			const r = cv.getBoundingClientRect();
			const mx = e.clientX - r.left, my = e.clientY - r.top;
			const z = Math.min(2, Math.max(0.2, S.z * Math.exp(-e.deltaY * 0.01)));
			S.px = mx - (mx - S.px) * (z / S.z);
			S.py = my - (my - S.py) * (z / S.z);
			S.z = z;
		} else {
			S.px -= e.deltaX;
			S.py -= e.deltaY;
		}
		applyView();
	},
	{ passive: false },
);
function zoomBy(k) {
	const r = cv.getBoundingClientRect();
	const z = Math.min(2, Math.max(0.2, S.z * k));
	S.px = r.width / 2 - (r.width / 2 - S.px) * (z / S.z);
	S.py = r.height / 2 - (r.height / 2 - S.py) * (z / S.z);
	S.z = z;
	applyView();
}

// Drag and drop from the palette (node types, networks) and from the desktop (images, video).
for (const t of $$("[data-drag]")) t.addEventListener("dragstart", (e) => e.dataTransfer.setData("application/x-cc", t.dataset.drag));
cv.addEventListener("dragover", (e) => {
	e.preventDefault();
	$$(".node.drop-hover").forEach((el) => el.classList.remove("drop-hover"));
	e.target.closest(".node")?.classList.add("drop-hover");
});
cv.addEventListener("dragleave", (e) => !cv.contains(e.relatedTarget) && $$(".node.drop-hover").forEach((el) => el.classList.remove("drop-hover")));
cv.addEventListener("drop", async (e) => {
	e.preventDefault();
	$$(".node.drop-hover").forEach((el) => el.classList.remove("drop-hover"));
	const t = e.target.closest(".node") && nodeById(S.plan, e.target.closest(".node").dataset.id);
	const w = toWorld(e.clientX, e.clientY);
	const files = [...e.dataTransfer.files].filter((f) => /^(image|video)\//.test(f.type));
	if (files.length) return dropFiles(files, t, w);
	const [kind, value] = (e.dataTransfer.getData("application/x-cc") || ":").split(":");
	if (kind === "type") {
		if (t && TYPES[value].parent === t.type) return addChild(t.id);
		return addNode(value, { x: Math.round(w.x - W / 2), y: Math.round(w.y - 30) });
	}
	if (kind === "net") {
		if (t?.type === "campaign") return mutate((plan) => (nodeById(plan, t.id).data.platforms = [...new Set([...t.data.platforms, value])]));
		if (t?.type === "ad")
			return mutate((plan) => {
				const ad = nodeById(plan, t.id);
				const camp = campaignOf(plan, ad);
				if (camp && !camp.data.platforms.includes(value)) camp.data.platforms.push(value);
				ad.data.platform = value;
				ad.data.format = firstFormat(value);
			});
		if (!t) return addNode("campaign", { x: Math.round(w.x - W / 2), y: Math.round(w.y - 30), data: { platforms: [value] } });
		toast("Drop a network on a campaign or an ad.");
	}
});
async function upload(file) {
	const r = await fetch(`/api/plans/${S.plan.id}/assets`, { method: "POST", headers: { "content-type": file.type, "x-filename": file.name }, body: file });
	const b = await r.json();
	if (!r.ok) throw new Error(b.error);
	return b;
}
async function dropFiles(files, t, w) {
	try {
		toast(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
		const media = await Promise.all(files.map(upload));
		if (t?.type === "ad")
			return mutate((plan) => {
				const ad = nodeById(plan, t.id);
				if (PLATFORMS[ad.data.platform].formats[ad.data.format]?.cards) {
					ensureCards(ad, media.length - 1);
					media.forEach((m, i) => Object.assign(ad.data.cards[i], m));
				} else ad.data.media = [media[0], ...ad.data.media.slice(1)];
			});
		if (t?.type === "adset") {
			for (const m of media) addChild(t.id, { media: [m], name: m.name.replace(/\.[^.]+$/, "") });
			return;
		}
		media.forEach((m, i) => addNode("ad", { x: Math.round(w.x - W / 2 + i * 30), y: Math.round(w.y - 30 + i * 170), data: { media: [m], name: m.name.replace(/\.[^.]+$/, "") } }));
	} catch (e) {
		toast(e.message);
	}
}
function pickFiles(multiple = false) {
	return new Promise((ok) => {
		const i = Object.assign(document.createElement("input"), { type: "file", accept: "image/*,video/*", multiple });
		i.onchange = () => ok([...i.files]);
		i.click();
	});
}

// ---------- delegated events: inspector, mocks, panels ----------
function bindValue(el) {
	if (el.dataset.kind === "list") return el.value.split(",").map((s) => s.trim()).filter(Boolean);
	if (el.dataset.kind === "num") return el.value === "" ? "" : Number(el.value);
	return el.value;
}
function onField(e) {
	const el = e.target;
	if (el.dataset.pbind) {
		mutate((plan) => setPath(plan, el.dataset.pbind, el.value), { coalesce: `plan.${el.dataset.pbind}`, rerender: "light" });
		if (el.dataset.pbind === "name") $("#planName").value = el.value;
		if (el.dataset.pbind.startsWith("brand.") && e.type === "change") renderAll();
		return;
	}
	if (!el.dataset.bind) return;
	const n = nodeById(S.plan, S.sel);
	if (!n) return;
	if (e.type === "input" && (el.tagName === "SELECT" || el.type === "date")) return;
	const re = el.dataset.re != null && e.type === "change";
	mutate(
		(plan) => {
			const node = nodeById(plan, n.id);
			setPath(node, el.dataset.bind, bindValue(el));
			if (el.dataset.bind === "data.platform") node.data.format = firstFormat(node.data.platform);
		},
		{ coalesce: `${n.id}.${el.dataset.bind}`, rerender: re ? "all" : "light" },
	);
	const c = el.closest(".f")?.querySelector(".cnt");
	if (c) {
		c.textContent = `${el.value.length}/${c.dataset.max}`;
		c.classList.toggle("over", el.value.length > Number(c.dataset.max));
	}
}
$("#inspector").addEventListener("input", onField);
$("#inspector").addEventListener("change", onField);
$("#inspector").addEventListener("keydown", (e) => {
	if (e.key === "Enter" && e.target.matches("[data-media-url]") && e.target.value.trim()) {
		const src = e.target.value.trim();
		mutate((plan) => nodeById(plan, S.sel).data.media.push({ src, kind: /\.(mp4|webm|mov)(\?|$)/i.test(src) ? "video" : "image", name: src.split("/").pop() }));
	}
});

document.addEventListener("click", async (e) => {
	const b = (s) => e.target.closest(s);
	let el;
	if ((el = b("[data-tab]"))) {
		const n = nodeById(S.plan, S.sel);
		S.tab[n.type] = el.dataset.tab;
		store.set("cc-tab", S.tab);
		return renderInspector();
	}
	if ((el = b("[data-add]"))) return addChild(el.dataset.add);
	if (b("[data-dup]")) return duplicate(S.sel);
	if (b("[data-del]")) return removeNode(S.sel);
	if ((el = b("[data-net]")))
		return mutate((plan) => {
			const c = nodeById(plan, S.sel);
			const k = el.dataset.net;
			c.data.platforms = c.data.platforms.includes(k) ? c.data.platforms.filter((p) => p !== k) : [...c.data.platforms, k];
			for (const a of subtree(plan, c.id).map((i) => nodeById(plan, i)).filter((n) => n.type === "ad")) conform(plan, a);
		});
	if ((el = b("[data-setfmt]")) || (el = b("[data-use]"))) {
		const [p, fmt] = (el.dataset.setfmt ?? el.dataset.use).split(":");
		const id = el.closest("[data-ad]")?.dataset.ad ?? S.sel;
		return mutate((plan) => Object.assign(nodeById(plan, id).data, { platform: p, format: fmt }));
	}
	if ((el = b("[data-goto]"))) {
		if (S.view !== "canvas") setView("canvas");
		return select(el.dataset.goto);
	}
	if ((el = b("[data-resolve]"))) return mutate((plan) => plan.feedback.items[Number(el.dataset.resolve)] && (plan.feedback.items[Number(el.dataset.resolve)].resolved = true));
	if (b("[data-comment]")) {
		const text = $("#commentText").value.trim();
		if (!text) return;
		if (!store.get("cc-name", "")) {
			const name = prompt("Your name, shown on comments:");
			if (name) store.set("cc-name", name.trim());
		}
		return mutate((plan) => nodeById(plan, S.sel).comments.push({ id: uid("c"), author: me(), text, at: new Date().toISOString() }));
	}
	if ((el = b("[data-media-rm]"))) return mutate((plan) => nodeById(plan, S.sel).data.media.splice(Number(el.dataset.mediaRm), 1));
	if (b("[data-upload]")) {
		const files = await pickFiles(true);
		if (!files.length) return;
		const media = await Promise.all(files.map(upload)).catch((err) => toast(err.message));
		if (media) mutate((plan) => nodeById(plan, S.sel).data.media.push(...media));
		return;
	}
	if (b("[data-logo]")) {
		const [file] = await pickFiles();
		if (file) {
			const m = await upload(file).catch((err) => toast(err.message));
			if (m) mutate((plan) => (plan.brand.logo = m.src));
		}
		return;
	}
	if (b("[data-logo-rm]")) return mutate((plan) => (plan.brand.logo = ""));
	if (b("[data-plan-dup]")) {
		const { body } = await post("/api/plans", { from: S.plan.id, name: `${S.plan.name} copy` });
		await refreshPlanList();
		return openPlan(body.plan.id);
	}
	if (b("[data-plan-del]")) {
		if (!confirm(`Delete the plan "${S.plan.name}" and its uploaded creative? This can't be undone.`)) return;
		await api(`/api/plans/${S.plan.id}`, { method: "DELETE" });
		await refreshPlanList();
		return S.plans.length ? openPlan(S.plans[0].id) : newPlanFlow("Untitled plan");
	}
	if ((el = b("[data-ask]"))) return ask(el.dataset.ask);
	if (b("[data-ask-clear]")) {
		await api("/api/request", { method: "DELETE" });
		return pollRequest();
	}
	if (b("[data-share]")) return openShare();
	// Mock media slots: remove, add a carousel card, or pick a file.
	const host = b("[data-ad]");
	if (host && (el = b("[data-rm]"))) {
		e.stopPropagation();
		return mutate((plan) => setSlot(nodeById(plan, host.dataset.ad), el.dataset.rm, null));
	}
	if (host && b("[data-addcard]")) return mutate((plan) => ensureCards(nodeById(plan, host.dataset.ad), Math.max(2, nodeById(plan, host.dataset.ad).data.cards.length)));
	if (host && (el = b("[data-media]"))) {
		const [file] = await pickFiles();
		if (!file) return;
		const m = await upload(file).catch((err) => toast(err.message));
		if (m) mutate((plan) => setSlot(nodeById(plan, host.dataset.ad), el.dataset.media, m));
	}
});
function setSlot(ad, slot, m) {
	if (slot.startsWith("card.")) {
		const i = Number(slot.split(".")[1]);
		ensureCards(ad, i);
		const c = ad.data.cards[i];
		if (m) Object.assign(c, m);
		else delete c.src, delete c.kind;
	} else {
		const i = Number(slot);
		if (m) ad.data.media[i] = m;
		else ad.data.media.splice(i, 1);
		ad.data.media = ad.data.media.filter(Boolean);
	}
}
// In-place copy editing in any mock.
const MULTILINE = new Set(["primaryText", "description"]);
document.addEventListener("input", (e) => {
	const ed = e.target.closest?.(".ed[data-field]");
	if (!ed) return;
	const host = ed.closest("[data-ad]");
	const field = ed.dataset.field;
	const value = ed.innerText.replace(/\n+$/, "");
	mutate(
		(plan) => {
			const ad = nodeById(plan, host.dataset.ad);
			const m = /^cards\.(\d+)\./.exec(field);
			if (m) ensureCards(ad, Number(m[1]));
			setPath(ad.data, field, value);
		},
		{ coalesce: `${host.dataset.ad}.${field}`, rerender: "light" },
	);
	for (const other of $$(`[data-ad="${host.dataset.ad}"] .ed[data-field="${field}"]`)) if (other !== ed) other.innerText = value;
	const lim = $(`[data-limits="${host.dataset.ad}"]`);
	if (lim) lim.innerHTML = limitsHtml(nodeById(S.plan, host.dataset.ad));
});
document.addEventListener("keydown", (e) => {
	const ed = e.target.closest?.(".ed[data-field]");
	if (ed && e.key === "Enter" && !MULTILINE.has(ed.dataset.field)) {
		e.preventDefault();
		ed.blur();
	}
});
for (const type of ["dragover", "dragleave", "drop"])
	document.addEventListener(type, async (e) => {
		const slot = e.target.closest?.("[data-media]");
		if (!slot || cv.contains(slot)) return;
		e.preventDefault();
		e.stopPropagation();
		slot.classList.toggle("drag-over", type === "dragover");
		if (type !== "drop") return;
		const file = [...e.dataTransfer.files].find((f) => /^(image|video)\//.test(f.type));
		if (!file) return;
		const m = await upload(file).catch((err) => toast(err.message));
		if (m) mutate((plan) => setSlot(nodeById(plan, slot.closest("[data-ad]").dataset.ad), slot.dataset.media, m));
	});
document.addEventListener("change", (e) => {
	if (e.target.id === "allFmt") {
		S.allFormats = e.target.checked;
		renderMocks();
	}
});
document.addEventListener("dblclick", (e) => {
	const part = e.target.closest?.("#briefView [id^='b-']");
	if (part && nodeById(S.plan, part.id.slice(2))) {
		setView("canvas");
		select(part.id.slice(2));
	}
});
addEventListener("keydown", (e) => {
	if (e.target.closest?.("input, textarea, select, [contenteditable], dialog")) return;
	const mod = e.metaKey || e.ctrlKey;
	if (mod && e.key.toLowerCase() === "z") return e.preventDefault(), undo(e.shiftKey);
	if (mod && e.key.toLowerCase() === "d" && S.sel) return e.preventDefault(), duplicate(S.sel);
	if (S.view !== "canvas") return;
	if (e.key === "Delete" || e.key === "Backspace") {
		if (S.selEdge) return mutate((plan) => (nodeById(plan, S.selEdge).parent = null)), (S.selEdge = null);
		if (S.sel) return removeNode(S.sel);
	}
	if (e.key === "Escape") select(null);
	if (e.key === "f") fit();
	if (e.key === "=" || e.key === "+") zoomBy(1.2);
	if (e.key === "-") zoomBy(1 / 1.2);
});

// ---------- top bar, share ----------
$("#planSel").addEventListener("change", (e) => openPlan(e.target.value));
$("#planName").addEventListener("input", (e) => mutate((plan) => (plan.name = e.target.value), { coalesce: "plan.name", rerender: "light" }));
$("#planStatus").addEventListener("change", (e) => mutate((plan) => (plan.status = e.target.value)));
$$(".views button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
$("#zoomIn").onclick = () => zoomBy(1.2);
$("#zoomOut").onclick = () => zoomBy(1 / 1.2);
$("#zoomFit").onclick = fit;
$("#tidy").onclick = () => {
	mutate((plan) => layoutPlan(plan));
	fit();
};
$("#newPlan").onclick = () => {
	const name = prompt("Name the new plan:", "Untitled plan");
	if (name != null) newPlanFlow(name);
};
async function newPlanFlow(name) {
	const { body } = await post("/api/plans", { name: name || "Untitled plan" });
	await refreshPlanList();
	await openPlan(body.plan.id);
}
function openShare() {
	const d = $("#shareDlg");
	const id = S.plan.id;
	d.innerHTML = `<form method="dialog">
		<h3>Share “${esc(S.plan.name)}”</h3>
		<p class="muted small">For sign-off upward and for whoever builds it in each ads manager. Every export has the brief, each network's objective, targeting, finished copy, native mocks and a build checklist.</p>
		<div class="share-opts">
			<div><b>Hand-off pack</b><span class="muted small">One HTML file: open, email, or drop in a drive.</span><a href="/api/plans/${id}/export.html" target="_blank">Preview</a><a href="/api/plans/${id}/export.html?download">Download</a></div>
			<div><b>Build sheet</b><span class="muted small">CSV, one row per ad, for the person building it.</span><a href="/api/plans/${id}/export.csv">Download CSV</a></div>
			<div><b>Brief as Markdown</b><span class="muted small">For Slack, email or a doc.</span><button type="button" data-copy-md>Copy</button></div>
			<div><b>Private link</b><span class="muted small">Claude publishes the pack to claude.ai and gives you a link to send.</span><button type="button" data-ask="share">Ask Claude</button></div>
		</div>
		<label class="f"><span class="fl">Your name on comments</span><input id="meName" value="${esc(store.get("cc-name", ""))}" placeholder="e.g. Sam"></label>
		<div class="btn-row end"><button value="close">Done</button></div></form>`;
	d.showModal();
	$("#meName", d).oninput = (e) => store.set("cc-name", e.target.value.trim());
	$("[data-copy-md]", d).onclick = async () => {
		const md = (await api(`/api/plans/${id}/export.md`)).body;
		await navigator.clipboard.writeText(md).then(() => toast("Brief copied as Markdown."), () => toast("Couldn't reach the clipboard."));
	};
	$("[data-ask='share']", d).addEventListener("click", () => d.close());
}
$("#shareBtn").onclick = openShare;
addEventListener("hashchange", () => {
	const id = location.hash.slice(1);
	if (id && id !== S.plan?.id) openPlan(id).catch(() => toast("No such plan."));
});
addEventListener("resize", () => S.view === "canvas" && applyView());

// ---------- boot ----------
(async () => {
	await refreshPlanList();
	let id = location.hash.slice(1) || store.get("cc-last", null);
	if (!S.plans.some((p) => p.id === id)) id = S.plans[0]?.id;
	setInterval(poll, 1500);
	if (!id) return newPlanFlow("My first plan");
	await openPlan(id);
})();
