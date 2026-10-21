// Paid media planner front end. One plan is open at a time; every edit goes through mutate() (undo snapshot, debounced
// save, redraw). The server file is the source of truth: when its version changes underneath (Claude edited it), the
// canvas adopts it. Node graph: campaign → ad set → ad, parent links drawn as edges from out-ports to in-ports.
import { PLATFORMS, OBJECTIVES, TYPES, STATUSES, STATUS_LABEL, FIELD_LABEL, newNode, nodeById, childrenOf, campaignOf, subtree, issuesByNode, adsetSummary, money, layoutPlan, firstFormat, uid } from "./model.mjs";
import { inView, planNetworks, viewPlan } from "./model.mjs";
import { FUNNEL, FUNNEL_LABEL, NAME_TOKENS, applyNaming, budgetPlan, conventionName, labelOf, normalize } from "./model.mjs";
import { CATALOG, MEDIA_TYPES, mediaType, mediaLabel, autoPlaced, adFormatLabel, bidLevel, bidStrategies, budgetLevels, channelPlans, defaultNative, derivedBudget, goalLabel, goalsFor, googleTypes, nativeObjective, objectiveLabel, options } from "./model.mjs";
import { renderMock, esc, formatLabel } from "./mocks.mjs";
import { renderBrief, dismissId } from "./brief.mjs";
import { canvasImages, zipStore } from "./images.mjs";

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
// Web mode is the hosted planner inside the GrowthCast client portal. env.js sets window.PLANNER_ENV and fills in the
// signed-in person, their role and their projects once the portal hands over a token. Staff edit; clients only view,
// and the server enforces the same. The Claude Code plugin leaves it unset.
const ENV = window.PLANNER_ENV ?? { mode: "local" };
const WEB = ENV.mode === "web";
let READONLY = false;
const me = () => (WEB ? ENV.user?.name || ENV.user?.email || "Me" : store.get("cc-name", "") || "Me");
// The network canvas on show ("" = all networks). Each network keeps its own node positions in node.views[network].
S.net = "";
const pos = (n) => (S.net ? n.views?.[S.net] ?? n : n);
function setPos(n, x, y) {
	if (S.net) (n.views ??= {})[S.net] = { x, y };
	else Object.assign(n, { x, y });
}
const visible = () => S.plan.nodes.filter((n) => inView(S.plan, n, S.net));
// Lays out a network's canvas: the tidy tree of what runs there. all = false places only nodes it hasn't placed yet.
function layoutNet(plan, net, all) {
	const shown = plan.nodes.filter((n) => inView(plan, n, net));
	const clones = shown.map((n) => ({ id: n.id, type: n.type, parent: shown.some((m) => m.id === n.parent) ? n.parent : null, x: 0, y: 0 }));
	layoutPlan({ nodes: clones });
	let placed = 0;
	for (const c of clones) {
		const n = nodeById(plan, c.id);
		if (all || !n.views?.[net]) ((n.views ??= {})[net] = { x: c.x, y: c.y }), placed++;
	}
	return placed;
}
const cv = $("#canvasView");
$("#netPalette").innerHTML = Object.entries(PLATFORMS).map(([k, p]) => `<span class="net" draggable="true" data-drag="net:${k}" style="--c:${p.color}">${p.short}</span>`).join("");

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
	$("#planSel").innerHTML = S.plans.map((p) => `<option value="${p.id}">${esc(p.projectName ? `${p.projectName} · ${p.name}` : p.name)}</option>`).join("");
	if (S.plan) $("#planSel").value = S.plan.id;
}
async function openPlan(id) {
	const { body } = await api(`/api/plans/${id}`);
	S.plan = body.plan;
	S.version = body.version;
	S.sel = S.selEdge = null;
	S.net = store.get(`cc-net-${id}`, "");
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
	if (READONLY) return;
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
async function poll(force = false) {
	if (!S.plan || S.saving || S.dirty || (document.hidden && force !== true)) return;
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
		const { body } = await api(WEB ? `/api/request?planId=${encodeURIComponent(S.plan?.id ?? "")}` : "/api/request");
		if (WEB && S.asking) return;
		S.request = body && body.planId === S.plan?.id && (WEB || Date.now() - body.at < 12 * 3600e3) ? body : null;
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
	// Same shaping as the server: derived budgets, one network per campaign, names on the convention.
	const shaped = normalize(S.plan);
	if (!shaped.errors.length) S.plan = { ...shaped.plan, id: S.plan.id };
	scheduleSave();
	if (rerender === "all") renderAll();
	else if (rerender === "light") renderLight();
	else renderNodes(), renderLeft();
	if ($("#settingsDlg").open) renderSettingsOut();
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
		if (!PLATFORMS[ad.data.platform].ctas.includes(ad.data.cta)) ad.data.cta = PLATFORMS[ad.data.platform].ctas[0];
	}
}
function addNode(type, { x, y, parent = null, data = {} } = {}) {
	const p = parent && nodeById(S.plan, parent);
	if (S.net && type === "campaign" && !data.platforms) data = { ...data, platforms: [S.net] };
	const n = newNode(type, { x, y, parent, platform: S.net || (p ? platformFor(p) : data.platforms?.[0] ?? "meta"), data: { name: `${TYPES[type].label} ${count(type) + 1}`, ...data } });
	if (S.net) n.views = { [S.net]: { x, y } };
	mutate((plan) => plan.nodes.push(n));
	select(n.id);
	return n;
}
function addChild(pid, data = {}) {
	const p = nodeById(S.plan, pid);
	const type = TYPES[p.type].child;
	const kids = childrenOf(S.plan, pid).filter((k) => inView(S.plan, k, S.net));
	return addNode(type, { x: pos(p).x + 380, y: kids.length ? Math.max(...kids.map((k) => pos(k).y)) + 170 : pos(p).y, parent: pid, data });
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
	const dy = Math.max(...ids.map((i) => pos(nodeById(S.plan, i)).y)) - Math.min(...ids.map((i) => pos(nodeById(S.plan, i)).y)) + 190;
	mutate((plan) => {
		for (const i of ids) {
			const n = structuredClone(nodeById(plan, i));
			const views = Object.fromEntries(Object.entries(n.views ?? {}).map(([k, v]) => [k, { x: v.x, y: v.y + dy }]));
			plan.nodes.push({ ...n, id: map[i], parent: map[n.parent] ?? n.parent, y: n.y + dy, views, status: "draft", comments: [], data: { ...n.data, name: i === id ? `${n.data.name} copy` : n.data.name } });
		}
	});
	select(map[id]);
}
function setPath(obj, path, value) {
	const keys = path.split(".");
	let o = obj;
	for (const k of keys.slice(0, -1)) o = o[k] ??= /^\d+$/.test(k) ? {} : {};
	o[keys.at(-1)] = value;
	if (Array.isArray(o)) for (let i = 0; i < o.length; i++) o[i] ??= "";
}
const getPath = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);
function ensureCards(ad, i) {
	while (ad.data.cards.length < Math.max(3, i + 1)) ad.data.cards.push({ headline: `Card ${ad.data.cards.length + 1} headline` });
}

// ---------- rendering ----------
function renderAll() {
	if (S.net && !S.plan.nodes.some((n) => n.type === "campaign" && n.data.platforms.includes(S.net))) S.net = "";
	if (S.net && layoutNet(S.plan, S.net, !visible().some((n) => n.views?.[S.net])) && !READONLY) scheduleSave();
	renderNetSwitch();
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
		body = `<div class="n-line"><span class="k">Objective</span> ${esc(objectiveLabel(n))}</div><div class="n-nets">${d.platforms.map((p) => `<span class="net" style="--c:${PLATFORMS[p].color}">${PLATFORMS[p].short}</span>`).join("") || '<span class="muted">No networks</span>'}</div><div class="n-line muted">${money(d.budget)}</div>`;
	if (n.type === "adset") body = `<div class="n-line">${esc(adsetSummary(d, campaignOf(S.plan, n)?.data.platforms[0]))}</div>${d.optimization ? `<div class="n-line muted">${esc(goalLabel(S.plan, n))}</div>` : ""}${d.interests.length ? `<div class="n-tags">${d.interests.slice(0, 3).map((i) => `<span>${esc(i)}</span>`).join("")}${d.interests.length > 3 ? `<span>+${d.interests.length - 3}</span>` : ""}</div>` : ""}`;
	if (n.type === "ad") body = `<div class="n-ad"><div class="n-thumb">${thumb(n)}</div><div class="n-adtext"><div class="n-hl">${esc(d.headline || "—")}</div><div class="n-line muted"><span class="net" style="--c:${PLATFORMS[d.platform]?.color}">${PLATFORMS[d.platform]?.short ?? d.platform}</span> ${esc(autoPlaced(S.plan, n) ? mediaLabel(d) : PLATFORMS[d.platform]?.formats[d.format]?.name ?? "")}${d.creative === "ugc" ? '<span class="n-ugc">UGC</span>' : ""}</div></div></div>`;
	return `<div class="node t-${n.type}${S.sel === n.id ? " sel" : ""}" data-id="${n.id}" style="transform:translate(${pos(n).x}px,${pos(n).y}px)">
	<div class="n-head"><span class="n-type">${t.label} <i>· ${t.sub}</i></span><span class="n-badges">${badges(issues)}</span></div>
	<div class="n-body"><div class="n-name">${esc(d.name)}</div>${body}</div>
	<div class="n-foot"><span class="st st-${n.status}">${STATUS_LABEL[n.status]}</span>${n.assignee ? `<span class="who" title="Assignee">@${esc(n.assignee)}</span>` : ""}${n.comments.length ? `<span class="muted">💬 ${n.comments.length}</span>` : ""}</div>
	${t.parent ? `<span class="port in" title="Drag to a ${TYPES[t.parent].label.toLowerCase()} to connect"></span>` : ""}
	${t.child ? `<span class="port out" title="Drag to connect or to create a ${TYPES[t.child].label.toLowerCase()}"></span><button class="n-add" data-add="${n.id}" title="Add ${TYPES[t.child].label.toLowerCase()}">+</button>` : ""}
</div>`;
}
function renderNodes() {
	const issues = issuesByNode(S.plan);
	const shown = visible();
	$("#nodes").innerHTML = shown.map((n) => nodeHtml(n, issues[n.id])).join("");
	$("#emptyHint").hidden = shown.length > 0;
}
const COLORS = { campaign: "var(--c-campaign)", adset: "var(--c-adset)" };
function curve(x1, y1, x2, y2) {
	const dx = Math.max(50, Math.abs(x2 - x1) / 2);
	return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}
