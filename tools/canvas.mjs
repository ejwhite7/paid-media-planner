// Paid media planner: a local web app for laying out ad campaigns as a node graph (campaign → ad set → ad), mocking the
// ads in each network's native format, asking Claude for a build or a review, and exporting a hand-off pack.
// Plans live in ~/.paid-media-planner/plans/<id>.json. Requests from the canvas go to Claude with the user's next message
// (tools/canvas-context.mjs is the hook that reads them). Local only: listens on 127.0.0.1, answers only requests
// addressed to it.
//
// Usage: node tools/canvas.mjs [--port 4720] [--open]
//        node tools/canvas.mjs list | new [name] | path <id> | validate <id|file> | layout <id> | export <id> [--out dir]
//        node tools/canvas.mjs name <id> | attach <id> <ad id> <file> [--card n] | context <id> <file>
//        export takes --net <network> for one network's canvas; the slide PDF needs Chrome, Edge, Chromium or Brave
//        installed (or --chrome <path>), otherwise slides.html prints to PDF from any browser.
//        Every form takes --home <dir> to keep plans somewhere other than ~/.paid-media-planner.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { applyNaming, budgetSummary, layoutPlan, newPlan, normalize, lint, nodeById, viewPlan, TYPES, PLATFORMS } from "../studio/model.mjs";
import { renderBrief, renderCsv, renderMarkdown, workbookSheets } from "../studio/brief.mjs";
import { FIT_SCRIPT, renderSlides } from "../studio/slides.mjs";
import { workbook, zip } from "./xlsx.mjs";
import { googleAdsEditorFiles } from "../studio/gads.mjs";
import { canvasImages } from "../studio/images.mjs";
import { adAccounts, composio, connectable } from "../studio/connect.mjs";
import { formatLabel } from "../studio/mocks.mjs";

const tools = dirname(fileURLToPath(import.meta.url));
const studio = resolve(tools, "../studio");
const args = process.argv.slice(2);
const flag = (name, d) => (args.includes(name) ? args[args.indexOf(name) + 1] : d);
// Arguments that aren't a --flag or a flag's value: the subcommand and its operands.
const positional = args.filter((a, i) => !a.startsWith("--") && !(args[i - 1]?.startsWith("--") && !["--open"].includes(args[i - 1])));
let port = Number(flag("--port", 4720));
let home, plansDir, assetsDir, contextDir, reqPath;
// Where plans, uploads and the queued request live. Tests point it at a temporary folder.
export function setHome(dir) {
	home = resolve(dir);
	plansDir = join(home, "plans");
	assetsDir = join(home, "assets");
	contextDir = join(home, "context");
	reqPath = join(home, "request.json");
	mkdirSync(plansDir, { recursive: true });
	mkdirSync(assetsDir, { recursive: true });
}
setHome(flag("--home", join(homedir(), ".paid-media-planner")));
const readJson = (p, d = null) => {
	try {
		return JSON.parse(readFileSync(p, "utf8"));
	} catch {
		return d;
	}
};
const fail = (status, message) => Object.assign(new Error(message), { status });
const okId = (id) => (/^[a-z0-9_-]{3,64}$/i.test(id ?? "") ? id : null);
const planPath = (id) => join(plansDir, `${okId(id) ?? "_"}.json`);
const versionOf = (id) => {
	try {
		return String(statSync(planPath(id)).mtimeMs);
	} catch {
		return null;
	}
};
const writeAtomic = (p, body) => {
	writeFileSync(`${p}.tmp`, body);
	renameSync(`${p}.tmp`, p);
};
function loadPlan(id) {
	if (!okId(id) || !existsSync(planPath(id))) throw fail(404, `No plan "${id}"`);
	const raw = readJson(planPath(id));
	if (!raw) throw fail(422, `${planPath(id)} isn't valid JSON`);
	const { plan, errors } = normalize(raw);
	return { plan: { ...plan, id }, errors, version: versionOf(id) };
}
function savePlan(plan) {
	const { plan: clean, errors } = normalize(plan);
	if (errors.length) throw fail(422, errors.join("\n"));
	clean.updatedAt = new Date().toISOString();
	writeAtomic(planPath(clean.id), JSON.stringify(clean, null, "\t"));
	return { plan: clean, version: versionOf(clean.id) };
}
const listPlans = () =>
	readdirSync(plansDir)
		.filter((f) => f.endsWith(".json"))
		.map((f) => {
			const p = readJson(join(plansDir, f), {});
			return { id: f.slice(0, -5), name: p.name ?? f, status: p.status ?? "draft", updatedAt: p.updatedAt ?? null, nodes: p.nodes?.length ?? 0 };
		})
		.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

