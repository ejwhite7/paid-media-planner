import { test } from "node:test";
import assert from "node:assert/strict";
import { newPlan, newNode, normalize } from "../studio/model.mjs";
import { canvasImages, canvasSvg, zipStore } from "../studio/images.mjs";

function twoNetworkPlan() {
	const plan = newPlan("Spring");
	plan.nodes = [];
	for (const net of ["meta", "google"]) {
		const c = newNode("campaign", { platform: net, data: { label: `${net} <prospecting>`, funnel: "tof" } });
		const s = newNode("adset", { parent: c.id, platform: net, data: { label: "Broad" } });
		const a = newNode("ad", { parent: s.id, platform: net, data: { headline: "Mow less & book more", format: net === "google" ? "search" : "ig_feed" } });
		plan.nodes.push(c, s, a);
	}
	const { plan: p, errors } = normalize(plan);
	assert.deepEqual(errors, []);
	return p;
}

test("canvas images: the whole canvas, each network, each campaign, as standalone escaped SVG", () => {
	const imgs = canvasImages(twoNetworkPlan());
	assert.deepEqual(imgs.map((i) => i.name.replace(/campaigns\/([a-z-]+)\/.*/, "campaigns/$1/*")), ["canvas/all-networks.svg", "canvas/meta-ads.svg", "campaigns/meta-ads/*", "canvas/google-ads.svg", "campaigns/google-ads/*"]);
	for (const i of imgs) {
		assert.match(i.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+"/);
		assert.ok(i.width >= 720 && i.height > 200);
		assert.ok(!/<prospecting>|& book/.test(i.svg), "text is escaped");
	}
	assert.equal((imgs[0].svg.match(/<g transform=/g) ?? []).length, 6, "all six nodes on the whole canvas");
	assert.equal((imgs[2].svg.match(/<g transform=/g) ?? []).length, 3, "a campaign image has only its subtree");
	assert.match(imgs[2].svg, /Mow less &amp; book more/);
});

test("canvas images embed fonts and creative when given them", () => {
	const plan = twoNetworkPlan();
	plan.nodes.find((n) => n.type === "ad").data.media = [{ src: "/assets/x/hero.png", kind: "image", name: "hero.png" }];
	const { svg } = canvasSvg(plan, { fontCss: "@font-face{font-family:Manrope}", media: (src) => (src === "/assets/x/hero.png" ? "data:image/png;base64,AAAA" : null) });
	assert.match(svg, /<style>@font-face\{font-family:Manrope\}<\/style>/);
	assert.match(svg, /<image href="data:image\/png;base64,AAAA"/);
});

test("zipStore writes a readable stored zip", () => {
	const z = zipStore([{ name: "a.txt", data: "hello" }, { name: "b/c.png", data: new Uint8Array([1, 2, 3]) }]);
	const v = new DataView(z.buffer);
	assert.equal(v.getUint32(0, true), 0x04034b50);
	assert.equal(v.getUint32(z.length - 22, true), 0x06054b50);
	assert.equal(v.getUint16(z.length - 12, true), 2, "two entries");
	assert.equal(v.getUint32(14, true), 0x3610a686, "CRC-32 of hello");
});
