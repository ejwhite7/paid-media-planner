// Canvas images: the node graph drawn as standalone SVG, the whole canvas and each campaign on each network's canvas.
// Pure (strings in, strings out), so the browser rasterises it to PNG for the Share dialog and the CLI writes the SVG.
// It redraws from the plan, with the canvas's own layout, colours and fonts, rather than screenshotting the page.
import { PLATFORMS, STATUS_LABEL, TYPES, adsetSummary, autoPlaced, campaignOf, goalLabel, layoutPlan, mediaLabel, money, objectiveLabel, planNetworks, subtree, viewPlan } from "./model.mjs";

const T = { bg: "#f4f1e9", card: "#fffdf8", fg: "#242426", muted: "#6d6a64", line: "#d7d2c7", line2: "#bdb8ae", dot: "#d9d4c9", accentSoft: "#ffe6de", accentText: "#b63f25", sage: "#e0edc7", good: "#27785a", warn: "#9a6200" };
const TC = { campaign: "#242426", adset: "#27785a", ad: "#e2502f" };
const H = { campaign: 140, adset: 128, ad: 158 };
const W = 300;
const PORT_Y = 42;
const SANS = "Manrope, -apple-system, 'Segoe UI', sans-serif";
const MONO = "'DM Mono', ui-monospace, Menlo, monospace";
const STATUS = { draft: [T.line, T.muted], in_review: [T.accentSoft, T.accentText], changes_requested: ["#f0e2c8", T.warn], approved: [T.sage, T.good], live: [T.good, "#ffffff"] };

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mix = (a, b, t) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * t + parseInt(b.slice(i, i + 2), 16) * (1 - t)).toString(16).padStart(2, "0")).join("");
// Text width: the browser passes a real measure; the CLI estimates from average glyph widths.
const estimate = (text, size, weight = 400, mono = false) => String(text).length * size * (mono ? 0.6 : weight >= 600 ? 0.58 : 0.54);
function fit(text, max, size, weight, measure, mono) {
	let s = String(text ?? "");
	if (measure(s, size, weight, mono) <= max) return s;
	while (s.length > 1 && measure(s + "…", size, weight, mono) > max) s = s.slice(0, -1);
	return s.trimEnd() + "…";
}
function wrap(text, max, size, weight, measure, lines = 2) {
	const words = String(text ?? "").split(/\s+/).filter(Boolean);
	const out = [];
	while (words.length && out.length < lines) {
		if (out.length === lines - 1) {
			out.push(fit(words.join(" "), max, size, weight, measure));
			break;
		}
		let line = words.shift();
		while (words.length && measure(`${line} ${words[0]}`, size, weight) <= max) line += ` ${words.shift()}`;
		out.push(fit(line, max, size, weight, measure));
	}
	return out;
}
const text = (x, y, s, { size = 12.5, weight = 400, fill = T.fg, mono = false, spacing = 0, anchor = "start" } = {}) =>
	`<text x="${x}" y="${y}" font-family="${mono ? MONO : SANS}" font-size="${size}" font-weight="${weight}" fill="${fill}"${spacing ? ` letter-spacing="${spacing}"` : ""}${anchor !== "start" ? ` text-anchor="${anchor}"` : ""}>${esc(s)}</text>`;
function pill(x, y, label, color, measure) {
	const w = measure(label, 11, 500, true) + 26;
	return { w, svg: `<rect x="${x}" y="${y}" width="${w}" height="20" rx="10" fill="${T.card}" stroke="${T.line2}"/><circle cx="${x + 11}" cy="${y + 10}" r="4" fill="${color}"/>${text(x + 19, y + 14, label, { size: 11, weight: 500, mono: true })}` };
}
function status(x, y, st, measure) {
	const label = STATUS_LABEL[st] ?? st;
	const [bg, fg] = STATUS[st] ?? STATUS.draft;
	const w = measure(label, 11, 500, true) + 14;
	return `<rect x="${x}" y="${y}" width="${w}" height="18" rx="9" fill="${bg}"/>${text(x + 7, y + 13, label, { size: 11, weight: 500, fill: fg, mono: true })}`;
}