// Inline local assets as data: URIs so an exported pack is a single file that works anywhere.
const MIME = { ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".csv": "text/csv; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".avif": "image/avif", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".ttf": "font/ttf" };
const assetFile = (src) => {
	const m = /^\/assets\/([a-z0-9_-]+)\/([a-z0-9._-]+)$/i.exec(src ?? "");
	return m && okId(m[1]) ? join(assetsDir, m[1], m[2]) : null;
};
// Positioning and messaging files live in context/<plan>/ and are referenced from plan.settings.context.
const CONTEXT_EXT = [".md", ".markdown", ".txt", ".json", ".csv"];
const contextFile = (src) => {
	const m = /^\/context\/([a-z0-9_-]+)\/([a-z0-9._-]+)$/i.exec(src ?? "");
	return m && okId(m[1]) ? join(contextDir, m[1], m[2]) : null;
};
const safeName = (name, fallback) => `${Date.now().toString(36)}-${String(name ?? fallback).replace(/[^a-z0-9._-]+/gi, "-").replace(/\.[^.]*$/, "").slice(0, 40)}`;
function storeContext(id, name, data) {
	const ext = extname(String(name)).toLowerCase();
	if (!CONTEXT_EXT.includes(ext)) throw fail(415, `Positioning files must be ${CONTEXT_EXT.join(", ")} (export PDFs or docs as Markdown first)`);
	const file = `${safeName(name, "context")}${ext === ".markdown" ? ".md" : ext}`;
	mkdirSync(join(contextDir, id), { recursive: true });
	writeFileSync(join(contextDir, id, file), data);
	return { name: basename(String(name)), path: `/context/${id}/${file}`, size: data.length, addedAt: new Date().toISOString() };
}
function storeAsset(id, name, data, ext) {
	const file = `${safeName(name, "asset")}${ext}`;
	mkdirSync(join(assetsDir, id), { recursive: true });
	writeFileSync(join(assetsDir, id, file), data);
	return { src: `/assets/${id}/${file}`, kind: /^\.(mp4|webm|mov)$/.test(ext) ? "video" : "image", name: basename(String(name)) };
}
function inlineAssets(plan) {
	const copy = structuredClone(plan);
	const inline = (o, key = "src") => {
		const f = o && assetFile(o[key]);
		if (f && existsSync(f)) o[key] = `data:${MIME[extname(f).toLowerCase()] ?? "application/octet-stream"};base64,${readFileSync(f).toString("base64")}`;
	};
	inline(copy.brand, "logo");
	for (const n of copy.nodes) if (n.type === "ad") [...n.data.media, ...n.data.cards].forEach((m) => inline(m));
	return copy;
}
function exportHtml(plan) {
	const p = inlineAssets(plan);
	const css = ["brief.css", "mocks.css"].map((f) => readFileSync(join(studio, f), "utf8")).join("\n");
	const desc = `${p.nodes.filter((n) => n.type === "ad").length} ads across ${[...new Set(p.nodes.filter((n) => n.type === "campaign").flatMap((c) => c.data.platforms))].map((x) => PLATFORMS[x].short).join(", ")}`;
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${p.name.replace(/[<&]/g, "")}</title><meta name="description" content="${desc}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&display=swap">
<style>${css}</style></head>
<body class="export">
<header class="gc-bar"><span class="wordmark">GrowthCast</span><span class="product">Paid Media Campaign Planner</span></header>
${renderBrief(p)}
<footer class="foot">Planned with Paid Media Campaign Planner by <a href="https://growthcast.app">GrowthCast</a> · exported ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</footer>
<script>
// Build-checklist ticks are kept in this browser only.
const key = "cc-check-${p.id}";
let ticks = {};
try { ticks = JSON.parse(localStorage.getItem(key) || "{}"); } catch {}
for (const box of document.querySelectorAll("[data-check]")) {
	box.checked = !!ticks[box.dataset.check];
	box.addEventListener("change", () => { ticks[box.dataset.check] = box.checked; try { localStorage.setItem(key, JSON.stringify(ticks)); } catch {} });
}
</script></body></html>`;
}

// The slide deck as one self-contained page: fonts, styles and creative inlined, so it prints the same anywhere.
const FONTS = [["Manrope", 400, "manrope-400"], ["Manrope", 600, "manrope-600"], ["Manrope", 700, "manrope-700"], ["DM Mono", 400, "dm-mono-400"], ["DM Mono", 500, "dm-mono-500"]];
// The canvas images as standalone SVG (fonts and creative embedded). The Share dialog makes the PNGs in the browser.
function canvasImageSvgs(plan) {
	const fontCss = [["Manrope", 400, "manrope-400"], ["Manrope", 500, "manrope-500"], ["Manrope", 700, "manrope-700"], ["DM Mono", 400, "dm-mono-400"], ["DM Mono", 500, "dm-mono-500"]].map(([family, weight, file]) => `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(join(studio, "fonts", `${file}.ttf`)).toString("base64")}) format("truetype")}`).join("");
	return canvasImages(inlineAssets(plan), { fontCss, media: (src) => (src?.startsWith("data:image/") ? src : null) }).map((i) => ({ name: i.name, data: i.svg }));
}
function exportSlides(plan, { print = false } = {}) {
	const p = inlineAssets(plan);
	const fonts = FONTS.map(([family, weight, file]) => `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(join(studio, "fonts", `${file}.ttf`)).toString("base64")}) format("truetype")}`).join("\n");
	const css = ["brief.css", "mocks.css", "slides.css"].map((f) => readFileSync(join(studio, f), "utf8")).join("\n");
	return `<!doctype html>
