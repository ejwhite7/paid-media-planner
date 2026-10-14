---
name: paid-media-planner
description: Build, review and edit paid social campaign plans in the paid media planner (campaign → ad set → ad across Meta, Google, TikTok, LinkedIn, Reddit, X, Pinterest and Snapchat). Use when a message carries a [Paid media planner request] block, when the user asks to plan, structure, critique or mock up an ad campaign, or to share a plan for sign-off or execution.
---

# Paid media planner

The canvas (`tools/canvas.mjs`, http://127.0.0.1:4720) edits **plans**: JSON files in `~/.paid-media-planner/plans/<id>.json`.
You work on a plan by editing that file. The open canvas polls it and reloads within two seconds, so the user watches
your changes land. Always:

- Keep the `id`, `x`, `y` and `views` (each network canvas's own positions) of nodes you don't mean to change, and never
  drop fields you don't understand. New nodes need no `views`: the canvas places them.
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
      "data": { "name": "…", "label": "Short human part of the name", "funnel": "tof",       // tof | mof | bof | ""
                "platforms": ["meta"],                      // exactly one network per campaign
                "nativeObjective": "OUTCOME_LEADS",         // that network's objective id (CATALOG); objective (generic) is derived
                "budget": { "level": "campaign" },          // amount is DERIVED from the channel budget: don't set it
                "bidStrategy": "COST_CAP", "bidAmount": 40, // only where the network bids at campaign level
                "special": "NONE",                          // special ad category, where the network has them
                "campaignType": "", "networks": [], "locations": [], "languages": [],   // Google only: campaign settings
                "schedule": { "start": "2026-03-01", "end": "" }, "kpi": "CPL < $40", "notes": "" } },
    { "id": "as_x", "type": "adset", "parent": "cp_x", …,
      "data": { "name": "…", "locations": ["Austin, TX +25mi"], "ageMin": 30, "ageMax": 60, "genders": "all",   // all | female | male
                "languages": [], "interests": ["Lawn care"], "customAudiences": ["Site visitors 30d"], "exclusions": ["Customers"],
                "ageBuckets": [],                           // networks with age groups (TikTok, LinkedIn, Pinterest, Google)
                "targeting": { "lookalikes": ["1% purchasers"] },   // the network's other targeting dimensions, by key
                "placements": "automatic",                  // or a list of the network's placement ids
                "destination": "Website",                   // conversion location, where the objective has them
                "optimization": "LEAD_GENERATION",          // the network's goal id for the campaign's objective
                "bidStrategy": "", "bidAmount": "", "notes": "" } },
    { "id": "ad_x", "type": "ad", "parent": "as_x", …,
      "data": { "name": "…", "platform": "meta", "format": "ig_feed",
                "primaryText": "…", "headline": "…", "headline2": "", "description": "…", "cta": "Get quote",
                "url": "https://…", "displayUrl": "acmelawn.com",
                "media": [{ "src": "/assets/<plan>/<file>", "kind": "image", "name": "…" }],
                "cards": [{ "headline": "…", "src": "…", "kind": "image" }],            // carousel formats only
                "notes": "Creative direction, or the creator brief for UGC.",
                "creative": "produced",   // produced (designed or generated) | ugc (shot by a creator: keep the placeholder)
                "prompt": "The generation prompt or shot list Design creative works from." } }
  ],
  "feedback": { "at": "ISO time", "summary": "…", "items": [{ "node": "ad_x", "severity": "warn", "text": "…", "suggestion": "…", "resolved": false }] },
  "settings": {
    "naming": { "auto": true, "campaign": "{seq} // {funnel} // {objective} // {label}", "adset": "{seq} // {label}", "ad": "{seq} // {label} // {format}" },
    "channels": { "meta": { "monthly": 4000, "cpa": 35 }, "google": { "monthly": 2000, "cpa": 0 } },   // budgets per channel
    "budget": { "currency": "USD" },
    "funnel": { "tof": 60, "mof": 25, "bof": 15 },                   // budget weighting by funnel stage
    "context": [{ "name": "acme-positioning.md", "path": "/context/<plan>/<file>" }]   // positioning and messaging files
  }
}
```

## Settings

### Network options

Every campaign, ad set and ad setting must be one the network's ads manager offers. `studio/platforms.mjs` (`CATALOG`)
lists them per network: native objectives with the performance goals and conversion locations under each, bid
strategies and the level they sit at, budget levels and minimums, special ad categories, how age is targeted (Meta and
Snapchat: a range; TikTok, LinkedIn, Pinterest and Google: age groups; X: from/to steps; Reddit: no age targeting),
genders, targeting dimensions and placements. Use its ids, never invented values. LinkedIn's Job applicants objective
can't target by age, and a special ad category (Meta, TikTok) means age and gender can't be narrowed. For Google, pick
the campaign type first: it decides the ad formats and bid strategies, and locations and languages go on the campaign.
Responsive search ads take 3–15 headlines (headline, headline2, extraHeadlines) and 2–4 descriptions. Meta ads take up to 5 primary texts, headlines and descriptions (Meta's multiple text options): the main field plus `extraPrimaryTexts`, `extraHeadlines` and `extraDescriptions`, up to 4 more each. Make each option a different hook on the same message, not a different message, so the ad still reads as one idea. Text options can't be added to an existing post. A value marked
`confirm: true` exists but wasn't verified: say so where it matters.

The request block repeats the settings in plain words: the naming convention, what each channel budget can carry, and the
absolute paths of the positioning files. They bind every request.

- **Naming.** With `naming.auto` on, `normalize` rebuilds every `name` from the templates on each save, so set
  `data.label` (the human part, such as "Home cleaning — creators") and leave `name` alone. Tokens: `{seq}` (01, 01.02,
  01.02.A in canvas order), `{funnel}`, `{objective}`, `{network}`, `{label}`, `{brand}`, `{date}` (YYYYMM), and for ad
  sets `{geo}` and `{optimization}`, for ads `{letter}`, `{format}` and `{cta}`. With it off, write names that follow the
  templates anyway. `canvas.mjs name <id>` renames everything once.
- **Channel budgets.** Budgets are set per channel: `settings.channels[network] = { monthly, cpa }`. Campaign and ad
  set budgets are derived from them on every save and can't be typed in: a campaign gets its channel's monthly budget ×
  its funnel stage's weight (among the stages that channel's campaigns use), split evenly across that stage's
  campaigns, and ABO ad sets split their campaign's. `budgetPlan(settings, network)` sizes each channel: each ad set
  needs about 50 optimisation events a week (`cpa` × 50) or the network's daily minimum, and each ad about 7 a day to
  be read. Treat it as a ceiling per channel; if the user asks for more, build the most important first and say what
  you left out. If the note gives a total budget, set `settings.channels` for the networks you choose and say how you
  split it.
- **Funnel weighting.** Give every campaign a `funnel` stage: on a channel where some campaigns have one, a campaign
  without one gets no budget. TOF is
  prospecting (broad, interests, lookalikes), MOF is engaged audiences and nurture, BOF is retargeting and high intent.
  Each stage excludes the ones below it, and BOF excludes converters.
- **Positioning files.** These are Markdown from GrowthCast's Positioning Wizard or the marketing-strategy workshop: JTBD
  analysis, positioning statements, ICP messaging, product marketing context. Read every file before writing copy or
  creative. Take angles from the jobs, switching forces and differentiators, and lift customer language word for word.
  Use only proof they contain. If they contradict the brief, follow the files and raise it in a feedback item. Users can
  attach files from chat with `canvas.mjs context <id> <file>`.

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
3. Size the structure to each channel's budget (see Settings) before anything else. Create one campaign per network and
   funnel stage the budget funds (with `funnel` and the network's `nativeObjective`), then only as many ad sets as the
   channel carries, each with the network's goal id in `optimization`, each differing in one clear variable (prospecting interest stack vs. broad vs. retargeting or lookalike), with exclusions so they don't
   overlap. Retargeting ad sets exclude converters.
4. Create as many ads per ad set as the budget carries (2–5) that test different angles (pain, outcome, proof, offer),
   not trivially different wording. Mark creator-led ads `"creative": "ugc"`, put the creator brief in their notes, and
   give produced ads a `prompt`.
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

**Design creative.** Make finished creative for every `produced` ad in scope. Leave `ugc` ads' media empty, and make
sure each one's notes hold a creator brief: hook in the first 2 seconds, the beats, the claims they may make, and the
CTA. Then, per ad:
1. Read the positioning files and the ad's copy, notes and `prompt`. Decide the one idea the visual carries. It
   should be the same angle as the copy, not a generic product shot.
2. Pick the medium the format calls for, from what this session actually has:
   - Images: an image-generation tool or API the user has set up (OpenAI image generation, Gemini's Nano Banana).
   - Video for Reels, Stories, TikTok, Snap and YouTube: Veo or Seedance, or the ai-movie-making skill if it's
     installed.
   - Typographic and data-led statics, or motion loops: p5.js or HTML/CSS rendered headlessly at the exact size.
   - Product hero renders: Blender. Spatial captures: a 3D Gaussian splat render.
   - Composite: put generated plates under real type and the logo in HTML or p5, rather than asking a model to spell
     text.

   Use only tools and keys the user already has. Never ask for keys in chat or write them to a file. If nothing can
   generate media, write a production-ready `prompt` per ad and say so.
3. Render at the format's `size` from `PLATFORMS` (1080×1350 for ig_feed, 1080×1920 for stories and TikTok). Keep the
   network's safe zones clear of text. For Stories and Reels that means roughly the top 14% and the bottom 20%.
4. Look at every output before attaching it. Reject garbled text, extra fingers, invented product UI or logos, and
   anything that implies a claim the files don't support.
5. Attach the file with `node <tools>/canvas.mjs attach <plan> <ad id> <file>` (`--card n` for carousel cards). Write
   the final prompt to `prompt` and what was made to `notes`.

Finish with one line per ad: what was made and with which tool. List the ads still waiting on creators.

**Publish share link.** Follow the `/paid-media-planner:share` command's steps.

## Working without a request

Asked in chat to plan or mock a campaign: create a plan (`canvas.mjs new "<name>"`), build it as above, open
http://127.0.0.1:4720/#<id> (start the server first if needed, as the `/paid-media-planner:open` command does), and tell
the user it's there. Asked about a plan: `canvas.mjs list`, then read the file.

## Quality bar

- Names follow the naming convention in the settings, and the structure stays within what each channel budget carries.
- Copy reads like the brand, not like an ad generator: specific nouns, numbers from the brief, no "unlock", "elevate"
  or "game-changer". Never invent claims, prices, reviews or statistics the brief doesn't support. Put a `[confirm: …]`
  marker in the copy where a fact is needed.
- Native objective names differ by network. The brief and CSV map them from `PLATFORMS[p].objectives`. A trailing `*`
  means the nearest equivalent; say so if it matters for the plan.
- Platform rules change. When a recommendation depends on a current limit or policy, say it should be confirmed in that
  network's ads manager rather than stating it as fact.