function nodeSvg(plan, n, x, y, measure, media) {
	const d = n.data;
	const tc = TC[n.type];
	const h = H[n.type];
	const inner = W - 24;
	const t = TYPES[n.type];
	let s = `<g transform="translate(${x},${y})"><rect x="0.5" y="0.5" width="${W - 1}" height="${h - 1}" fill="${T.card}" stroke="${T.line2}"/>`;
	s += `<rect x="1" y="1" width="${W - 2}" height="29" fill="${mix(tc, T.card, 0.08)}"/><line x1="1" y1="30.5" x2="${W - 1}" y2="30.5" stroke="${T.line}"/>`;
	s += text(12, 20, `${t.label.toUpperCase()} · ${t.sub.toUpperCase()}`, { size: 11, weight: 500, fill: tc, mono: true, spacing: 0.5 });
	s += text(12, 55, fit(d.name, inner, 15, 700, measure), { size: 15, weight: 700 });
	if (n.type === "campaign") {
		s += `<text x="12" y="76" font-family="${SANS}" font-size="12.5"><tspan fill="${T.muted}">Objective</tspan><tspan fill="${T.fg}"> ${esc(fit(objectiveLabel(n), inner - measure("Objective ", 12.5), 12.5, 400, measure))}</tspan></text>`;
		let px = 12;
		for (const p of d.platforms) {
			const pl = pill(px, 84, PLATFORMS[p]?.short ?? p, PLATFORMS[p]?.color ?? T.muted, measure);
			s += pl.svg;
			px += pl.w + 4;
		}
		s += text(170, 98, fit(money(d.budget), W - 182, 12.5, 400, measure), { fill: T.muted });
	}
	if (n.type === "adset") {
		s += text(12, 76, fit(adsetSummary(d, campaignOf(plan, n)?.data.platforms[0]), inner, 12.5, 400, measure));
		const goal = d.optimization ? goalLabel(plan, n) : d.interests?.length ? d.interests.join(", ") : "";
		if (goal) s += text(12, 94, fit(goal, inner, 12.5, 400, measure), { fill: T.muted });
	}
	if (n.type === "ad") {
		const src = media?.(d.media[0]?.src ?? d.cards.find((c) => c.src)?.src);
		s += `<rect x="12.5" y="66.5" width="48" height="48" fill="${T.bg}" stroke="${T.line}"/>`;
		s += src ? `<image href="${esc(src)}" x="13" y="67" width="47" height="47" preserveAspectRatio="xMidYMid slice"/>` : `<rect x="13" y="67" width="47" height="47" fill="url(#hatch)"/>${text(36.5, 96, PLATFORMS[d.platform]?.formats[d.format]?.media === false ? "Aa" : "", { size: 16, fill: T.muted, anchor: "middle" })}`;
		const hl = wrap(d.headline || "—", W - 84, 13, 400, measure, 2);
		hl.forEach((l, i) => (s += text(72, 79 + i * 17, l, { size: 13 })));
		const pl = pill(72, 106, PLATFORMS[d.platform]?.short ?? d.platform, PLATFORMS[d.platform]?.color ?? T.muted, measure);
		const fmt = autoPlaced(plan, n) ? mediaLabel(d) : PLATFORMS[d.platform]?.formats[d.format]?.name ?? "";
		s += pl.svg + text(72 + pl.w + 6, 120, fit(fmt + (d.creative === "ugc" ? " · UGC" : ""), W - 84 - pl.w - 6, 12, 400, measure), { size: 12, fill: T.muted });
	}
	s += status(12, h - 26, n.status, measure);
	if (t.parent) s += `<circle cx="0" cy="${PORT_Y}" r="7" fill="${T.card}" stroke="${T.line2}" stroke-width="2.5"/>`;
	if (t.child) s += `<circle cx="${W}" cy="${PORT_Y}" r="7" fill="${tc}" stroke="${tc}" stroke-width="2.5"/>`;
	return s + "</g>";
}
const curve = (x1, y1, x2, y2) => {
	const dx = Math.max(50, Math.abs(x2 - x1) / 2);
	return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};