<html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=1328">
<title>${p.name.replace(/[<&]/g, "")} · slides</title><style>${fonts}\n${css}</style></head>
<body class="slides">
${renderSlides(p)}
<script>${FIT_SCRIPT}${print ? "\n(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>setTimeout(()=>{fitMocks();print()},300));" : ""}</script>
</body></html>`;
}
// A Chromium-family browser to print the deck with, if one is installed in the usual place.
const CHROMES = [
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
	"/Applications/Chromium.app/Contents/MacOS/Chromium",
	"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
	"/usr/bin/google-chrome",
	"/usr/bin/google-chrome-stable",
	"/usr/bin/chromium",
	"/usr/bin/chromium-browser",
	"/usr/bin/microsoft-edge",
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
// Browsers Playwright downloaded, newest first, as a fallback.
function playwrightChromes() {
	const builds = ["chrome-headless-shell-mac-arm64/chrome-headless-shell", "chrome-headless-shell-mac-x64/chrome-headless-shell", "chrome-headless-shell-linux64/chrome-headless-shell", "chrome-headless-shell-win64/chrome-headless-shell.exe", "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Chromium.app/Contents/MacOS/Chromium", "chrome-linux64/chrome", "chrome-linux/chrome", "chrome-win64/chrome.exe", "chrome-win/chrome.exe"];
	return [join(homedir(), "Library/Caches/ms-playwright"), join(homedir(), ".cache/ms-playwright"), join(homedir(), "AppData/Local/ms-playwright")]
		.filter((d) => existsSync(d))
		.flatMap((d) => readdirSync(d).filter((f) => /^chromium(_headless_shell)?-\d+$/.test(f)).sort((a, b) => b.includes("shell") - a.includes("shell") || Number(b.split("-")[1]) - Number(a.split("-")[1])).flatMap((f) => builds.map((b) => join(d, f, b))));
}
// Opt-in, for machines without a Chromium-family browser: Playwright's ~100 MB headless shell, which findChrome picks up.
export const PDF_SETUP = "npx -y playwright@1.56.1 install chromium-headless-shell";
const findChrome = () => [flag("--chrome"), ...CHROMES, ...playwrightChromes()].find((c) => c && existsSync(c)) ?? null;
// Prints the deck to PDF with headless Chrome. Resolves the PDF's bytes, or rejects when no browser can do it.
function slidesPdf(plan) {
	const chrome = findChrome();
	if (!chrome) return Promise.reject(fail(501, `No Chrome, Edge, Chromium or Brave found to print the PDF. Install one, or run "${PDF_SETUP}" once, then try again. Until then, print the slides to PDF from your browser.`));
	const dir = join(tmpdir(), `pmp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
	mkdirSync(dir, { recursive: true });
	const html = join(dir, "slides.html");
	const pdf = join(dir, "slides.pdf");
	writeFileSync(html, exportSlides(plan));
	return new Promise((ok, no) => {
		const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${join(dir, "profile")}`, "--no-pdf-header-footer", "--virtual-time-budget=4000", `--print-to-pdf=${pdf}`, `file://${html}`], { stdio: "ignore" });
		const timer = setTimeout(() => child.kill(), 60e3);
		child.on("error", (e) => no(fail(500, `Couldn't start ${chrome}: ${e.message}`)));
		child.on("exit", () => {
			clearTimeout(timer);
			try {
				ok(readFileSync(pdf));
			} catch {
				no(fail(500, "The browser didn't write a PDF. Open the slides and print them to PDF instead."));
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		});
	});
}
const fileSafe = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan";

