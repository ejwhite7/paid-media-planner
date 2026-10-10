// Native-format ad mockups: renderMock(ad, brand, opts) returns an HTML string, styled by mocks.css. Shared by the
// canvas (editable: text spans are contenteditable with data-field, media slots take dropped files via data-media) and
// the exported hand-off pack (static). These are layout approximations for review, not pixel copies of each network.
import { PLATFORMS } from "./model.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ICON = {
	globe: '<svg viewBox="0 0 16 16" width="11" height="11"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 8h13M8 1.5c2 2 2 11 0 13M8 1.5c-2 2-2 11 0 13" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
	heart: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
	heartFill: '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" fill="currentColor"/></svg>',
	comment: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4A8 8 0 1 1 20 12z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
	send: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
	save: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M6 3h12v18l-6-5-6 5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
	share: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M14 5l7 7-7 7v-4c-6 0-9 2-11 5 1-6 4-10 11-11z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
	like: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 10v11H3V10zM7 10l4-8c1.7 0 3 1.3 3 3v4h6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 21H7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
	up: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 4 4 13h5v7h6v-7h5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
	down: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 20 4 11h5V4h6v7h5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
	repost: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 7h11v8M18 15l-3-3M18 15l3-3M17 17H6V9M6 9l-3 3M6 9l3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
	chev: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
	chevUp: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
	dots: '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg>',
	play: '<svg viewBox="0 0 24 24" width="38" height="38"><circle cx="12" cy="12" r="11" fill="rgba(0,0,0,.55)"/><path d="M10 8v8l6-4z" fill="#fff"/></svg>',
	music: '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="18" r="3" fill="currentColor"/><circle cx="17" cy="16" r="3" fill="currentColor"/></svg>',
};

function ctx(ad, brand, opts) {
	const editable = !!opts.editable;
	const platform = opts.platform ?? ad.platform;
	const p = PLATFORMS[platform] ?? PLATFORMS.meta;
	const format = p.formats[opts.format] ? opts.format : p.formats[ad.format] && platform === ad.platform ? ad.format : Object.keys(p.formats)[0];
	const f = p.formats[format];
	// t(field): an ad field as text, editable in place in the canvas.
	const t = (field, cls = "") => {
		const v = field.split(".").reduce((o, k) => o?.[k], ad) ?? "";
		return editable ? `<span class="ed ${cls}" data-field="${field}" contenteditable="plaintext-only" spellcheck="true">${esc(v)}</span>` : `<span class="${cls}">${esc(v)}</span>`;
	};
	const ratio = (r) => (r ? `aspect-ratio:${r[0]}/${r[1]}` : "");
	// media(i): the ad's i-th media, or a labelled placeholder block of the format's shape.
	const media = (i = 0, r = f.ratio, slot = `${i}`, item = ad.media[i]) => {
		const style = ratio(r);
		const attrs = editable ? ` data-media="${slot}" title="Drop an image or video, or click to choose"` : "";
		if (item?.src) {
			const el = item.kind === "video" ? `<video src="${esc(item.src)}" muted loop autoplay playsinline></video>` : `<img src="${esc(item.src)}" alt="">`;
			return `<div class="mk-media has"${attrs} style="${style}">${el}${editable ? `<button class="mk-rm" data-rm="${slot}" title="Remove">✕</button>` : ""}</div>`;
		}
		const size = f.size ?? "";
		const ugc = ad.creative === "ugc";
		return `<div class="mk-media mk-ph${ugc ? " mk-ugc" : ""}"${attrs} style="${style}"><div><b>${ugc ? "Creator video (UGC)" : editable ? "Drop creative" : "Creative"}</b><small>${esc(size)}${r ? ` · ${r[0] > 99 ? (r[0] / r[1]).toFixed(2) : r[0]}:${r[0] > 99 ? 1 : r[1]}` : ""}</small></div></div>`;
	};
	const avatar = (size = 36) =>
		brand.logo
			? `<img class="mk-av" src="${esc(brand.logo)}" style="width:${size}px;height:${size}px" alt="">`
			: `<span class="mk-av" style="width:${size}px;height:${size}px;background:${esc(brand.color || "#5B5BD6")};font-size:${Math.round(size * 0.42)}px">${esc((brand.name || "B").trim()[0] ?? "B")}</span>`;
	const name = esc(brand.name || "Your Brand");
	const handle = esc((brand.handle || "yourbrand").replace(/^@/, ""));
	const site = esc(ad.displayUrl || brand.website || "example.com");
	const cta = editable ? t("cta") : esc(ad.cta);
	const cards = () => {
		const list = ad.cards.length ? ad.cards : [{}, {}, {}];
		return list.map((c, i) => ({ c, i }));
	};
	return { editable, platform, p, format, f, t, media, avatar, name, handle, site, cta, cards };
}