// One SVG: the plan's nodes (or one campaign's subtree) on one network's canvas ("" for all networks).
// opts: measure(text, size, weight, mono) for exact widths, fontCss (@font-face rules with embedded fonts),
// media(src) → a data: URL to draw creative, or null for the placeholder, tidy (re-lay out the nodes).
export function canvasSvg(plan, { net = "", campaign = null, measure = estimate, fontCss = "", media = null, tidy = false, title = "", subtitle = "" } = {}) {
	const view = viewPlan(plan, net);
	let nodes = campaign ? subtree(view, campaign).map((id) => view.nodes.find((n) => n.id === id)).filter(Boolean) : view.nodes;
	let at = (n) => (net ? n.views?.[net] ?? n : n);
	if (tidy) {
		const laid = layoutPlan({ nodes: structuredClone(nodes) }, { h: H });
		const xy = new Map(laid.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
		at = (n) => xy.get(n.id);
	}
	const M = 48, TOP = 104;
	const xs = nodes.map((n) => at(n).x), ys = nodes.map((n) => at(n).y);
	const minX = nodes.length ? Math.min(...xs) : 0, minY = nodes.length ? Math.min(...ys) : 0;
	const maxX = nodes.length ? Math.max(...nodes.map((n) => at(n).x + W)) : 600, maxY = nodes.length ? Math.max(...nodes.map((n) => at(n).y + H[n.type])) : 200;
	const width = Math.max(Math.ceil(maxX - minX + M * 2), 720);
	const height = Math.ceil(maxY - minY + TOP + M);
	const ox = M - minX, oy = TOP - minY;
	const ids = new Set(nodes.map((n) => n.id));
	let edges = "";
	for (const n of nodes) {
		if (!n.parent || !ids.has(n.parent)) continue;
		const p = nodes.find((x) => x.id === n.parent);
		edges += `<path d="${curve(at(p).x + ox + W, at(p).y + oy + PORT_Y, at(n).x + ox, at(n).y + oy + PORT_Y)}" fill="none" stroke="${TC[p.type]}" stroke-width="2.25"/>`;
	}
	const counts = ["campaign", "adset", "ad"].map((t) => nodes.filter((n) => n.type === t).length);
	const sub = subtitle || [net ? `${PLATFORMS[net].name} canvas` : "All networks", `${counts[0]} campaign${counts[0] === 1 ? "" : "s"}`, `${counts[1]} ad set${counts[1] === 1 ? "" : "s"}`, `${counts[2]} ad${counts[2] === 1 ? "" : "s"}`].join(" · ");
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>${fontCss ? `<style>${fontCss}</style>` : ""}<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${T.dot}"/></pattern><pattern id="hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="6" height="12" fill="${T.line}"/></pattern></defs>
<rect width="100%" height="100%" fill="${T.bg}"/><rect width="100%" height="100%" fill="url(#dots)"/>
${text(M, 50, fit(title || plan.name, width - M * 2, 24, 700, measure), { size: 24, weight: 700 })}
${text(M, 76, fit(sub, width - M * 2, 12, 400, measure, true), { size: 12, fill: T.muted, mono: true, spacing: 0.3 })}
<line x1="${M}" y1="88.5" x2="${width - M}" y2="88.5" stroke="${T.line}"/>
${edges}
${nodes.map((n) => nodeSvg(view, n, at(n).x + ox, at(n).y + oy, measure, media)).join("\n")}
</svg>`;
	return { svg, width, height };
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "campaign";
// Every image the Share dialog and the CLI export: the whole canvas (all networks, when there's more than one),
// each network's canvas, and each campaign on its network, tidied. Returns [{ name, svg, width, height }] with .svg names.
export function canvasImages(plan, opts = {}) {
	const nets = planNetworks(plan);
	const out = [];
	if (nets.length > 1) out.push({ name: "canvas/all-networks.svg", ...canvasSvg(plan, opts) });
	for (const net of nets) {
		out.push({ name: `canvas/${slug(PLATFORMS[net].name)}.svg`, ...canvasSvg(plan, { ...opts, net }) });
		const view = viewPlan(plan, net);
		for (const c of view.nodes.filter((n) => n.type === "campaign")) {
			const sub = [PLATFORMS[net].name, objectiveLabel(c), money(c.data.budget)].filter(Boolean).join(" · ");
			out.push({ name: `campaigns/${slug(PLATFORMS[net].name)}/${slug(c.data.name)}.svg`, ...canvasSvg(plan, { ...opts, net, campaign: c.id, tidy: true, title: c.data.name, subtitle: `${plan.name} · ${sub}` }) });
		}
	}
	return out;
}

// A stored (uncompressed) zip, for the browser: PNGs are already compressed. files: [{ name, data: Uint8Array | string }].
const CRC = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
export function zipStore(files) {
	const enc = new TextEncoder();
	const parts = [], central = [];
	let offset = 0;
	for (const f of files) {
		const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
		const name = enc.encode(f.name);
		let c = 0xffffffff;
		for (const b of data) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
		const crc = (c ^ 0xffffffff) >>> 0;
		const head = new DataView(new ArrayBuffer(30));
		[[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]].forEach(([o, v, n]) => (n === 4 ? head.setUint32(o, v, true) : head.setUint16(o, v, true)));
		const cen = new DataView(new ArrayBuffer(46));
		[[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]].forEach(([o, v, n]) => (n === 4 ? cen.setUint32(o, v, true) : cen.setUint16(o, v, true)));
		parts.push(new Uint8Array(head.buffer), name, data);
		central.push(new Uint8Array(cen.buffer), name);
		offset += 30 + name.length + data.length;
	}
	const size = central.reduce((a, b) => a + b.length, 0);
	const end = new DataView(new ArrayBuffer(22));
	[[0, 0x06054b50, 4], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, offset, 4]].forEach(([o, v, n]) => (n === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true)));
	const all = [...parts, ...central, new Uint8Array(end.buffer)];
	const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
	let p = 0;
	for (const a of all) (out.set(a, p), (p += a.length));
	return out;
}
