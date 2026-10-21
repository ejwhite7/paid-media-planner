# Paid Media Campaign Planner by GrowthCast

A Claude Code plugin from [GrowthCast](https://growthcast.app) for planning paid media campaigns on a node canvas,
mocking every ad in its network's native format, getting Claude's review, and handing the plan off for sign-off and
execution.

Campaign (objective) → Ad set (audience and targeting) → Ad (creative), across Meta, Google, TikTok, LinkedIn, Reddit, X,
Pinterest and Snapchat.

GrowthCast clients also get this planner hosted in the GrowthCast client portal, where the team builds plans and
clients review, comment and approve them. Both run the same canvas code from this repository.

## Install

```text
/plugin install paid-media-planner --marketplace ejwhite7/paid-media-planner
```

or, from your shell:

```bash
claude plugin marketplace add ejwhite7/paid-media-planner
claude plugin install paid-media-planner@growthcast
```

Then run `/paid-media-planner:open`, optionally followed by what the campaign is for (Claude builds it straight away).
`/paid-media-planner:share` exports a plan and publishes a private link. Requires Node 20 or later. No dependencies.

## Using it

| Where | What you can do |
|---|---|
| **Canvas** | Drag Campaign, Ad set or Ad tiles onto the canvas. Drag out of a node's right-hand dot to connect it or create its next level. Drop a network chip on a campaign to add it, or on an ad to switch it. Drop images or video from your desktop onto an ad (sets its creative) or an ad set (one new ad per file). Shift-drag moves a branch. ⌘Z undo, ⌘D duplicate, ⌫ delete, F fit, Tidy lays out the tree. The floating switch at the top flips between **All networks** and each network's own canvas: it shows only what runs there, and keeps its own layout. ◧ / ◨ (or `[` / `]`, `\` for both) hide the side panels to give the canvas the whole window. |
| **Network settings** | A campaign runs on one network, and every setting offers only what that network's ads manager has: its own objectives, performance goals and conversion locations, bid strategies at the level it sets them, budget levels and minimums, special ad categories, age targeting as it works there (a range, age groups, or none on Reddit), genders, targeting dimensions and placements. Google adds campaign types, networks and full responsive search ads. The catalog, with its sources, is `studio/platforms.mjs`. |
| **Inspector** | Edit the selected node. Campaigns show the objective name to pick in each network's ads manager. Ads open on their **Mock** tab: rewrite any text in place, drop creative on the grey block, switch format, and watch the character limits. **Review** has status, assignee, comments and feedback. |
| **Mocks** | Every ad in its native format, editable in place. Tick “every format” to see each ad in every format its campaign runs, and pick one with **Use**. |
| **Brief** | The hand-off view: objectives per network, targeting, copy with character counts, mocks, open issues, and a build checklist per network. |
| **Settings** | One naming convention for campaign → ad set → ad (tokens such as `{seq}`, `{funnel}`, `{label}`, `{format}`), kept on every save if you switch it on. A monthly budget per channel that sizes each channel's structure to what it can actually test: how many campaigns, ad sets and ads each get enough spend to leave learning. TOF / MOF / BOF weighting (60 / 25 / 15 by default) splits each channel's budget across its campaigns; campaign and ad set budgets are derived from it. Positioning and messaging files from GrowthCast's Positioning Wizard or marketing-strategy workshop, which Claude grounds copy and creative in. |
| **Ask Claude** | Build from prompt, Review plan, Improve selection, Write copy, Design creative. The request is queued and goes to Claude with your next message in Claude Code (“go” is enough). Claude edits the plan and the canvas reloads by itself. Claude's notes show as ✦ badges on nodes. **Design creative** has Claude make the produced ads' images and video with whatever this Claude session can use (image and video generation tools you've set up, p5.js, Blender), at each format's size. Ads marked as creator (UGC) keep their placeholder and get a creator brief. |
| **Import from an ad account** | Settings → Import from an ad account connects Meta, Google Ads, TikTok, LinkedIn, Reddit, Pinterest or Snapchat through [Composio](https://composio.dev) and brings an account's active campaigns, ad sets (ad groups) and ads onto the canvas, read-only (paused, archived and removed items stay out). Imported nodes carry the platform ids, status and live budget in their notes (Google also last-30-day results), keywords and responsive search ad copy for Google, and Meta ad copy. Add your Composio API key as the plugin's **Composio API key** setting (`/plugin` → paid-media-planner → configure). It's stored in your system's secure credential store, and the plugin's hook hands it to the running planner, which keeps it in memory only. X has no Composio ads toolkit. |
| **Share** | Download a **slide-deck PDF** for sign-off (cover, brief and funnel budget, structure, each campaign and ad set, every ad as a native mockup, open questions, build steps), an **Excel workbook** (summary, campaigns, ad sets, build sheet, checks), the hand-off pack (one self-contained HTML file), the CSV build sheet, **canvas images** (PNGs of the whole canvas, each network's canvas and each campaign), a **Google Ads Editor import** (a zip of CSVs for campaigns, locations, ad groups, keywords, negatives and responsive search ads, with the import steps) or Markdown, for all networks or one network's canvas, or have Claude publish the pack as a private claude.ai link (`/paid-media-planner:share`). |

The instant checks flag missing pieces, text over each network's limit, leftover lorem ipsum, ad sets with the same
targeting, budget spread too thin, and ads on a network their campaign doesn't run.

## How it fits together

```text
studio/          The browser app, plus modules shared with the server:
  model.mjs        platform catalog (objectives, formats, limits, CTAs), normalize, lint, layout
  mocks.mjs/.css   native ad mockups (one renderer for canvas, gallery and export)
  brief.mjs/.css   hand-off brief, CSV and Markdown
  app.js, canvas.css, index.html
tools/canvas.mjs         local server (127.0.0.1:4720) and CLI: list, new, path, validate, layout, export (HTML, PDF, xlsx, CSV, MD, Google Ads Editor zip, canvas images as SVG), name, attach, context
tools/xlsx.mjs           dependency-free .xlsx and zip writer for the workbook and Google Ads Editor exports
studio/gads.mjs          Google Ads Editor import files (CSV) from a plan's Google campaigns
studio/images.mjs        canvas images: the node graph drawn as SVG (the Share dialog makes PNGs)
studio/connect.mjs       ad-account import through Composio: connect, list accounts, read campaigns into nodes
studio/slides.mjs/.css   the slide deck, printed to PDF
tools/canvas-context.mjs UserPromptSubmit hook: hands a queued canvas request to Claude, once
skills/paid-media-planner   how Claude builds, reviews and edits plans
commands/                /paid-media-planner:open, /paid-media-planner:share
```

Plans are JSON files in `~/.paid-media-planner/plans/`, and uploaded creative goes in `~/.paid-media-planner/assets/`. Pass
`--home <dir>` on `tools/canvas.mjs` to keep them somewhere else. Saves are version-checked, so an edit made by Claude and one made in
the canvas can't silently overwrite each other.

Networks rename objectives and change limits. Update `PLATFORMS` in `studio/model.mjs` when they do. Objective names
ending in `*` are the nearest equivalent, and the brief marks them “confirm”.

## Tests

```bash
npm test
```

## What it runs, stores and sends

Everything stays on your machine unless you choose to share it.

- **A local web server.** `/paid-media-planner:open` has Claude start `node tools/canvas.mjs`, which listens on
  `127.0.0.1:4720` only and refuses requests addressed to any other host. It has no dependencies and makes no outbound
  requests.
- **Local files.** Plans are JSON files in `~/.paid-media-planner/plans/`. Images and video you add go in
  `~/.paid-media-planner/assets/`, and positioning files in `~/.paid-media-planner/context/`. A request queued from the canvas is written to `~/.paid-media-planner/request.json`.
  Exports go to `~/.paid-media-planner/exports/` unless you choose another folder.
- **One hook.** On `UserPromptSubmit`, `tools/canvas-context.mjs` reads `request.json`. If a request is waiting, it adds
  that request to the message you're sending, once, and marks it delivered. It never blocks a message, and it sends
  nothing anywhere else.
- **A headless browser, for the PDF only.** When you download the slide-deck PDF, the server prints it with Chrome,
  Edge, Chromium or Brave if one is installed (or Playwright's copy), run headless on a temporary file and closed
  straight after. Without one, the deck opens in your browser to print to PDF, or run
  `npx -y playwright@1.56.1 install chromium-headless-shell` once to give it Playwright's headless browser.
- **Fonts in exported packs.** The exported HTML loads Manrope and DM Mono from Google Fonts when someone opens it. The
  canvas itself uses copies bundled with the plugin.
- **No credentials.** The plugin never asks for or stores API keys. Design creative uses only the tools you have
  already set up in your Claude session, and generated files are attached to the plan locally.
- **Sharing is opt-in.** A private claude.ai link is created only when you run `/paid-media-planner:share` or press
  **Ask Claude** in the Share dialog, and only after you've reviewed the plan.

Works in Claude Code, and in Cowork when the session runs on your computer. claude.ai chat loads the skill and the
commands, but not the hook or the local canvas.

## License

MIT © GrowthCast. Manrope and DM Mono are bundled under the SIL Open Font License.