// The request the canvas queues for Claude, with the context the hook hands over.
const KIND = {
	generate: ["Build from prompt", "Build the campaign structure the note describes into this plan: campaigns (objective, networks, budget, schedule), ad sets (audiences) and ads (network, format, finished copy within limits, CTA, URL). Add to what's there unless the note says to replace it. Lay new nodes out with the layout command."],
	review: ["Review plan", "Review the plan as a senior paid-media strategist. Write plan.feedback = { at, summary, items: [{ node, severity, text, suggestion }] }, replacing the previous review. Don't change nodes unless the note asks you to."],
	improve: ["Improve selection", "Improve the selected nodes as the note asks (copy, targeting, structure). Leave the rest alone. Add one feedback item (severity info) per change saying what you changed and why."],
	share: ["Publish share link", "Export the hand-off pack with `node \"TOOLS/canvas.mjs\" export ID`, read the plan.html it writes, and publish it as a private claude.ai Artifact (load the artifact-design skill first; the page is self-contained). Give the user the link, and say that it's private until they share it."],
	creative: ["Design creative", "Design finished creative for the produced ads (only the selected ones if there is a selection), following the skill's \"Design creative\" steps: read the positioning files, write each ad's prompt, generate or render the image or video at the format's size with the tools available in this session, check it, and attach it with `node \"TOOLS/canvas.mjs\" attach ID <ad id> <file>`. Ads marked UGC keep their placeholder: write the creator brief in their notes instead."],
	copy: ["Write copy", "Write finished copy for every ad still in lorem ipsum (only the selected ones if there is a selection), fitted to each network's limits and grounded in the plan's brief. In each ad's notes, describe the creative the placeholder should become (shot, subject, text overlay)."],
};
function requestContext(r) {
	const { plan } = loadPlan(r.planId);
	const sel = (r.nodeIds ?? []).map((id) => nodeById(plan, id)).filter(Boolean);
	const describe = (n) => `- ${n.id} "${n.data.name}" (${TYPES[n.type].label}${n.type === "ad" ? `, ${formatLabel(n.data.platform, n.data.format)}` : ""})`;
	const checks = lint(plan);
	return [
		`Paid media planner request: ${KIND[r.kind][0]}`,
		`Plan: "${plan.name}", file ${planPath(plan.id)} (open at http://127.0.0.1:${port}/#${plan.id})`,
		`Nodes: ${["campaign", "adset", "ad"].map((t) => `${plan.nodes.filter((n) => n.type === t).length} ${TYPES[t].label.toLowerCase()}s`).join(", ")}; ${checks.length} open checks (${checks.filter((c) => c.severity === "error").length} blockers).`,
		sel.length ? `Selected:\n${sel.map(describe).join("\n")}` : "Nothing selected: the request is about the whole plan.",
		r.note ? `The user's note: ${r.note}` : "No note.",
		budgetSummary(plan),
		`Naming convention (${plan.settings.naming.auto ? "on: edit data.label, the name is rebuilt on save" : "off"}): campaign "${plan.settings.naming.campaign}", ad set "${plan.settings.naming.adset}", ad "${plan.settings.naming.ad}".`,
		`Network options (objectives, goals, bid strategies, ages, targeting, placements per network): ${resolve(studio, "platforms.mjs")}. Use only its ids.`,
		plan.settings.context.length ? `Positioning and messaging context (read before writing copy or creative):\n${plan.settings.context.map((c) => `- ${c.name}: ${contextFile(c.path) ?? c.path}`).join("\n")}` : "No positioning files attached.",
		`What to do: ${KIND[r.kind][1].replace("TOOLS", tools).replace("ID", plan.id)}`,
		`Follow the paid-media-planner skill for the plan schema, each network's rules and how to write feedback. Edit the plan JSON directly, keeping the ids and x/y of nodes you don't change, then run \`node "${join(tools, "canvas.mjs")}" validate ${plan.id}\` (and \`layout ${plan.id}\` after adding nodes). The open canvas reloads by itself. Finish with a short summary in chat.`,
	].join("\n");
}