function renderEdges() {
	let h = "";
	for (const n of visible()) {
		const p = n.parent && nodeById(S.plan, n.parent);
		if (!p || !inView(S.plan, p, S.net)) continue;
		const d = curve(pos(p).x + W, pos(p).y + PORT_Y, pos(n).x, pos(n).y + PORT_Y);
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
	const shown = visible();
	if (!shown.length) return (S.z = 1), (S.px = 40), (S.py = 20), applyView();
	const r = cv.getBoundingClientRect();
	const xs = shown.map((n) => pos(n).x), ys = shown.map((n) => pos(n).y);
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
// ✕ on any note: removes a check (until its text changes) or resolves a Claude note. Undo or "Restore" brings it back.
const xBtn = (i) => (READONLY ? "" : `<button class="iss-x" data-dismiss-issue="${esc(dismissId(i))}" title="Remove this note">✕</button>`);
function dismissIssue(id) {
	mutate((plan) => {
		if (id.startsWith("fb:")) {
			const f = plan.feedback.items[Number(id.slice(3))];
			if (f) Object.assign(f, { resolved: true, dismissed: true });
		} else if (!(plan.feedback.dismissed ??= []).includes(id.slice(4))) plan.feedback.dismissed.push(id.slice(4));
	});
}
function restoreIssues() {
	mutate((plan) => {
		plan.feedback.dismissed = [];
		for (const f of plan.feedback.items) if (f.dismissed) delete f.dismissed, (f.resolved = false);
	});
}
const removedCount = () => (S.plan.feedback.dismissed ?? []).length + S.plan.feedback.items.filter((f) => f.dismissed).length;
function renderLeft() {
	const issues = issuesByNode(S.plan);
	const all = Object.entries(issues).flatMap(([node, list]) => list.map((i) => ({ ...i, node: node === "plan" ? null : node })));
	const n = (s) => all.filter((i) => i.severity === s && i.source !== "claude").length;
	const claude = all.filter((i) => i.source === "claude");
	const row = (i) => {
		const node = i.node && nodeById(S.plan, i.node);
		return `<li class="sev-${i.severity}${i.source === "claude" ? " from-claude" : ""}" ${node ? `data-goto="${node.id}"` : ""}>${node ? `<b>${esc(node.data.name)}</b> ` : ""}${esc(i.text)}${xBtn(i)}</li>`;
	};
	$("#checks").innerHTML = `
		${S.plan.feedback.summary ? `<div class="fb-sum"><b>✦ Claude's review</b><p>${esc(S.plan.feedback.summary)}</p></div>` : ""}
		<div class="chk-counts"><span class="bd bd-error">${n("error")}</span> blockers <span class="bd bd-warn">${n("warn")}</span> to fix <span class="bd bd-info">${n("info")}</span> notes</div>
		<ul class="iss-list">${[...claude, ...all.filter((i) => i.source !== "claude")].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]).slice(0, 40).map(row).join("")}</ul>
		${removedCount() && !READONLY ? `<button class="linkish" data-restore-issues>Restore ${removedCount()} removed note${removedCount() === 1 ? "" : "s"}</button>` : ""}`;
}
const ASK = { generate: "Build from prompt", review: "Review plan", improve: "Improve selection", copy: "Write copy", creative: "Design creative", share: "Publish share link" };
function renderAsk() {
	const r = S.request;
	const el = $("#askState");
	if (WEB) {
		if (!r || (r.status !== "running" && Date.now() - Date.parse(r.finishedAt ?? 0) > 30 * 60e3)) return (el.hidden = true);
		el.hidden = false;
		el.className = r.status === "failed" ? "ask-state failed" : r.status === "running" ? "ask-state queued" : "ask-state got";
		el.innerHTML =
			r.status === "running"
				? `<b>✦ Claude is working on “${ASK[r.kind]}”.</b> This can take a couple of minutes. Changes appear here when it's done.`
				: r.status === "failed"
					? `<b>“${ASK[r.kind]}” didn't finish.</b> ${esc(r.error ?? "")} <button data-ask-clear>Dismiss</button>`
					: `<b>✦ ${ASK[r.kind]} done.</b> ${esc(r.summary ?? "")} <button data-ask-clear>Dismiss</button>`;
		return;
	}
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
	if (kind === "creative" && !S.plan.settings.context.length && !confirm("No positioning files are attached (Settings). Design creative from the brief alone?")) return;
	const nodeIds = S.sel && kind !== "generate" && kind !== "review" ? subtree(S.plan, S.sel) : [];
	if (S.dirty) await save();
	if (WEB) {
		// The hosted planner runs the request now and answers when it's done; the canvas then adopts the saved plan.
		if (S.asking) return toast("Claude is still working on the last request.");
		S.asking = true;
		S.request = { kind, status: "running", planId: S.plan.id };
		renderAsk();
		try {
			S.request = (await post("/api/request", { kind, planId: S.plan.id, note, nodeIds })).body;
			if (S.request.status === "done") $("#askNote").value = "";
		} catch (e) {
			S.request = { kind, status: "failed", error: e.message, finishedAt: new Date().toISOString() };
		} finally {
			S.asking = false;
		}
		renderAsk();
		return poll(true);
	}
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
	renderInspectorHtml();
	// Viewers read everything and change nothing.
	if (READONLY) for (const el of $$("#inspector input, #inspector textarea, #inspector select, #inspector button")) if (!el.matches("[data-tab]")) el.disabled = true;
}
function renderInspectorHtml() {
	const el = $("#inspector");
	const n = S.sel && nodeById(S.plan, S.sel);
	if (!n) return (el.innerHTML = planInspector());
	const tabs = n.type === "ad" ? ["mock", "details", "review"] : ["details", "review"];
	const tab = tabs.includes(S.tab[n.type]) ? S.tab[n.type] : tabs[0];
	const nIssues = issuesByNode(S.plan)[n.id] ?? [];
	el.innerHTML = `
	<div class="ins-head t-${n.type}"><span class="n-type">${TYPES[n.type].label} · ${TYPES[n.type].sub}</span>${
		S.plan.settings.naming.auto
			? `<input class="ins-name" data-bind="data.label" value="${esc(labelOf(n, S.plan.settings.naming[n.type]))}" title="The label: the full name follows the naming convention"><div class="muted small ins-full" data-fullname>${esc(n.data.name)}</div>`
			: `<input class="ins-name" data-bind="data.name" value="${esc(n.data.name)}">`
	}
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
// ---------- forms: every option comes from the network's catalog (platforms.mjs) ----------
const opts = (list) => options(list).map((o) => [o.id, o.label]);
const checks = (bind, list, chosen) => `<div class="cks">${options(list).map((o) => `<label class="ck"><input type="checkbox" data-multi="${bind}" value="${esc(o.id)}"${chosen.includes(o.id) ? " checked" : ""}> ${esc(o.label)}</label>`).join("")}</div>`;
const LEGACY_DIMS = ["interests", "customAudiences", "exclusions"];
const dimBind = (key) => (LEGACY_DIMS.includes(key) ? `data.${key}` : `data.targeting.${key}`);
const dimValue = (d, key) => (LEGACY_DIMS.includes(key) ? d[key] : d.targeting?.[key] ?? []);
const confirmMark = (x) => (x?.confirm ? ' <small class="warn" title="Couldn\'t be checked against an official page">confirm in ads manager</small>' : "");
function budgetHtml(n) {
	const d = n.data;
	const der = derivedBudget(S.plan, n);
	const P = PLATFORMS[der.network];
	if (!der.monthly) return `<p class="sug muted">Budgets are set per channel. Set ${P.short}'s monthly budget in <a href="#" data-open-settings>Settings</a>.</p>`;
	const split = der.peers > 1 ? (der.custom ? ` × ${Math.round(der.part * 100)}% of ${der.stage ? FUNNEL[der.stage] : "the channel"}` : ` ÷ ${der.peers} campaigns`) : "";
	const why = `${P.short} ${der.currency} ${der.monthly.toLocaleString()}/mo${der.stage ? ` × ${FUNNEL[der.stage]} ${Math.round(der.share * 100)}%` : ""}${split}`;
	const shareInp = der.peers > 1 ? f(`Share of ${der.stage ? FUNNEL[der.stage] : "channel"} budget % <small class="muted">blank splits the rest evenly</small>`, inp("data.budget.share", n.data.budget.share ?? "", `type="number" min="0" max="100" step="1" data-kind="num" placeholder="${Math.round(der.part * 100)}"`)) : "";
	return `<p class="sug"><span><b>${der.currency} ${der.daily}/day</b> · ${esc(why)}</span><a href="#" data-open-settings>Change</a></p>${shareInp}`;
}
// Under automatic placements an ad's format is what the creative is (video, static, carousel) plus its aspect ratio;
// the network format behind it (data.format) only sets the mock's shape. With chosen placements it's the placement.
const ratioOf = (f) => (f.ratio && f.ratio[0] < 100 ? `${f.ratio[0]}:${f.ratio[1]}` : f.name);
function formatForType(d, type) {
	const P = PLATFORMS[d.platform];
	const entries = Object.entries(P.formats);
	if (type === "carousel") return entries.find(([, f]) => f.cards)?.[0] ?? d.format;
	if (!P.formats[d.format]?.cards) return d.format;
	const want = type === "video" ? "9:16" : "4:5";
	return (entries.find(([, f]) => !f.cards && ratioOf(f) === want) ?? entries.find(([, f]) => !f.cards))?.[0] ?? d.format;
}
function formatRow(n, P, formats) {
	const d = n.data;
	const network = f("Network", `<input value="${esc(P.name)}" disabled>`);
	if (!autoPlaced(S.plan, n)) return `<div class="row2">${network}${f("Format", sel("data.format", formats.map(([k, v]) => [k, v.name]), d.format, "data-re"))}</div>`;
	const type = mediaType(d);
	const ratios = formats.filter(([, v]) => !v.cards).map(([k, v]) => [k, ratioOf(v)]);
	return `<div class="row2">${network}${f("Format", sel("data.mediaType", Object.entries(MEDIA_TYPES), type, "data-re"))}</div>
	${type === "carousel" ? "" : f("Aspect ratio", sel("data.format", ratios, d.format, "data-re"))}`;
}
// One field per text option, numbered: the main field is 1, the extras 2…n (Meta's multiple text options).
function optionFields(d, P, field, extra, control) {
	const max = P.limits[field];
	const list = d[extra] ?? [];
	const label = FIELD_LABEL[field];
	let h = f(`${label} 1`, control(`data.${field}`, d[field] ?? ""), cnt(d[field], max));
	for (let i = 0; i < P.options[field] - 1; i++) h += f(`${label} ${i + 2}`, control(`data.${extra}.${i}`, list[i] ?? ""), cnt(list[i] ?? "", max));
	return h;
}
// Responsive search ad assets past the first ones: numbered fields up to Google's 15 headlines and 4 descriptions.
function searchOptions(d, field, extra, from, to, max) {
	const list = d[extra] ?? [];
	const label = FIELD_LABEL[field];
	let h = "";
	for (let i = 0; i <= to - from; i++) h += f(`${label} ${from + i}`, field === "description" ? area(`data.${extra}.${i}`, list[i] ?? "", 2) : inp(`data.${extra}.${i}`, list[i] ?? ""), cnt(list[i] ?? "", max));
	return h;
}
function campaignForm(n) {
	const d = n.data;
	const net = d.platforms[0] ?? "meta";
	const C = CATALOG[net];
	const native = nativeObjective(net, d.nativeObjective);
	const level = bidLevel(net, d.budget.level);
	const bids = bidStrategies(net, d.campaignType);
	const bid = bids.find((b) => b.id === d.bidStrategy);
	return `
	<div class="f"><span class="fl">Network <small class="muted">a campaign runs on one network</small></span><div class="chips">${Object.entries(PLATFORMS).map(([k, p]) => `<button class="chip${net === k ? " on" : ""}" data-net="${k}" style="--c:${p.color}">${p.short}</button>`).join("")}</div></div>
	<div class="row2">${f(`Objective <small class="muted">as ${PLATFORMS[net].short} names it</small>`, sel("data.nativeObjective", C.objectives.map((o) => [o.id, o.label + (o.confirm ? " *" : "")]), d.nativeObjective, "data-re"))}${f("Funnel stage", sel("data.funnel", [["", "—"], ...Object.entries(FUNNEL)], d.funnel, "data-re"))}</div>
	${confirmMark(native) ? `<p class="small">${confirmMark(native)}</p>` : ""}
	${net === "google" ? `${f("Campaign type", sel("data.campaignType", googleTypes().map((t) => [t.id, t.label]), d.campaignType, "data-re"))}
	${d.campaignType === "SEARCH" || d.campaignType === "DISPLAY" ? `<div class="f"><span class="fl">Networks</span>${checks("data.networks", CATALOG.google.networks, d.networks)}</div>` : ""}
	${f("Locations <small class=\"muted\">a Google campaign setting</small>", listInp("data.locations", d.locations, "United States, Austin TX"))}
	${f("Languages", listInp("data.languages", d.languages, "English"))}` : ""}
	${C.special ? f("Special ad category", sel("data.special", opts(C.special), d.special, "data-re")) : ""}
	<div class="f"><span class="fl">Daily budget <small class="muted">from the channel budget</small></span>${budgetHtml(n)}</div>
	${budgetLevels(net).length > 1 ? f("Budget set at", sel("data.budget.level", budgetLevels(net), d.budget.level, "data-re")) : `<p class="muted small">${esc(budgetLevels(net)[0][1])}</p>`}
	${level === "campaign" ? `<div class="row2">${f("Bid strategy", sel("data.bidStrategy", [["", "—"], ...bids.map((b) => [b.id, b.label])], d.bidStrategy, "data-re"))}${bid?.flag ? f(bid.flag === "roas" ? "Target ROAS %" : `Target (${d.budget.currency})`, inp("data.bidAmount", d.bidAmount, 'type="number" min="0" step="any" data-kind="num"')) : ""}</div>` : ""}
	<div class="row2">${f("Start", inp("data.schedule.start", d.schedule.start, 'type="date"'))}${f("End", inp("data.schedule.end", d.schedule.end, 'type="date"'))}</div>
	${f("KPI / target", inp("data.kpi", d.kpi, 'placeholder="e.g. CPL under $40, 120 leads/month"'))}
	${f("Notes", area("data.notes", d.notes, 3))}
	<button class="wide" data-add="${n.id}">+ Add ${PLATFORMS[net].levels[1].toLowerCase()}</button>`;
}
function adsetForm(n) {
	const d = n.data;
	const camp = campaignOf(S.plan, n);
	const net = camp?.data.platforms[0] ?? "meta";
	const C = CATALOG[net];
	const native = nativeObjective(net, camp?.data.nativeObjective);
	const goals = goalsFor(net, native?.id);
	const age = C.age;
	const level = bidLevel(net, camp?.data.budget.level);
	const bids = bidStrategies(net, camp?.data.campaignType);
	const bid = bids.find((b) => b.id === d.bidStrategy);
	const range = (lo, hi, plusAt) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((v) => [v, v === plusAt ? `${v}+` : String(v)]);
	let ageHtml = `<p class="muted small">${PLATFORMS[net].short} doesn't target by age.</p>`;
	if (age?.kind === "range") ageHtml = `<div class="row2">${f("Age from", sel("data.ageMin", range(age.min, age.max, -1), d.ageMin, 'data-kind="num"'))}${f("to", sel("data.ageMax", range(age.min, age.max, age.plusAt), d.ageMax, 'data-kind="num"'))}</div>${age.confirm ? `<p class="small">${confirmMark(age)}</p>` : ""}`;
	if (age?.kind === "x") ageHtml = `<div class="row2">${f("Age from", sel("data.ageMin", age.from.map((v) => [v, String(v)]), d.ageMin, 'data-kind="num"'))}${f("to", sel("data.ageMax", age.to.map((v) => [v, v ? String(v) : "and up"]), d.ageMax, 'data-kind="num"'))}</div>`;
	if (age?.kind === "buckets") ageHtml = `<div class="f"><span class="fl">Age groups <small class="muted">none ticked = all ages</small></span>${checks("data.ageBuckets", age.options, d.ageBuckets)}</div>`;
	const manual = Array.isArray(d.placements);
	return `
	${C.geoLevel === "campaign" ? `<p class="muted small">Locations and languages are set on the ${PLATFORMS[net].short} campaign.</p>` : `${f("Locations", listInp("data.locations", d.locations, "United States, Austin TX +25mi"))}${f("Languages", listInp("data.languages", d.languages, "English"))}`}
	${native?.destinations ? f("Conversion location", sel("data.destination", [["", "—"], ...native.destinations.map((x) => [x, x])], d.destination, "data-re")) : ""}
	${goals.length ? f(`Performance goal <small class="muted">${esc(native.label)}</small>`, sel("data.optimization", [["", "—"], ...goals.map((g) => [g.id, g.label]), ...(d.optimization && !goals.some((g) => g.id === d.optimization) ? [[d.optimization, `${d.optimization} (not offered)`]] : [])], d.optimization, "data-re")) : f(`Conversion goal <small class="muted">${PLATFORMS[net].short} optimizes to the campaign's bid strategy and these conversions</small>`, inp("data.optimization", d.optimization, 'placeholder="e.g. Paid signup (Purchase)"'))}
	${ageHtml}
	${f("Gender", sel("data.genders", opts(C.genders), d.genders))}
	${options(C.targeting).map((t) => f(esc(t.label), `<textarea data-bind="${dimBind(t.id)}" data-kind="list" rows="2">${esc(dimValue(d, t.id).join(", "))}</textarea>`)).join("")}
	${C.placements ? `<div class="f"><span class="fl">Placements</span>${sel("data.placements", [["automatic", C.placements.automatic], ["manual", "Choose placements"]], manual ? "manual" : "automatic", 'data-placemode data-re')}${manual ? checks("data.placements", C.placements.options, d.placements) : ""}</div>` : ""}
	${level === "adset" ? `<div class="row2">${f("Bid strategy", sel("data.bidStrategy", [["", "—"], ...bids.map((b) => [b.id, b.label])], d.bidStrategy, "data-re"))}${bid?.flag ? f(bid.flag === "roas" ? "Target ROAS %" : `Target (${camp?.data.budget.currency ?? "USD"})`, inp("data.bidAmount", d.bidAmount, 'type="number" min="0" step="any" data-kind="num"')) : ""}</div>` : ""}
	${d.budget ? `<div class="f"><span class="fl">Daily budget <small class="muted">campaign budget split across its ${PLATFORMS[net].levels[1].toLowerCase()}s</small></span><p class="sug"><b>${esc(money(d.budget))}</b></p></div>` : ""}
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
	const camp = campaignOf(S.plan, n);
	const type = d.platform === "google" ? googleTypes().find((t) => t.id === camp?.data.campaignType) : null;
	const formats = Object.entries(P.formats).filter(([k]) => !type || type.formats.includes(k));
	return `
	${formatRow(n, P, formats)}
	${P.options && !search ? optionFields(d, P, "primaryText", "extraPrimaryTexts", (b, v) => area(b, v, 3)) : search ? "" : f("Primary text", area("data.primaryText", d.primaryText, 4), cnt(d.primaryText, L.primaryText))}
	${P.options && !search ? optionFields(d, P, "headline", "extraHeadlines", inp) : f(search ? "Headline 1" : "Headline", inp("data.headline", d.headline), cnt(d.headline, L.headline))}
	${search ? f("Headline 2", inp("data.headline2", d.headline2), cnt(d.headline2, L.headline2)) : ""}
	${search ? searchOptions(d, "headline", "extraHeadlines", 3, 15, L.headline) : ""}
	${P.options && !search ? optionFields(d, P, "description", "extraDescriptions", inp) : f(search ? "Description 1" : "Description", area("data.description", d.description, 2), cnt(d.description, L.description))}
	${search ? searchOptions(d, "description", "extraDescriptions", 2, 4, L.description) : ""}
	${search ? `<div class="row2">${f("Path 1", inp("data.path1", d.path1, 'maxlength="15"'), cnt(d.path1, 15))}${f("Path 2", inp("data.path2", d.path2, 'maxlength="15"'), cnt(d.path2, 15))}</div>` : ""}
	<div class="row2">${search ? "" : f("Call to action", sel("data.cta", [...P.ctas, ...(P.ctas.includes(d.cta) ? [] : [d.cta])].map((c) => [c, P.ctas.includes(c) ? c : `${c} (not offered)`]), d.cta))}${f("Display URL", inp("data.displayUrl", d.displayUrl))}</div>
	${f("Landing page URL", inp("data.url", d.url, 'type="url"'))}
	<div class="f"><span class="fl">Creative</span><div class="media-list">${d.media.map((m, i) => `<div class="mi">${m.kind === "video" ? `<video src="${esc(m.src)}" muted></video>` : `<img src="${esc(m.src)}" alt="">`}<button data-media-rm="${i}" title="Remove">✕</button></div>`).join("")}<button class="mi add" data-upload>+ Upload</button></div>
		<input class="url-add" data-media-url placeholder="…or paste an image URL and press Enter"></div>
	${f("Creative made by", sel("data.creative", [["produced", "Produced (designed or generated)"], ["ugc", "Creator (UGC): keep the placeholder"]], d.creative, "data-re"))}
	${d.creative === "ugc" ? "" : f("Generation prompt / shot list", area("data.prompt", d.prompt, 3, 'placeholder="What Design creative should make: scene, subject, composition, text overlay, motion."'))}
	${f(d.creative === "ugc" ? "Creator brief" : "Notes / creative direction", area("data.notes", d.notes, 3, 'placeholder="Shot, subject, text overlay, music…"'))}`;
}
// Switching a campaign's network: native objective, budget level and bids reset to what that network offers, and its
// ads move to the network's first format.
function setNetwork(plan, campId, net) {
	const c = nodeById(plan, campId);
	if (!c || c.data.platforms[0] === net) return;
	c.data.platforms = [net];
	c.data.nativeObjective = defaultNative(net, c.data.objective)?.id ?? "";
	c.data.budget.level = budgetLevels(net)[0][0];
	Object.assign(c.data, { bidStrategy: "", bidAmount: "", special: "NONE", campaignType: net === "google" ? "SEARCH" : "", networks: net === "google" ? ["search"] : [] });
	for (const a of childrenOf(plan, c.id)) Object.assign(a.data, { optimization: "", destination: "", bidStrategy: "", bidAmount: "", placements: "automatic", ageBuckets: [] });
	for (const a of subtree(plan, c.id).map((i) => nodeById(plan, i)).filter((x) => x.type === "ad")) conform(plan, a);
}
function fmtChoices(n) {
	return netOptions(n).flatMap((p) => Object.entries(PLATFORMS[p].formats).map(([k, v]) => ({ p, k, label: `${PLATFORMS[p].short} · ${v.name}` })));
}
// Under automatic placements the mock's chips pick what the creative is and its shape, not a placement.
function kindChoices(n) {
	const P = PLATFORMS[n.data.platform];
	const all = Object.entries(P.formats);
	const order = { "9:16": 0, "4:5": 1, "1:1": 2 };
	const flat = all.filter(([, f]) => !f.cards).sort(([, a], [, b]) => (order[ratioOf(a)] ?? 9) - (order[ratioOf(b)] ?? 9));
	const statics = [...flat].sort(([, a], [, b]) => (ratioOf(a) === "4:5" ? -1 : ratioOf(b) === "4:5" ? 1 : 0));
	return [
		...flat.map(([k, f]) => ({ type: "video", k, label: `Video ${ratioOf(f)}` })),
		...statics.map(([k, f]) => ({ type: "static", k, label: `Static ${ratioOf(f)}` })),
		...all.filter(([, f]) => f.cards).map(([k, f]) => ({ type: "carousel", k, label: `Carousel ${ratioOf(f)}` })),
	];
}
function mockTab(n) {
	const d = n.data;
	const chips = autoPlaced(S.plan, n)
		? kindChoices(n).map((c) => `<button class="chip${c.type === mediaType(d) && c.k === d.format ? " on" : ""}" style="--c:${PLATFORMS[d.platform].color}" data-setkind="${c.type}:${c.k}">${esc(c.label)}</button>`).join("")
		: fmtChoices(n).map((c) => `<button class="chip${c.p === d.platform && c.k === d.format ? " on" : ""}" style="--c:${PLATFORMS[c.p].color}" data-setfmt="${c.p}:${c.k}">${esc(c.label)}</button>`).join("");
	return `
	<div class="fmt-chips">${chips}</div>
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
	return `
	<div class="row2">${f("Status", sel("status", STATUSES.map((s) => [s, STATUS_LABEL[s]]), n.status, "data-re"))}${f("Assignee", inp("assignee", n.assignee, 'placeholder="name"'))}</div>
	<h4>Feedback</h4>
	${items.length ? `<ul class="iss-list big">${items.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]).map((i) => `<li class="sev-${i.severity}${i.source === "claude" ? " from-claude" : ""}"><div>${i.source === "claude" ? "<b>✦</b> " : ""}${esc(i.text)}</div>${i.suggestion ? `<div class="sugg">→ ${esc(i.suggestion)}</div>` : ""}${i.source === "claude" ? `<button data-resolve="${i.fb}">Resolve</button>` : ""}${xBtn(i)}</li>`).join("")}</ul>` : `<p class="muted small">No open feedback. Use “Review plan” on the left to ask Claude.</p>`}
	<h4>Comments</h4>
	<ul class="comments">${n.comments.map((c) => `<li><b>${esc(c.author)}</b> <small class="muted">${new Date(c.at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</small><p>${esc(c.text)}</p></li>`).join("") || '<li class="muted small">No comments yet.</li>'}</ul>
	<textarea id="commentText" rows="2" placeholder="Comment as ${esc(me())}…"></textarea>
	<button class="wide" data-comment>Comment</button>`;
}
function mockHost(n, platform, format, primary) {
	return `<figure class="mockhost${primary ? "" : " alt"}" data-ad="${n.id}" data-platform="${platform}" data-format="${format}">
		<figcaption><b>${esc(n.data.name)}</b><span>${esc(primary ? adFormatLabel(S.plan, n) : formatLabel(platform, format))}</span>${primary ? "" : `<button data-use="${platform}:${format}">Use</button>`}</figcaption>
		${renderMock(n.data, S.plan.brand, { editable: !READONLY, platform, format })}</figure>`;
}

// ---------- mocks & brief views ----------
function renderMocks() {
	const ads = visible().filter((n) => n.type === "ad");
	const host = (ad) => (S.allFormats ? fmtChoices(ad).map((c) => mockHost(ad, c.p, c.k, c.p === ad.data.platform && c.k === ad.data.format)).join("") : mockHost(ad, ad.data.platform, ad.data.format, true));
	let h = `<div class="mv-bar"><label><input type="checkbox" id="allFmt"${S.allFormats ? " checked" : ""}> Preview each ad in every format its campaign runs</label><span class="muted">Click text to rewrite it. Drop images or video on a block.</span></div>`;
	if (!ads.length) h += `<p class="muted pad">No ads yet. Add one on the canvas.</p>`;
	for (const c of visible().filter((n) => n.type === "campaign")) {
		h += `<section class="mv-camp"><h2><span class="lvl lvl-campaign">Campaign</span> ${esc(c.data.name)}</h2>`;
		for (const s of childrenOf(S.plan, c.id)) {
			const kids = childrenOf(S.plan, s.id).filter((a) => inView(S.plan, a, S.net));
			h += `<h3><span class="lvl lvl-adset">Ad set</span> ${esc(s.data.name)} <small class="muted">${esc(adsetSummary(s.data, c.data.platforms[0]))}</small></h3><div class="mv-grid">${kids.map(host).join("") || '<p class="muted">No ads.</p>'}</div>`;
		}
		h += `</section>`;
	}
	const loose = ads.filter((a) => !a.parent || !nodeById(S.plan, a.parent)?.parent);
	if (loose.length) h += `<section class="mv-camp"><h2>Not connected</h2><div class="mv-grid">${loose.map(host).join("")}</div></section>`;
	$("#mocksView").innerHTML = h;
}
function renderBriefView() {
	const v = $("#briefView");
	// Don't rebuild under someone typing in the brief: they'd lose the caret. It catches up on blur.
	if (v.contains(document.activeElement) && document.activeElement.matches(".ed")) return;
	const top = v.scrollTop;
	v.innerHTML = `<div class="brief-bar"><span class="muted">This is what the hand-off pack shows. ${READONLY ? "Double-click any part to open it on the canvas." : "Click any outlined text to edit it here; double-click a heading to open it on the canvas."}</span>${removedCount() && !READONLY ? `<button data-restore-issues>Restore ${removedCount()} removed</button>` : ""}<button data-share>Share…</button></div>${renderBrief(S.plan, { interactive: true, editable: !READONLY })}`;
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
	if (READONLY) return;
	const ids = e.shiftKey ? subtree(S.plan, id).filter((i) => inView(S.plan, nodeById(S.plan, i), S.net)) : [id];
	const orig = ids.map((i) => [nodeById(S.plan, i), pos(nodeById(S.plan, i)).x, pos(nodeById(S.plan, i)).y]);
	const before = JSON.stringify(S.plan);
	drag(
		e,
		(ev, dx, dy) => {
			for (const [m, x, y] of orig) {
				setPos(m, Math.round(x + dx / S.z), Math.round(y + dy / S.z));
				const el = $(`.node[data-id="${m.id}"]`);
				if (el) el.style.transform = `translate(${pos(m).x}px,${pos(m).y}px)`;
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
	if (READONLY) return;
	const src = nodeById(S.plan, id);
	const out = port.classList.contains("out");
	const want = out ? TYPES[src.type].child : TYPES[src.type].parent;
	const sx = out ? pos(src).x + W : pos(src).x, sy = pos(src).y + PORT_Y;
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
	if (READONLY) return;
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
		if (t?.type === "campaign") return mutate((plan) => setNetwork(plan, t.id, value));
		if (t?.type === "ad") return toast("An ad runs on its campaign's network. Drop the network on the campaign to switch it.");
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
	if (el.dataset.kind === "lines") return el.value.split("\n").map((s) => s.trim()).filter(Boolean);
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
	if (el.dataset.multi && e.type === "change") {
		const vals = $$(`#inspector [data-multi="${el.dataset.multi}"]:checked`).map((x) => x.value);
		return mutate((plan) => setPath(nodeById(plan, S.sel), el.dataset.multi, vals));
	}
	if (el.dataset.placemode != null && e.type === "change") {
		const all = options(CATALOG[campaignOf(S.plan, nodeById(S.plan, S.sel))?.data.platforms[0]]?.placements?.options).map((o) => o.id);
		return mutate((plan) => (nodeById(plan, S.sel).data.placements = el.value === "manual" ? all : "automatic"));
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
			if (el.dataset.bind === "data.mediaType") node.data.format = formatForType(node.data, el.value);
		},
		{ coalesce: `${n.id}.${el.dataset.bind}`, rerender: re ? "all" : "light" },
	);
	if (el.dataset.bind === "data.label") $("[data-fullname]").textContent = nodeById(S.plan, n.id).data.name;
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
		return mutate((plan) => setNetwork(plan, S.sel, el.dataset.net));
	if ((el = b("[data-setkind]"))) {
		const [type, fmt] = el.dataset.setkind.split(":");
		return mutate((plan) => Object.assign(nodeById(plan, S.sel).data, { mediaType: type, format: fmt }));
	}
	if ((el = b("[data-setfmt]")) || (el = b("[data-use]"))) {
		const [p, fmt] = (el.dataset.setfmt ?? el.dataset.use).split(":");
		const id = el.closest("[data-ad]")?.dataset.ad ?? S.sel;
		return mutate((plan) => Object.assign(nodeById(plan, id).data, { platform: p, format: fmt }));
	}
	if ((el = b("[data-dismiss-issue]"))) return dismissIssue(el.dataset.dismissIssue);
	if (b("[data-restore-issues]")) return restoreIssues();
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
		if (WEB) return (S.request = null), renderAsk();
		await api("/api/request", { method: "DELETE" });
		return pollRequest();
	}
	if (b("[data-share]")) return openShare();
	if (b("[data-open-settings]")) return e.preventDefault(), openSettings();
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
// In-place editing in the Brief view: plan text, campaign and ad set notes, ad copy.
document.addEventListener("input", (e) => {
	const ed = e.target.closest?.("#briefView .ed[data-bfield]");
	if (!ed || READONLY) return;
	const { bnode, bfield } = ed.dataset;
	const value = ed.innerText.replace(/\n+$/, "");
	mutate(
		(plan) => {
			const target = bnode === "plan" ? plan : nodeById(plan, bnode)?.data;
			if (target) setPath(target, bfield, value);
		},
		{ coalesce: `brief.${bnode}.${bfield}`, rerender: "none" },
	);
	const num = ed.closest("tr")?.querySelector("td.num");
	if (num) {
		const max = Number(num.dataset.max) || 0;
		num.textContent = max ? `${value.length}/${max}` : String(value.length);
		num.classList.toggle("over", !!max && value.length > max);
	}
	if (bnode === "plan" && bfield === "name") renderTop();
});
document.addEventListener("focusout", (e) => {
	if (e.target.closest?.("#briefView .ed[data-bfield]")) setTimeout(() => S.view === "brief" && renderBriefView());
});
document.addEventListener("keydown", (e) => {
	const bed = e.target.closest?.("#briefView .ed[data-bfield]");
	if (bed && e.key === "Enter" && !bed.hasAttribute("data-multi")) return e.preventDefault(), bed.blur();
	if (bed && e.key === "Escape") return bed.blur();
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
	if (e.target.closest?.("#briefView .ed")) return;
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
	if (READONLY && (mod || e.key === "Delete" || e.key === "Backspace")) return;
	if (mod && e.key.toLowerCase() === "d" && S.sel) return e.preventDefault(), duplicate(S.sel);
	if (e.key === "[") return setPanels(!panels().left, panels().right);
	if (e.key === "]") return setPanels(panels().left, !panels().right);
	if (e.key === "\\") return setPanels(!(panels().left || panels().right), !(panels().left || panels().right));
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

// ---------- network canvases, panels ----------
function renderNetSwitch() {
	const nets = planNetworks(S.plan);
	const el = $("#netSwitch");
	el.hidden = S.view === "brief" || !nets.length;
	const ads = (k) => S.plan.nodes.filter((n) => n.type === "ad" && (!k || n.data.platform === k)).length;
	el.innerHTML = [["", "All networks"], ...nets.map((k) => [k, PLATFORMS[k].short])]
		.map(([k, label]) => `<button data-netview="${k}" class="${S.net === k ? "on" : ""}" ${k ? `style="--c:${PLATFORMS[k].color}"` : ""} title="${k ? `${PLATFORMS[k].name}: its own canvas` : "Every network on one canvas"}">${k ? '<i class="dot"></i>' : ""}${label} <small>${ads(k)}</small></button>`)
		.join("");
}
function setNet(k) {
	S.net = k;
	store.set(`cc-net-${S.plan.id}`, k);
	if (S.sel && !inView(S.plan, nodeById(S.plan, S.sel), k)) S.sel = null;
	renderAll();
	if (S.view === "canvas") fit();
}
$("#netSwitch").addEventListener("click", (e) => {
	const b = e.target.closest("[data-netview]");
	if (b) setNet(b.dataset.netview);
});
function setPanels(left, right) {
	document.body.classList.toggle("hide-left", !left);
	document.body.classList.toggle("hide-right", !right);
	$("#toggleLeft").setAttribute("aria-pressed", left);
	$("#toggleRight").setAttribute("aria-pressed", right);
	store.set("cc-panels", { left, right });
	if (S.plan && S.view === "canvas") requestAnimationFrame(applyView);
}
const panels = () => ({ left: !document.body.classList.contains("hide-left"), right: !document.body.classList.contains("hide-right") });
$("#toggleLeft").onclick = () => setPanels(!panels().left, panels().right);
$("#toggleRight").onclick = () => setPanels(panels().left, !panels().right);
setPanels(store.get("cc-panels", { left: true, right: true }).left, store.get("cc-panels", { left: true, right: true }).right);

// ---------- top bar, share ----------
$("#planSel").addEventListener("change", (e) => openPlan(e.target.value));
$("#planName").addEventListener("input", (e) => mutate((plan) => (plan.name = e.target.value), { coalesce: "plan.name", rerender: "light" }));
$("#planStatus").addEventListener("change", (e) => mutate((plan) => (plan.status = e.target.value)));
$$(".views button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
$("#zoomIn").onclick = () => zoomBy(1.2);
$("#zoomOut").onclick = () => zoomBy(1 / 1.2);
$("#zoomFit").onclick = fit;
$("#tidy").onclick = () => {
	mutate((plan) => (S.net ? layoutNet(plan, S.net, true) : layoutPlan(plan)));
	fit();
};
$("#newPlan").onclick = () => {
	if (WEB) return newPlanDialog();
	const name = prompt("Name the new plan:", "Untitled plan");
	if (name != null) newPlanFlow(name);
};
// The hosted planner files every plan under a portal project, which decides which clients can review it.
function newPlanDialog() {
	const d = $("#shareDlg");
	if (!ENV.projects?.length) return toast("Create a project in the portal first: every plan belongs to one.");
	d.innerHTML = `<form method="dialog"><h3>New campaign plan</h3>
		<label class="f"><span class="fl">Name</span><input id="npName" value="Untitled plan" required></label>
		<label class="f"><span class="fl">Project</span><select id="npProject">${ENV.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>
		<p class="muted small">Clients assigned to the project can review the plan, comment and approve.</p>
		<div class="btn-row end"><button value="cancel">Cancel</button><button value="ok" class="primary">Create</button></div></form>`;
	d.showModal();
	$("#npName", d).select();
	d.onclose = () => {
		d.onclose = null;
		if (d.returnValue === "ok") newPlanFlow($("#npName", d).value.trim(), $("#npProject", d).value);
	};
}
async function newPlanFlow(name, projectId) {
	const { body } = await post("/api/plans", { name: name || "Untitled plan", projectId });
	await refreshPlanList();
	await openPlan(body.plan.id);
}
function openShare() {
	const d = $("#shareDlg");
	const id = S.plan.id;
	const nets = planNetworks(S.plan);
	let net = S.net;
	const q = (extra = "") => { const p = new URLSearchParams(extra); if (net) p.set("net", net); const t = p.toString(); return t ? `?${t}` : ""; };
	d.innerHTML = `<form method="dialog">
		<h3>Share “${esc(S.plan.name)}”</h3>
		<p class="muted small">For sign-off upward and for whoever builds it in each ads manager. Every export has the brief, each network's objective, targeting, finished copy, native mocks and the build steps.</p>
		${nets.length > 1 ? `<label class="f"><span class="fl">Covers</span><select id="shareNet">${[["", "All networks"], ...nets.map((k) => [k, `${PLATFORMS[k].name} canvas only`])].map(([k, l]) => `<option value="${k}"${k === net ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>` : ""}
		<div class="share-opts">
			<div><b>Slide deck (PDF)</b><span class="muted small">Walks through the structure, objectives, budget, targeting and every ad as a mockup. For the sign-off meeting.</span><button type="button" data-pdf>Download PDF</button><a data-href="slides.html" target="_blank">Open slides</a></div>
			<div><b>Excel workbook</b><span class="muted small">Summary and budget, campaigns, ad sets, the build sheet (one row per ad) and open checks, one tab each.</span><a data-href="export.xlsx">Download .xlsx</a></div>
			<div><b>Hand-off pack</b><span class="muted small">One HTML file with review and build checklist: open, email, or drop in a drive.</span><a data-href="export.html" target="_blank">Preview</a><a data-href="export.html" data-q="download">Download</a></div>
			<div><b>Build sheet</b><span class="muted small">CSV, one row per ad, for the person building it.</span><a data-href="export.csv">Download CSV</a></div>
			<div><b>Canvas images</b><span class="muted small">PNGs of the whole canvas, each network's canvas and each campaign on its own, for decks and docs.</span><button type="button" data-images>Download .zip</button></div>
			<div data-gads><b>Google Ads Editor</b><span class="muted small" data-gads-note></span><a data-href="google-ads-editor.zip" data-gads-dl>Download .zip</a><button type="button" disabled data-gads-off>Download .zip</button></div>
			<div><b>Brief as Markdown</b><span class="muted small">For Slack, email or a doc.</span><button type="button" data-copy-md>Copy</button></div>
			${WEB ? `<div><b>Portal link</b><span class="muted small">Opens this plan in the client portal, for staff and for the clients assigned to its project.</span><button type="button" data-copy-link="client">Copy client link</button><button type="button" data-copy-link="staff">Copy staff link</button></div>` : `<div><b>Private link</b><span class="muted small">Claude publishes the pack to claude.ai and gives you a link to send.</span><button type="button" data-ask="share">Ask Claude</button></div>`}
		</div>
		${WEB ? "" : `<label class="f"><span class="fl">Your name on comments</span><input id="meName" value="${esc(store.get("cc-name", ""))}" placeholder="e.g. Sam"></label>`}
		<div class="btn-row end"><button value="close">Done</button></div></form>`;
	const links = () => $$("[data-href]", d).forEach((a) => (a.href = `/api/plans/${id}/${a.dataset.href}${q(a.dataset.q ?? "")}`));
	links();
	// Google Ads Editor: always listed, so it's findable; it explains what it needs when the plan or view has no Google campaigns.
	const gads = () => {
		const ok = nets.includes("google") && (!net || net === "google");
		$("[data-gads-note]", d).textContent = ok
			? "A zip of import files for Google Ads Editor: campaigns, locations, ad groups, keywords, negatives and responsive search ads, plus the import steps. Campaigns import paused."
			: nets.includes("google")
				? "Import files for Google Ads Editor. Choose All networks or the Google Ads canvas above to export them."
				: "Import files for Google Ads Editor. Add a Google Ads campaign to this plan to export them.";
		$("[data-gads-dl]", d).hidden = !ok;
		$("[data-gads-off]", d).hidden = ok;
	};
	gads();
	d.showModal();
	$("#shareNet", d)?.addEventListener("change", (e) => {
		net = e.target.value;
		links();
		gads();
	});
	$("#meName", d)?.addEventListener("input", (e) => store.set("cc-name", e.target.value.trim()));
	for (const b of $$("[data-copy-link]", d))
		b.onclick = () => {
			const url = `${ENV.portalOrigin}${b.dataset.copyLink === "client" ? "/portal/campaign-planner" : "/dashboard/campaign-planner"}?plan=${encodeURIComponent(id)}`;
			navigator.clipboard.writeText(url).then(() => toast("Link copied."), () => toast(url));
		};
	$("[data-images]", d).onclick = async (e) => {
		const btn = e.currentTarget;
		btn.disabled = true;
		btn.textContent = "Drawing…";
		try {
			await downloadCanvasImages(net);
		} catch (err) {
			toast(`Couldn't make the images: ${err.message}`);
		} finally {
			btn.disabled = false;
			btn.textContent = "Download .zip";
		}
	};
	$("[data-copy-md]", d).onclick = async () => {
		const md = (await api(`/api/plans/${id}/export.md${q()}`)).body;
		await navigator.clipboard.writeText(md).then(() => toast("Brief copied as Markdown."), () => toast("Couldn't reach the clipboard."));
	};
	$("[data-pdf]", d).onclick = async (e) => {
		const btn = e.currentTarget;
		btn.disabled = true;
		btn.textContent = "Making PDF…";
		try {
			const r = await fetch(`/api/plans/${id}/slides.pdf${q()}`);
			if (!r.ok) {
				toast(((await r.json().catch(() => null))?.error ?? "Couldn't make the PDF.") + " Opening the slides to print instead.");
				openAuthed(`/api/plans/${id}/slides.html${q("print")}`, true);
				return;
			}
			const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await r.blob()), download: (r.headers.get("content-disposition") ?? "").match(/filename="(.+)"/)?.[1] ?? "slides.pdf" });
			a.click();
			setTimeout(() => URL.revokeObjectURL(a.href), 5000);
		} finally {
			btn.disabled = false;
			btn.textContent = "Download PDF";
		}
	};
	$("[data-ask='share']", d)?.addEventListener("click", () => d.close());
}
$("#shareBtn").onclick = openShare;