const R = {
	meta: {
		fb_feed: ({ t, media, avatar, name, site, cta }) => `
<div class="mk mk-fb">
	<div class="mk-row mk-pad">${avatar(40)}<div class="mk-who"><b>${name}</b><small>Sponsored · ${ICON.globe}</small></div><span class="mk-dim">${ICON.dots}</span></div>
	<div class="mk-pad mk-body">${t("primaryText")}</div>
	${media()}
	<div class="mk-fb-link"><div class="mk-grow"><small class="mk-up">${site}</small><b>${t("headline")}</b><small>${t("description")}</small></div><span class="mk-btn mk-btn-grey">${cta}</span></div>
	<div class="mk-fb-actions"><span>${ICON.like} Like</span><span>${ICON.comment} Comment</span><span>${ICON.share} Share</span></div>
</div>`,
		fb_carousel: ({ t, media, avatar, name, site, cta, cards, editable }) => `
<div class="mk mk-fb">
	<div class="mk-row mk-pad">${avatar(40)}<div class="mk-who"><b>${name}</b><small>Sponsored · ${ICON.globe}</small></div><span class="mk-dim">${ICON.dots}</span></div>
	<div class="mk-pad mk-body">${t("primaryText")}</div>
	<div class="mk-carousel">${cards()
		.map(({ c, i }) => `<div class="mk-card">${media(i, [1, 1], `card.${i}`, c)}<div class="mk-card-foot"><div class="mk-grow"><b>${editable ? `<span class="ed" data-field="cards.${i}.headline" contenteditable="plaintext-only">${esc(c.headline ?? `Card ${i + 1} headline`)}</span>` : esc(c.headline ?? `Card ${i + 1} headline`)}</b><small>${site}</small></div><span class="mk-btn mk-btn-grey">${cta}</span></div></div>`)
		.join("")}${editable ? `<button class="mk-addcard" data-addcard>+ Card</button>` : ""}</div>
	<div class="mk-fb-actions"><span>${ICON.like} Like</span><span>${ICON.comment} Comment</span><span>${ICON.share} Share</span></div>
</div>`,
		ig_feed: ({ t, media, avatar, handle, cta }) => `
<div class="mk mk-ig">
	<div class="mk-row mk-pad-s">${avatar(32)}<div class="mk-who"><b>${handle}</b><small>Sponsored</small></div><span>${ICON.dots}</span></div>
	${media()}
	<div class="mk-ig-cta"><span>${cta}</span>${ICON.chev}</div>
	<div class="mk-row mk-pad-s mk-ig-icons"><span>${ICON.heart}</span><span>${ICON.comment}</span><span>${ICON.send}</span><span class="mk-grow"></span><span>${ICON.save}</span></div>
	<div class="mk-pad-s mk-body"><b>${handle}</b> ${t("primaryText")}</div>
</div>`,
		ig_story: ({ t, media, avatar, handle, cta }) => `
<div class="mk mk-story">
	${media()}
	<div class="mk-story-top"><div class="mk-bars"><i></i><i></i></div><div class="mk-row">${avatar(28)}<div class="mk-who"><b>${handle}</b><small>Sponsored</small></div><span>${ICON.dots}</span></div></div>
	<div class="mk-story-cap">${t("headline")}</div>
	<div class="mk-story-cta"><span class="mk-up-chev">${ICON.chevUp}</span><span class="mk-pill">${cta}</span></div>
</div>`,
	},
	google: {
		search: ({ t, avatar, name, site }) => `
<div class="mk mk-gsearch">
	<b class="mk-sponsored">Sponsored</b>
	<div class="mk-row">${avatar(26)}<div class="mk-who"><span>${name}</span><small>${site}</small></div><span class="mk-dim">${ICON.dots}</span></div>
	<div class="mk-gs-h">${t("headline")} <span class="mk-dim">|</span> ${t("headline2")}</div>
	<div class="mk-gs-d">${t("description")}</div>
</div>`,
		display: ({ t, media, avatar, name, cta }) => `
<div class="mk mk-gdisp">
	${media()}
	<div class="mk-pad"><b class="mk-gd-h">${t("headline")}</b><div class="mk-gd-d">${t("description")}</div>
	<div class="mk-row mk-gd-foot">${avatar(22)}<span class="mk-grow">${name}</span><span class="mk-btn mk-btn-blue">${cta}</span></div></div>
	<span class="mk-adchoice">Ad ▷</span>
</div>`,
		youtube: ({ t, media, avatar, site, cta }) => `
<div class="mk mk-yt">
	<div class="mk-yt-frame">${media()}<div class="mk-yt-ad"><b>Sponsored</b> · ${site}</div><div class="mk-yt-skip">Skip ▸|</div><div class="mk-yt-bar"><i></i></div></div>
	<div class="mk-row mk-pad">${avatar(36)}<div class="mk-who mk-grow"><b>${t("headline")}</b><small><b>Sponsored</b> · ${site}</small></div><span class="mk-btn mk-btn-blue mk-round">${cta}</span></div>
</div>`,
	},
	tiktok: {
		infeed: ({ t, media, avatar, handle, cta }) => `
<div class="mk mk-tt">
	${media()}
	<div class="mk-tt-top"><span>Following</span><b>For You</b></div>
	<div class="mk-tt-rail"><div class="mk-tt-av">${avatar(42)}<i>+</i></div><span>${ICON.heartFill}<small>18.4K</small></span><span>${ICON.comment}<small>312</small></span><span>${ICON.save}<small>1,209</small></span><span>${ICON.share}<small>Share</small></span></div>
	<div class="mk-tt-cap"><b>${handle}</b><div>${t("primaryText")}</div><small class="mk-tt-tag">Sponsored</small><small>${ICON.music} Promoted music</small><div class="mk-tt-cta">${cta}<span>${ICON.chev}</span></div></div>
</div>`,
	},
	linkedin: {
		single_image: ({ t, media, avatar, name, site, cta }) => `
<div class="mk mk-li">
	<div class="mk-row mk-pad">${avatar(44)}<div class="mk-who mk-grow"><b>${name}</b><small>4,821 followers</small><small>Promoted</small></div><span class="mk-dim">${ICON.dots}</span></div>
	<div class="mk-pad mk-body">${t("primaryText")}</div>
	${media()}
	<div class="mk-li-link"><div class="mk-grow"><b>${t("headline")}</b><small>${site}</small></div><span class="mk-btn mk-btn-outline">${cta}</span></div>
	<div class="mk-li-actions"><span>${ICON.like} Like</span><span>${ICON.comment} Comment</span><span>${ICON.repost} Repost</span><span>${ICON.send} Send</span></div>
</div>`,
		li_carousel: ({ t, media, avatar, name, cards, editable }) => `
<div class="mk mk-li">
	<div class="mk-row mk-pad">${avatar(44)}<div class="mk-who mk-grow"><b>${name}</b><small>4,821 followers</small><small>Promoted</small></div><span class="mk-dim">${ICON.dots}</span></div>
	<div class="mk-pad mk-body">${t("primaryText")}</div>
	<div class="mk-carousel">${cards()
		.map(({ c, i }) => `<div class="mk-card">${media(i, [1, 1], `card.${i}`, c)}<div class="mk-card-foot"><b>${editable ? `<span class="ed" data-field="cards.${i}.headline" contenteditable="plaintext-only">${esc(c.headline ?? `Card ${i + 1} headline`)}</span>` : esc(c.headline ?? `Card ${i + 1} headline`)}</b></div></div>`)
		.join("")}${editable ? `<button class="mk-addcard" data-addcard>+ Card</button>` : ""}</div>
	<div class="mk-li-actions"><span>${ICON.like} Like</span><span>${ICON.comment} Comment</span><span>${ICON.repost} Repost</span><span>${ICON.send} Send</span></div>
</div>`,
	},
	reddit: {
		promoted: ({ t, media, avatar, handle, site, cta }) => `
<div class="mk mk-rd">
	<div class="mk-row mk-pad-s">${avatar(24)}<div class="mk-who mk-grow"><span><b>u/${handle}</b> · <span class="mk-dim">Promoted</span></span></div><span class="mk-dim">${ICON.dots}</span></div>
	<div class="mk-pad-s mk-rd-title">${t("headline")}</div>
	${media()}
	<div class="mk-rd-link"><span class="mk-grow">${site}</span><span class="mk-btn mk-btn-rd">${cta}</span></div>
	<div class="mk-rd-actions"><span class="mk-rd-vote">${ICON.up}<b>Vote</b>${ICON.down}</span><span>${ICON.comment} 48</span><span>${ICON.share} Share</span></div>
</div>`,
	},
	x: {
		promoted: ({ t, media, avatar, name, handle, site }) => `
<div class="mk mk-x">
	${avatar(40)}
	<div class="mk-grow">
		<div class="mk-row"><b>${name}</b><span class="mk-dim">@${handle}</span><span class="mk-grow"></span><span class="mk-dim">${ICON.dots}</span></div>
		<div class="mk-body">${t("primaryText")}</div>
		<div class="mk-x-card">${media()}<span class="mk-x-site">${t("headline")}</span></div>
		<small class="mk-dim">From ${site}</small>
		<div class="mk-x-actions"><span>${ICON.comment} 24</span><span>${ICON.repost} 61</span><span>${ICON.heart} 402</span><span>${ICON.share}</span></div>
		<small class="mk-dim mk-x-ad">Ad</small>
	</div>
</div>`,
	},
	pinterest: {
		pin: ({ t, media, avatar, name }) => `
<div class="mk mk-pin">
	<div class="mk-pin-img">${media()}<span class="mk-pin-save">Save</span></div>
	<div class="mk-pin-title">${t("headline")}</div>
	<div class="mk-row mk-pin-by">${avatar(22)}<span>Promoted by <b>${name}</b></span></div>
	<div class="mk-pin-desc mk-dim">${t("description")}</div>
</div>`,
	},
	snapchat: {
		single: ({ t, media, avatar, name, cta }) => `
<div class="mk mk-snap">
	${media()}
	<div class="mk-snap-top">${avatar(30)}<div class="mk-who"><b>${name}</b><small>Ad</small></div></div>
	<div class="mk-snap-head">${t("headline")}</div>
	<div class="mk-snap-cta"><span class="mk-up-chev">${ICON.chevUp}</span><span class="mk-pill mk-pill-snap">${cta}</span></div>
</div>`,
	},
};

export function renderMock(ad, brand = {}, opts = {}) {
	const c = ctx(ad, brand, opts);
	const fn = R[c.platform]?.[c.format];
	return `<div class="mk-wrap" data-platform="${c.platform}" data-format="${c.format}">${fn ? fn(c) : ""}</div>`;
}

export const formatLabel = (platform, format) => `${PLATFORMS[platform]?.short ?? platform} · ${PLATFORMS[platform]?.formats[format]?.name ?? format}`;