// --- CLI ---
const cli = {
	list: () => console.log(JSON.stringify(listPlans(), null, 2)),
	new: () => {
		const plan = newPlan(positional.slice(1).join(" ") || "Untitled plan");
		savePlan(plan);
		console.log(JSON.stringify({ id: plan.id, path: planPath(plan.id) }));
	},
	path: () => console.log(loadPlan(positional[1]).plan && planPath(positional[1])),
	validate: () => {
		const raw = existsSync(positional[1] ?? "") ? readJson(positional[1]) : readJson(planPath(positional[1]));
		if (!raw) return console.log(JSON.stringify({ ok: false, errors: ["Not found or not valid JSON"] })), process.exit(1);
		const { plan, errors } = normalize(raw);
		const checks = plan ? lint(plan) : [];
		console.log(JSON.stringify({ ok: !errors.length, errors, checks: checks.map((c) => `${c.severity} ${c.node ?? "plan"}: ${c.text}`) }, null, 2));
		process.exit(errors.length ? 1 : 0);
	},
	layout: () => {
		const { plan } = loadPlan(positional[1]);
		savePlan(layoutPlan(plan));
		console.log(JSON.stringify({ ok: true, nodes: plan.nodes.length }));
	},
	name: () => {
		const { plan } = loadPlan(positional[1]);
		const renamed = applyNaming(plan);
		savePlan(plan);
		console.log(JSON.stringify({ ok: true, renamed }));
	},
	attach: () => {
		const [, id, adId, src] = positional;
		const { plan } = loadPlan(id);
		const ad = nodeById(plan, adId);
		if (ad?.type !== "ad") throw fail(404, `No ad "${adId}" in ${id}`);
		const ext = extname(src ?? "").toLowerCase().replace(".jpeg", ".jpg");
		if (!existsSync(src ?? "") || !MIME[ext] || /text|json|html|javascript|css|font/.test(MIME[ext])) throw fail(415, "Attach an image or video file (png, jpg, webp, gif, avif, mp4, webm, mov)");
		const m = storeAsset(id, basename(src), readFileSync(src), ext);
		const card = flag("--card");
		if (card != null) {
			while (ad.data.cards.length <= Number(card)) ad.data.cards.push({ headline: `Card ${ad.data.cards.length + 1} headline` });
			Object.assign(ad.data.cards[Number(card)], m);
		} else ad.data.media = [m, ...ad.data.media.slice(1)];
		savePlan(plan);
		console.log(JSON.stringify(m));
	},
	context: () => {
		const [, id, src] = positional;
		const { plan } = loadPlan(id);
		if (!existsSync(src ?? "")) throw fail(404, `No file "${src}"`);
		const c = storeContext(id, basename(src), readFileSync(src));
		plan.settings.context.push(c);
		savePlan(plan);
		console.log(JSON.stringify({ ...c, file: contextFile(c.path) }));
	},
	export: async () => {
		const plan = viewPlan(loadPlan(positional[1]).plan, flag("--net"));
		const out = resolve(flag("--out", join(home, "exports", plan.id)));
		mkdirSync(out, { recursive: true });
		const files = { "plan.html": exportHtml(plan), "build-sheet.csv": renderCsv(plan), "plan.md": renderMarkdown(plan), "plan.xlsx": workbook(workbookSheets(plan)), "slides.html": exportSlides(plan) };
		const g = googleAdsEditorFiles(plan);
		if (g.counts.campaigns) files["google-ads-editor.zip"] = zip(g.files);
		files["canvas-images.zip"] = zip(canvasImageSvgs(plan));
		let pdfNote = null;
		try {
			files["slides.pdf"] = await slidesPdf(plan);
		} catch (e) {
			pdfNote = e.message;
		}
		for (const [f, body] of Object.entries(files)) writeFileSync(join(out, f), body);
		console.log(JSON.stringify({ dir: out, files: Object.keys(files).map((f) => join(out, f)), ...(pdfNote ? { pdf: pdfNote } : {}) }, null, 2));
	},
};
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!isMain);
else if (cli[positional[0]]) {
	Promise.resolve()
		.then(() => cli[positional[0]]())
		.catch((e) => {
			console.error(e.message);
			process.exit(1);
		});
} else serve();