// ---------- settings: naming convention, test budget, funnel weighting, positioning files ----------
function openSettings() {
	const d = $("#settingsDlg");
	const st = S.plan.settings;
	const tpl = (type) => `${f(`${TYPES[type].label} name`, `<input data-sbind="naming.${type}" value="${esc(st.naming[type])}">`)}<div class="tok">${NAME_TOKENS[type].map((t) => `<code data-tok="${type}" title="Insert">{${t}}</code>`).join("")}</div>`;
	d.innerHTML = `<form method="dialog">
		<h3>Plan settings</h3>
		<p class="muted small">Saved with this plan. Claude reads them with every request.</p>
		<div class="set-sec"><h4>Naming convention: campaign → ad set → ad</h4>
			<label class="toggle"><input type="checkbox" data-sbind="naming.auto"${st.naming.auto ? " checked" : ""}> Keep every name on the convention. You and Claude edit the label, and the rest fills itself in.</label>
			${tpl("campaign")}${tpl("adset")}${tpl("ad")}
			<div class="preview-names" id="namePreview"></div>
			<div class="btn-row"><button type="button" data-rename>Rename everything now</button></div>
		</div>
		<div class="set-sec"><h4>Channel budgets</h4>
			<p class="muted small">Set a monthly budget per channel. Each channel's budget splits across its campaigns by the funnel weights below, and campaign and ad set budgets follow from it. It also sizes what each channel can test: an ad set needs roughly 50 results a week (or the network's daily minimum) to leave learning, and each ad needs enough spend to be read.</p>
			<table class="stages chan"><thead><tr><th>Channel</th><th>Monthly budget</th><th>Cost per result, if known</th></tr></thead><tbody>
			${[...new Set([...planNetworks(S.plan), ...Object.keys(st.channels)])].map((k) => `<tr><td><b>${PLATFORMS[k].short}</b></td><td><input type="number" min="0" step="100" data-sbind="channels.${k}.monthly" data-kind="num" value="${st.channels[k]?.monthly || ""}" placeholder="e.g. 3000"></td><td><input type="number" min="0" step="1" data-sbind="channels.${k}.cpa" data-kind="num" value="${st.channels[k]?.cpa || ""}" placeholder="e.g. 35"></td></tr>`).join("") || '<tr><td colspan="3" class="muted">Add a campaign to set its channel budget.</td></tr>'}
			</tbody></table>
			${f("Currency", `<input maxlength="3" data-sbind="budget.currency" value="${esc(st.budget.currency)}" style="width:90px">`)}
			<div class="row3">${Object.keys(FUNNEL).map((k) => f(`${FUNNEL[k]} weight %`, `<input type="number" min="0" max="100" data-sbind="funnel.${k}" data-kind="num" value="${st.funnel[k]}" title="${esc(FUNNEL_LABEL[k])}">`)).join("")}</div>
			<div id="budgetOut"></div>
		</div>
		<div class="set-sec"><h4>Positioning and messaging</h4>
			<p class="muted small">Add the files from GrowthCast's Positioning Wizard or the marketing-strategy workshop: JTBD, positioning, ICP messaging, product marketing context. Markdown, text, JSON or CSV. Claude grounds copy and creative in them.</p>
			<ul class="ctx-list" id="ctxList"></ul>
			<button type="button" data-ctx-add>+ Add files</button>
		</div>
		${READONLY ? "" : `<div class="set-sec"><h4>Import from an ad account</h4>
			<p class="muted small">Connect a network's ad account through Composio and bring its active campaigns, ad sets and ads onto this canvas, read-only: nothing in the account changes. Imported nodes keep the platform's ids, status and live budget in their notes.</p>
			<div id="connectOut" class="connect"><p class="muted small">Checking connections…</p></div>
		</div>
		<div class="set-sec"><h4>Plan file</h4>
			<p class="muted small">Move a plan between the planner plugin and the portal. Importing replaces this plan's campaigns, ad sets, ads, brief, settings and review with the file's; it keeps this plan's place (its project in the portal) and its positioning files. Positioning files and uploaded creative aren't in the file: add them again here.</p>
			<div class="btn-row"><button type="button" data-plan-import>Import plan file…</button><button type="button" data-plan-download>Download plan file</button></div>
		</div>`}
		<div class="btn-row end"><button value="close">Done</button></div></form>`;
	d.showModal();
	renderSettingsOut();
	if (!READONLY) renderConnect();
}
// ---------- ad accounts (Composio) ----------
const CX = { accounts: {}, busy: "" };
async function renderConnect() {
	const out = $("#connectOut");
	if (!out) return;
	let st;
	try {
		st = (await api("/api/connect")).body;
	} catch (e) {
		out.innerHTML = `<p class="small">Couldn't reach the ad-account connector: ${esc(e.message)}</p>`;
		return;
	}
	if (!st.configured) {
		out.innerHTML = `<p class="small">${WEB ? "Ad-account import isn't set up for this portal yet: an admin adds the COMPOSIO_API_KEY setting to the planner." : "Add your Composio API key (platform.composio.dev → API keys) to the plugin: run <code>/plugin</code> in Claude Code, pick paid-media-planner and configure <b>Composio API key</b>. Then send any message in Claude Code and reopen this panel."}</p>`;
		return;
	}
	out.innerHTML = `<table class="stages conn"><tbody>${st.networks
		.map((n) => {
			const accts = CX.accounts[n.net];
			const pick = !n.connected ? "" : n.needsId ? `<input data-cx-id="${n.net}" placeholder="Ad account id, e.g. a2_abc123">` : accts ? `<select data-cx-acct="${n.net}">${accts.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}${a.currency ? ` · ${esc(a.currency)}` : ""}</option>`).join("") || "<option value=\"\">No ad accounts found</option>"}</select>` : `<button type="button" data-cx-load="${n.net}">Choose account…</button>`;
			return `<tr><td><span class="net" style="--c:${PLATFORMS[n.net].color}">${PLATFORMS[n.net].short}</span></td><td>${n.connected ? '<span class="st st-approved">Connected</span>' : '<span class="muted small">Not connected</span>'}</td><td class="cx-pick">${pick}</td><td class="cx-act">${n.connected ? `<button type="button" data-cx-import="${n.net}"${n.needsId || accts?.length ? "" : " disabled"}>Import</button><button type="button" data-cx-off="${n.net}" title="Disconnect">×</button>` : `<button type="button" data-cx-on="${n.net}">Connect</button>`}</td></tr>`;
		})
		.join("")}</tbody></table><p class="muted small">After signing in to a network in the new tab, come back and <button type="button" class="linkish" data-cx-refresh>refresh</button>. X isn't available through Composio.</p>`;
}
$("#settingsDlg").addEventListener("click", async (e) => {
	const el = e.target.closest("[data-cx-on],[data-cx-off],[data-cx-load],[data-cx-import],[data-cx-refresh]");
	if (!el || CX.busy) return;
	const net = el.dataset.cxOn ?? el.dataset.cxOff ?? el.dataset.cxLoad ?? el.dataset.cxImport;
	const label = el.textContent;
	CX.busy = net ?? "refresh";
	el.disabled = true;
	try {
		if (el.dataset.cxRefresh != null) return void (CX.accounts = {});
		if (el.dataset.cxOn) {
			const w = open("", "_blank");
			const { body } = await post(`/api/connect/${net}`, {});
			if (w) w.location = body.url;
			else open(body.url, "_blank");
			return toast(`Sign in to ${PLATFORMS[net].name} in the new tab, then refresh here.`);
		}
		if (el.dataset.cxOff) {
			if (!confirm(`Disconnect ${PLATFORMS[net].name}? Imported campaigns stay on the canvas.`)) return;
			await post(`/api/connect/${net}`, {}, "DELETE");
			delete CX.accounts[net];
			return;
		}
		if (el.dataset.cxLoad) {
			el.textContent = "Loading…";
			CX.accounts[net] = (await api(`/api/connect/${net}/accounts`)).body;
			return;
		}
		const typed = $(`[data-cx-id="${net}"]`)?.value.trim();
		const sel = $(`[data-cx-acct="${net}"]`);
		const account = typed ? { id: typed, name: typed } : CX.accounts[net]?.find((a) => a.id === sel?.value);
		if (!account?.id) return toast("Pick an ad account first.");
		el.textContent = "Importing…";
		const { body } = await post(`/api/connect/${net}/import`, { account });
		if (!body.nodes.length) return toast(`No active campaigns in ${account.name}.`);
		const { campaigns, adsets, ads } = body.counts;
		if (!confirm(`Add ${campaigns} campaign${campaigns === 1 ? "" : "s"}, ${adsets} ${PLATFORMS[net].levels[1].toLowerCase()}${adsets === 1 ? "" : "s"} and ${ads} ad${ads === 1 ? "" : "s"} from ${account.name} to this canvas?${body.truncated.length ? ` Not everything fit: ${body.truncated.join(", ")}.` : ""}`)) return;
		mutate((plan) => {
			const laid = layoutPlan({ nodes: structuredClone(body.nodes) });
			const top = Math.max(0, ...plan.nodes.map((n) => (n.y ?? 0) + 180)) + (plan.nodes.length ? 120 : 0);
			for (const n of laid.nodes) plan.nodes.push({ ...n, y: n.y + top });
			const unset = !Object.values(plan.settings.channels).some((c) => c.monthly);
			const ch = (plan.settings.channels[net] ??= { monthly: 0, cpa: 0 });
			if (!ch.monthly && body.monthly) ch.monthly = body.monthly;
			// A plan with no channel budgets yet takes the account's currency, so live budgets and derived ones agree.
			if (unset && /^[A-Z]{3}$/.test(account.currency ?? "")) plan.settings.budget.currency = account.currency;
		}, { rerender: "all" });
		toast(`Imported ${campaigns} campaign${campaigns === 1 ? "" : "s"} from ${account.name}.${body.monthly ? ` Live spend runs about ${account.currency ?? ""} ${body.monthly.toLocaleString()}/month.` : ""}`);
	} catch (err) {
		toast(err.message);
	} finally {
		CX.busy = "";
		el.disabled = false;
		el.textContent = label;
		renderConnect();
	}
});
function renderSettingsOut() {
	const d = $("#settingsDlg");
	const st = S.plan.settings;
	const sample = ["campaign", "adset", "ad"].map((t) => S.plan.nodes.find((n) => n.type === t)).filter(Boolean);
	$("#namePreview", d).innerHTML = sample.map((n) => `<span>${esc(conventionName(S.plan, n))}</span>`).join("") || '<span class="muted">Add a campaign to preview names.</span>';
	const plans = channelPlans(S.plan);
	const camps = (net) => S.plan.nodes.filter((n) => n.type === "campaign" && n.data.platforms[0] === net);
	const count = (t, net) => S.plan.nodes.filter((n) => n.type === t && campaignOf(S.plan, n)?.data.platforms[0] === net).length;
	$("#budgetOut", d).innerHTML = plans
		.map((bp) => {
			const cur = bp.currency;
			const P = PLATFORMS[bp.network];
			return `<h5 class="chan-h">${P.short}${bp.monthly ? ` · ${cur} ${bp.monthly.toLocaleString()}/mo` : ""}</h5>
		<table class="stages"><thead><tr><th>Stage</th><th>Weight</th><th>Daily</th><th>Testable</th><th>Campaigns</th></tr></thead><tbody>
		${bp.stages.map((s) => `<tr><td title="${esc(FUNNEL_LABEL[s.key])}"><b>${s.label}</b></td><td>${s.weight}%</td><td>${bp.monthly ? `${cur} ${Math.round(s.daily)}` : "—"}</td><td>${s.adsets ? `${s.adsets} ${P.levels[1].toLowerCase()}${s.adsets > 1 ? "s" : ""} × ${s.ads} ads` : bp.monthly && s.weight ? "fold in" : "—"}</td><td>${camps(bp.network).filter((c) => c.data.funnel === s.key).length}</td></tr>`).join("")}
		</tbody></table>
		${bp.monthly ? `<p class="small">Supports about <b>${bp.campaigns} campaign${bp.campaigns === 1 ? "" : "s"}, ${bp.adsets} ${P.levels[1].toLowerCase()}s and ${bp.ads} ads</b> at ${cur} ${Math.round(bp.perAdsetDaily)}+/day each. The plan has ${count("campaign", bp.network)}, ${count("adset", bp.network)} and ${count("ad", bp.network)}.</p>` : ""}
		${bp.notes.length ? `<ul class="set-notes">${bp.notes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`;
		})
		.join("");
	$("#ctxList", d).innerHTML = st.context.map((c, i) => `<li><span><a href="${esc(c.path)}" target="_blank">${esc(c.name)}</a> <small class="muted">${(c.size / 1024).toFixed(1)} KB</small></span><button type="button" data-ctx-rm="${i}">Remove</button></li>`).join("") || '<li class="muted">No files yet.</li>';
}
$("#settingsDlg").addEventListener("input", (e) => {
	const el = e.target;
	if (!el.dataset.sbind) return;
	const v = el.type === "checkbox" ? el.checked : el.dataset.kind === "num" ? Number(el.value || 0) : el.value;
	mutate((plan) => setPath(plan.settings, el.dataset.sbind, v), { coalesce: `settings.${el.dataset.sbind}`, rerender: el.type === "checkbox" ? "all" : "light" });
});
$("#settingsDlg").addEventListener("click", async (e) => {
	const b = (s) => e.target.closest(s);
	let el;
	if ((el = b("[data-tok]"))) {
		const input = $(`[data-sbind="naming.${el.dataset.tok}"]`, $("#settingsDlg"));
		input.setRangeText(el.textContent, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, "end");
		input.dispatchEvent(new Event("input", { bubbles: true }));
		return input.focus();
	}
	if (b("[data-rename]")) {
		let n = 0;
		mutate((plan) => (n = applyNaming(plan)));
		return toast(n ? `Renamed ${n} node${n === 1 ? "" : "s"} to the convention.` : "Every name already follows the convention.");
	}
	if (b("[data-plan-download]")) {
		const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([JSON.stringify(S.plan, null, "\t")], { type: "application/json" })), download: `${S.plan.name.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "plan"}.json` });
		a.click();
		return setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}
	if (b("[data-plan-import]")) return importPlanFile();
	if ((el = b("[data-ctx-rm]"))) return mutate((plan) => plan.settings.context.splice(Number(el.dataset.ctxRm), 1));
	if (b("[data-ctx-add]")) {
		const files = await new Promise((ok) => {
			const i = Object.assign(document.createElement("input"), { type: "file", accept: ".md,.markdown,.txt,.json,.csv", multiple: true });
			i.onchange = () => ok([...i.files]);
			i.click();
		});
		for (const file of files) {
			const r = await fetch(`/api/plans/${S.plan.id}/context`, { method: "POST", headers: { "content-type": "text/plain", "x-filename": file.name }, body: file });
			const c = await r.json();
			if (!r.ok) toast(c.error);
			else mutate((plan) => plan.settings.context.push(c));
		}
	}
});
$("#settingsBtn").onclick = openSettings;
// Replaces this plan's contents with a plan file (the plugin's plans/<id>.json, or a downloaded plan file). The plan
// keeps its id, and so its project in the portal, and its own positioning files; creative that pointed at another
// planner's /assets/ can't be carried over and is dropped.
async function importPlanFile() {
	const file = await new Promise((ok) => {
		const i = Object.assign(document.createElement("input"), { type: "file", accept: ".json,application/json" });
		i.onchange = () => ok(i.files[0]);
		i.click();
	});
	if (!file) return;
	let incoming;
	try {
		incoming = JSON.parse(await file.text());
	} catch {
		return toast("That file isn't a plan: it isn't valid JSON.");
	}
	const { plan: clean, errors } = normalize(incoming ?? {});
	if (!clean || errors.length) return toast(`That plan file can't be imported: ${(errors[0] ?? "not a plan").slice(0, 160)}`);
	const counts = ["campaign", "adset", "ad"].map((t) => clean.nodes.filter((n) => n.type === t).length);
	if (!confirm(`Replace “${S.plan.name}” with “${clean.name}” (${counts[0]} campaigns, ${counts[1]} ad sets, ${counts[2]} ads)? Undo brings this plan back.`)) return;
	const foreign = (m) => typeof m?.src === "string" && m.src.startsWith("/assets/") && !m.src.startsWith(`/assets/${S.plan.id}/`) && !/^\/assets\/[0-9a-f]{32}\//.test(m.src);
	let dropped = 0;
	for (const n of clean.nodes.filter((x) => x.type === "ad")) {
		const before = n.data.media.length;
		n.data.media = n.data.media.filter((m) => !foreign(m));
		dropped += before - n.data.media.length;
		for (const c of n.data.cards ?? []) if (foreign(c)) delete c.src, delete c.kind, dropped++;
	}
	mutate((plan) => {
		const keep = { id: plan.id, context: plan.settings.context, activity: plan.activity, createdAt: plan.createdAt };
		for (const k of Object.keys(plan)) delete plan[k];
		Object.assign(plan, structuredClone(clean), { id: keep.id, createdAt: keep.createdAt ?? clean.createdAt, activity: keep.activity ?? [] });
		plan.settings.context = keep.context ?? [];
	});
	S.sel = null;
	$("#settingsDlg").close();
	toast(`Imported “${clean.name}”.${dropped ? ` ${dropped} creative file${dropped === 1 ? "" : "s"} from another planner couldn't come along: upload ${dropped === 1 ? "it" : "them"} again.` : ""}${clean.settings.context.length ? " Add its positioning files in Settings." : ""}`);
}
// Canvas images: images.mjs draws each view as SVG with the page's fonts and the plan's creative embedded, and the
// browser rasterises them to PNG (2x, capped so huge canvases still fit a canvas element) and zips them.
const asDataUrl = (blob) => new Promise((ok, no) => Object.assign(new FileReader(), { onload: (e) => ok(e.target.result), onerror: no }).readAsDataURL(blob));
async function downloadCanvasImages(net = "") {
	const FONTS = [["Manrope", 400, "manrope-400"], ["Manrope", 500, "manrope-500"], ["Manrope", 700, "manrope-700"], ["DM Mono", 400, "dm-mono-400"], ["DM Mono", 500, "dm-mono-500"]];
	const fontCss = (await Promise.all(FONTS.map(async ([fam, w, f]) => `@font-face{font-family:"${fam}";font-weight:${w};src:url(${await asDataUrl(await (await fetch(`fonts/${f}.ttf`)).blob())}) format("truetype")}`))).join("");
	await Promise.all(FONTS.map(([fam, w]) => document.fonts.load(`${w} 12px "${fam}"`)));
	const ctx = document.createElement("canvas").getContext("2d");
	const measure = (t, size, weight = 400, mono = false) => ((ctx.font = `${weight} ${size}px ${mono ? '"DM Mono"' : "Manrope"}`), ctx.measureText(String(t)).width);
	const plan = net ? viewPlan(S.plan, net) : S.plan;
	const media = new Map();
	for (const n of plan.nodes)
		for (const m of n.type === "ad" ? [...n.data.media, ...n.data.cards] : [])
			if (m?.src && m.kind !== "video" && !media.has(m.src)) media.set(m.src, await fetch(m.src).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? asDataUrl(b) : null)).catch(() => null));
	const files = [];
	for (const img of canvasImages(plan, { measure, fontCss, media: (src) => media.get(src) ?? null })) {
		const url = URL.createObjectURL(new Blob([img.svg], { type: "image/svg+xml" }));
		try {
			const el = await new Promise((ok, no) => Object.assign(new Image(), { onload: (e) => ok(e.target), onerror: () => no(new Error(`couldn't draw ${img.name}`)), src: url }));
			const scale = Math.min(2, 16000 / Math.max(img.width, img.height), Math.sqrt(120e6 / (img.width * img.height)));
			const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
			const g = c.getContext("2d");
			g.scale(scale, scale);
			g.drawImage(el, 0, 0, img.width, img.height);
			const png = await new Promise((ok) => c.toBlob(ok, "image/png"));
			files.push({ name: img.name.replace(/\.svg$/, ".png"), data: new Uint8Array(await png.arrayBuffer()) });
		} finally {
			URL.revokeObjectURL(url);
		}
	}
	const stem = `${S.plan.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan"}${net ? `-${net}` : ""}`;
	const href = URL.createObjectURL(new Blob([zipStore(files)], { type: "application/zip" }));
	Object.assign(document.createElement("a"), { href, download: `${stem}-canvas-images.zip` }).click();
	setTimeout(() => URL.revokeObjectURL(href), 60e3);
	toast(`${files.length} image${files.length === 1 ? "" : "s"} saved.`);
}
// In the portal, files come from the API with the session token, so links become fetched blobs.
async function openAuthed(url, newTab = false, filename = "") {
	const w = newTab ? open("", "_blank") : null;
	try {
		// Pages (the hand-off pack, the slides) open from a short-lived signed link so their own scripts run.
		if (w && /\/(export|slides)\.html/.test(url)) {
			const { body } = await api(`/api/link?u=${encodeURIComponent(url)}`);
			w.location = new URL(body.url, location.href).href;
			return;
		}
		const r = await fetch(url);
		if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `Download failed (${r.status})`);
		const href = URL.createObjectURL(await r.blob());
		if (w) w.location = href;
		else Object.assign(document.createElement("a"), { href, download: filename || (r.headers.get("content-disposition") ?? "").match(/filename="(.+)"/)?.[1] || "download" }).click();
		setTimeout(() => URL.revokeObjectURL(href), 60e3);
	} catch (e) {
		w?.close();
		toast(e.message);
	}
}
if (WEB)
	document.addEventListener("click", (e) => {
		const a = e.target.closest?.("a[data-href], .ctx-list a");
		if (!a) return;
		e.preventDefault();
		openAuthed(a.getAttribute("href"), a.target === "_blank");
	});
addEventListener("hashchange", () => {
	const id = location.hash.slice(1);
	if (id && id !== S.plan?.id) openPlan(id).catch(() => toast("No such plan."));
});
addEventListener("resize", () => S.view === "canvas" && applyView());

// ---------- boot ----------
(async () => {
	if (WEB) {
		await ENV.ready;
		READONLY = ENV.role !== "staff";
		document.body.classList.toggle("readonly", READONLY);
		$("#planName").readOnly = READONLY;
		$("#planStatus").disabled = READONLY;
		document.body.classList.add("web");
	}
	await refreshPlanList();
	let id = (WEB && ENV.planId) || location.hash.slice(1) || store.get("cc-last", null);
	if (!S.plans.some((p) => p.id === id)) id = S.plans[0]?.id;
	setInterval(poll, WEB ? 5000 : 1500);
	if (!id && WEB) return showNoPlans();
	if (!id) return newPlanFlow("My first plan");
	await openPlan(id);
})();
function showNoPlans() {
	$("#emptyHint").hidden = false;
	$("#emptyHint").innerHTML = READONLY
		? "<b>No campaign plans yet</b><span>When GrowthCast shares a plan for one of your projects, it appears here for review.</span>"
		: '<b>No campaign plans yet</b><span>Create the first one for a project.</span><button class="primary" id="firstPlan">New plan</button>';
	$("#firstPlan")?.addEventListener("click", newPlanDialog);
}
