---
name: paid-media-planner
description: Build, review and edit paid social campaign plans in the paid media planner (campaign → ad set → ad across Meta, Google, TikTok, LinkedIn, Reddit, X, Pinterest and Snapchat). Use when a message carries a [Paid media planner request] block, when the user asks to plan, structure, critique or mock up an ad campaign, or to share a plan for sign-off or execution.
---

# Paid media planner

The canvas (`tools/canvas.mjs`, http://127.0.0.1:4720) edits **plans**: JSON files in `~/.paid-media-planner/plans/<id>.json`.
You work on a plan by editing that file. The open canvas polls it and reloads within two seconds, so the user watches
your changes land. Always:

- Keep the `id`, `x` and `y` of nodes you don't mean to change, and never drop fields you don't understand.
- After editing, run `node <tools>/canvas.mjs validate <id>`. Fix every entry in `errors`. `checks` are the canvas's own
  lint: clear the ones your change was meant to clear.
- After adding nodes, run `node <tools>/canvas.mjs layout <id>` to tidy the tree.
- End with a short chat summary (what changed, what you'd do next). Long reasoning belongs in the plan's feedback, not chat.

`<tools>` is the plugin's `tools/` folder. The request block gives its absolute path.

## Plan schema

```jsonc
{
  "schema": 1, "id": "…", "name": "Spring promo", "owner": "", "status": "draft",   // draft | in_review | changes_requested | approved | live
  "brief": "Free text: product, offer, audience, budget, success metric. Read it before every request.",
  "brand": { "name": "Acme Lawn", "handle": "acmelawn", "website": "acmelawn.com", "color": "#2f7d32", "logo": "" },
  "nodes": [
    { "id": "cp_x", "type": "campaign", "parent": null, "x": 80, "y": 200, "status": "draft", "assignee": "", "comments": [],
      "data": { "name": "…", "platforms": ["meta", "tiktok"], "objective": "leads",          // awareness | traffic | engagement | video_views | leads | app | sales
                "budget": { "type": "daily", "amount": 100, "currency": "USD", "level": "campaign" },   // level: campaign (CBO) | adset (ABO)
                "schedule": { "start": "2026-03-01", "end": "" }, "kpi": "CPL < $40", "notes": "" } },
    { "id": "as_x", "type": "adset", "parent": "cp_x", …,
      "data": { "name": "…", "locations": ["Austin, TX +25mi"], "ageMin": 30, "ageMax": 60, "genders": "all",   // all | female | male
                "languages": [], "interests": ["Lawn care"], "customAudiences": ["Site visitors 30d"], "exclusions": ["Customers"],
                "placements": "automatic", "optimization": "Leads", "budget": null, "notes": "" } },
    { "id": "ad_x", "type": "ad", "parent": "as_x", …,
      "data": { "name": "…", "platform": "meta", "format": "ig_feed",
                "primaryText": "…", "headline": "…", "headline2": "", "description": "…", "cta": "Get quote",
                "url": "https://…", "displayUrl": "acmelawn.com",
                "media": [{ "src": "/assets/<plan>/<file>", "kind": "image", "name": "…" }],
                "cards": [{ "headline": "…", "src": "…", "kind": "image" }],            // carousel formats only
                "notes": "Creative direction for the placeholder." } }
  ],
  "feedback": { "at": "ISO time", "summary": "…", "items": [{ "node": "ad_x", "severity": "warn", "text": "…", "suggestion": "…", "resolved": false }] }
}
```

Parents must be one level up: an ad set's parent is a campaign, an ad's is an ad set. New ids: `cp_`, `as_`, `ad_` plus
six random lowercase letters or digits. An ad's `platform` must be one of its campaign's `platforms`.

**Networks and formats** (the catalog, with every limit and each network's native objective names, is `PLATFORMS` in
`studio/model.mjs`; read it rather than guessing):

| platform | formats | text limits the mock checks |
|---|---|---|
| meta | fb_feed, fb_carousel, ig_feed, ig_story | primaryText 125, headline 40, description 30 |
| google | search, display, youtube | headline 30, headline2 30, description 90 |
| tiktok | infeed | primaryText 100 |
| linkedin | single_image, li_carousel | primaryText 150, headline 70 |
| reddit | promoted | headline 300 (the post title) |
| x | promoted | primaryText 280, headline 70 |
| pinterest | pin | headline 100, description 500 |
| snapchat | single | headline 34, brand name 25 |

Which fields each mock shows: Google search shows headline | headline2 and description. Stories, Snapchat and Pinterest
lead with the headline. Reddit's headline is the post title. TikTok, X and the feeds lead with primaryText. Write for the
field the format actually shows.

## Requests from the canvas

The request block says which one it is. The user's note, if any, wins over these defaults.

**Build from prompt.** Read the brief and the note. Then:
1. Pick the objective from the business outcome, not the vanity metric (leads business → `leads`, ecommerce → `sales`).
2. Pick networks where the audience actually is, and say why in the campaign `notes`. Don't spread a small budget thin:
   under about $3k/month, one or two networks beat five.
3. Create one campaign per network group that shares an objective and budget logic, then 2–4 ad sets that differ in one
   clear variable each (prospecting interest stack vs. broad vs. retargeting or lookalike), with exclusions so they don't
   overlap. Retargeting ad sets exclude converters.
4. Create 2–3 ads per ad set that test different angles (pain, outcome, proof, offer), not trivially different wording.
   Write finished copy inside the limits, a real CTA from that network's list, and `notes` describing the creative to
   shoot or design. Leave media empty: the placeholders show the right shape.
5. Fill `brief` if it was empty, then run validate and layout.

**Review plan.** Act as a senior paid-media strategist reviewing before spend. Replace `feedback` with a `summary`
(3–6 sentences: overall verdict, the biggest risk, the highest-leverage fix) and `items` anchored to nodes. Look at:
objective vs. the business outcome; budget per ad set vs. the learning phase (roughly 50 optimisation events a week per
ad set on Meta; similar logic elsewhere); audience overlap and missing exclusions; audience size realism; whether ads in
an ad set test distinct angles; copy hooking in the first line or first 2 seconds; CTA matching the funnel stage;
landing URL and tracking; format fit (vertical video for TikTok, Reels and Snap; search for demand capture); and
policy-sensitive categories (housing, employment, credit, health and others limit targeting). Severity: `error` will
waste money or get rejected, `warn` should be fixed before launch, `info` is optional, `good` names something to keep.
Every item gets a concrete `suggestion`. Don't edit nodes unless asked.

**Improve selection.** Change only the listed nodes. Add one `info` feedback item per change saying what changed and why,
so the reviewer can see your reasoning on the node.

**Write copy.** Replace lorem ipsum in the target ads with finished copy, within limits, varied across ads in the same
ad set. Put creative direction in `notes`.

**Publish share link.** Follow the `/paid-media-planner:share` command's steps.

## Working without a request

Asked in chat to plan or mock a campaign: create a plan (`canvas.mjs new "<name>"`), build it as above, open
http://127.0.0.1:4720/#<id> (start the server first if needed, as the `/paid-media-planner:open` command does), and tell
the user it's there. Asked about a plan: `canvas.mjs list`, then read the file.

## Quality bar

- Copy reads like the brand, not like an ad generator: specific nouns, numbers from the brief, no "unlock", "elevate"
  or "game-changer". Never invent claims, prices, reviews or statistics the brief doesn't support. Put a `[confirm: …]`
  marker in the copy where a fact is needed.
- Native objective names differ by network. The brief and CSV map them from `PLATFORMS[p].objectives`. A trailing `*`
  means the nearest equivalent; say so if it matters for the plan.
- Platform rules change. When a recommendation depends on a current limit or policy, say it should be confirmed in that
  network's ads manager rather than stating it as fact.