// --- Server ---
export function serve(listenPort = port) {
	port = listenPort;
	const send = (res, status, body, headers = {}) => {
		const raw = typeof body === "string" || Buffer.isBuffer(body);
		res.writeHead(status, { "content-type": raw ? "text/plain; charset=utf-8" : "application/json", "cache-control": "no-store", ...headers });
		res.end(raw ? body : JSON.stringify(body));
	};
	const body = (req, limit = 2e6) =>
		new Promise((ok, no) => {
			const chunks = [];
			let size = 0;
			req.on("data", (c) => {
				size += c.length;
				if (size > limit) no(fail(413, "Too large")), req.destroy();
				else chunks.push(c);
			});
			req.on("end", () => ok(Buffer.concat(chunks)));
			req.on("error", no);
		});
	const json = async (req) => {
		try {
			return JSON.parse((await body(req)).toString("utf8") || "{}");
		} catch (e) {
			throw e.status ? e : fail(400, "Body isn't JSON");
		}
	};
	const file = (res, path) => {
		if (!existsSync(path) || !statSync(path).isFile()) return send(res, 404, "Not found");
		res.writeHead(200, { "content-type": MIME[extname(path).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-cache" });
		createReadStream(path).pipe(res);
	};

	return createServer(async (req, res) => {
		try {
			const host = (req.headers.host ?? "").split(":")[0];
			if (!["127.0.0.1", "localhost"].includes(host)) return send(res, 403, "Forbidden");
			const url = new URL(req.url, "http://127.0.0.1");
			const parts = url.pathname.split("/").filter(Boolean);
			const route = `${req.method} /${parts.map((p, i) => (parts[0] === "api" && parts[1] === "plans" && i === 2 ? ":id" : p)).join("/")}`;
			const id = parts[2];

			if (req.method === "GET" && !parts.length) return file(res, join(studio, "index.html"));
			if (req.method === "GET" && parts.length === 1 && /^[a-z]+\.(m?js|css|svg|jpg)$/.test(parts[0])) return file(res, join(studio, parts[0]));
			if (req.method === "GET" && parts.length === 2 && parts[0] === "fonts" && /^[a-z0-9-]+\.ttf$/.test(parts[1])) return file(res, join(studio, "fonts", parts[1]));
			if (req.method === "GET" && parts[0] === "assets") return file(res, assetFile(url.pathname) ?? "/nonexistent");
			if (req.method === "GET" && parts[0] === "context") return file(res, contextFile(url.pathname) ?? "/nonexistent");

			// Ad accounts through Composio (read-only import). The key stays in this process's environment.
			if (parts[0] === "api" && parts[1] === "connect") {
				const key = process.env.COMPOSIO_API_KEY;
				const net = parts[2];
				if (route === "GET /api/connect" && !key) return send(res, 200, { configured: false, networks: connectable().map((n) => ({ net: n, name: PLATFORMS[n].name, connected: false })) });
				const svc = adAccounts(composio({ apiKey: key, ...(process.env.COMPOSIO_BASE_URL ? { base: process.env.COMPOSIO_BASE_URL } : {}) }), process.env.COMPOSIO_USER_ID || "paid-media-planner");
				if (route === "GET /api/connect") return send(res, 200, { configured: true, networks: await svc.status() });
				if (req.method === "POST" && parts.length === 3) return send(res, 200, await svc.connect(net));
				if (req.method === "DELETE" && parts.length === 3) return send(res, 200, await svc.disconnect(net));
				if (req.method === "GET" && parts[3] === "accounts") return send(res, 200, await svc.accounts(net));
				if (req.method === "POST" && parts[3] === "import") return send(res, 200, await svc.import(net, (await json(req)).account));
			}

			if (route === "GET /api/plans") return send(res, 200, listPlans());
			if (route === "POST /api/plans") {
				const { name, from } = await json(req);
				const plan = from ? { ...structuredClone(loadPlan(from).plan), id: newPlan().id, name: name || "Copy", status: "draft", feedback: { at: null, summary: "", items: [] } } : newPlan(name || "Untitled plan");
				return send(res, 201, savePlan(plan));
			}
			if (route === "GET /api/plans/:id" && parts.length === 3) return send(res, 200, loadPlan(id));
			if (route === "GET /api/plans/:id/version") return send(res, 200, { version: versionOf(id) });
			if (route === "PUT /api/plans/:id") {
				const base = req.headers["x-base-version"];
				const current = versionOf(id);
				if (current && base && base !== current) return send(res, 409, loadPlan(id));
				const plan = await json(req);
				return send(res, 200, savePlan({ ...plan, id }));
			}
			if (route === "DELETE /api/plans/:id") {
				rmSync(planPath(id), { force: true });
				rmSync(join(assetsDir, okId(id) ?? "_"), { recursive: true, force: true });
				rmSync(join(contextDir, okId(id) ?? "_"), { recursive: true, force: true });
				return send(res, 200, { ok: true });
			}
			if (route === "POST /api/plans/:id/assets") {
				if (!okId(id)) throw fail(400, "Bad plan id");
				const type = String(req.headers["content-type"] ?? "");
				const ext = Object.entries(MIME).find(([e, m]) => m === type && !/text|json|html|javascript|css/.test(m))?.[0];
				if (!ext) throw fail(415, `Images or video only (got ${type || "no type"})`);
				return send(res, 201, storeAsset(id, req.headers["x-filename"] ?? "asset", await body(req, 60e6), ext));
			}
			if (route === "POST /api/plans/:id/context") {
				if (!okId(id)) throw fail(400, "Bad plan id");
				return send(res, 201, storeContext(id, String(req.headers["x-filename"] ?? "context.md"), await body(req, 1e6)));
			}
			const scoped = () => viewPlan(loadPlan(id).plan, url.searchParams.get("net"));
			const stem = () => { const p = scoped(); return `${fileSafe(p.name)}${p.viewOf ? `-${p.viewOf}` : ""}`; };
			if (route === "GET /api/plans/:id/export.xlsx") return send(res, 200, workbook(workbookSheets(scoped())), { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${stem()}.xlsx"` });
			if (route === "GET /api/plans/:id/slides.html") return send(res, 200, exportSlides(scoped(), { print: url.searchParams.has("print") }), { "content-type": "text/html; charset=utf-8" });
			if (route === "GET /api/plans/:id/slides.pdf") return send(res, 200, await slidesPdf(scoped()), { "content-type": "application/pdf", "content-disposition": `attachment; filename="${stem()}-slides.pdf"` });
			if (route === "GET /api/plans/:id/export.html") return send(res, 200, exportHtml(scoped()), { "content-type": "text/html; charset=utf-8", ...(url.searchParams.has("download") ? { "content-disposition": `attachment; filename="${id}.html"` } : {}) });
			if (route === "GET /api/plans/:id/export.csv") return send(res, 200, renderCsv(scoped()), { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${id}-build-sheet.csv"` });
			if (route === "GET /api/plans/:id/google-ads-editor.zip") {
				const g = googleAdsEditorFiles(scoped());
				if (!g.counts.campaigns) throw fail(404, "This plan has no Google Ads campaigns.");
				return send(res, 200, zip(g.files), { "content-type": "application/zip", "content-disposition": `attachment; filename="${stem()}-google-ads-editor.zip"` });
			}
			if (route === "GET /api/plans/:id/export.md") return send(res, 200, renderMarkdown(scoped()), { "content-type": "text/markdown; charset=utf-8" });

			if (route === "GET /api/request") return send(res, 200, readJson(reqPath));
			if (route === "POST /api/request") {
				const r = await json(req);
				if (!KIND[r.kind]) throw fail(400, `kind must be one of ${Object.keys(KIND).join(", ")}`);
				loadPlan(r.planId);
				const request = { id: Date.now().toString(36), kind: r.kind, planId: r.planId, note: String(r.note ?? "").slice(0, 4000), nodeIds: (r.nodeIds ?? []).slice(0, 100), at: Date.now(), deliveredAt: null };
				request.context = requestContext(request);
				writeAtomic(reqPath, JSON.stringify(request, null, 2));
				return send(res, 201, request);
			}
			if (route === "DELETE /api/request") {
				rmSync(reqPath, { force: true });
				return send(res, 200, { ok: true });
			}
			send(res, 404, "Not found");
		} catch (e) {
			send(res, e.status ?? 500, { error: e.message });
		}
	})
		.on("error", (e) => {
			if (!isMain) throw e;
			console.error(e.code === "EADDRINUSE" ? `Port ${port} is busy: the canvas may already be running at http://127.0.0.1:${port}` : e.message);
			process.exit(1);
		})
		.listen(port, "127.0.0.1", () => {
			console.log(`Paid media planner at http://127.0.0.1:${port}  (plans in ${plansDir})`);
			if (args.includes("--open")) spawn("open", [`http://127.0.0.1:${port}`], { stdio: "ignore", detached: true }).unref();
		});
}
