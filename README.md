# Paid Media Campaign Planner by GrowthCast

A Claude Code plugin from [GrowthCast](https://growthcast.app) for planning paid media campaigns on a node canvas,
mocking every ad in its network's native format, getting Claude's review, and handing the plan off for sign-off and
execution.

Campaign (objective) → Ad set (audience and targeting) → Ad (creative), across Meta, Google, TikTok, LinkedIn, Reddit, X,
Pinterest and Snapchat.

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
| **Canvas** | Drag Campaign, Ad set or Ad tiles onto the canvas. Drag out of a node's right-hand dot to connect it or create its next level. Drop a network chip on a campaign to add it, or on an ad to switch it. Drop images or video from your desktop onto an ad (sets its creative) or an ad set (one new ad per file). Shift-drag moves a branch. ⌘Z undo, ⌘D duplicate, ⌫ delete, F fit, Tidy lays out the tree. |
| **Inspector** | Edit the selected node. Campaigns show the objective name to pick in each network's ads manager. Ads open on their **Mock** tab: rewrite any text in place, drop creative on the grey block, switch format, and watch the character limits. **Review** has status, assignee, comments and feedback. |
| **Mocks** | Every ad in its native format, editable in place. Tick “every format” to see each ad in every format its campaign runs, and pick one with **Use**. |
| **Brief** | The hand-off view: objectives per network, targeting, copy with character counts, mocks, open issues, and a build checklist per network. |
| **Ask Claude** | Build from prompt, Review plan, Improve selection, Write copy. The request is queued and goes to Claude with your next message in Claude Code (“go” is enough). Claude edits the plan and the canvas reloads by itself. Claude's notes show as ✦ badges on nodes. |
| **Share** | Download the hand-off pack (one self-contained HTML file), the CSV build sheet (one row per ad) or Markdown, or have Claude publish the pack as a private claude.ai link (`/paid-media-planner:share`). |

The instant checks flag missing pieces, text over each network's limit, leftover lorem ipsum, ad sets with the same
targeting, budget spread too thin, and ads on a network their campaign doesn't run.

## How it fits together

```text
studio/          The browser app, plus modules shared with the server:
  model.mjs        platform catalog (objectives, formats, limits, CTAs), normalize, lint, layout
  mocks.mjs/.css   native ad mockups (one renderer for canvas, gallery and export)
  brief.mjs/.css   hand-off brief, CSV and Markdown
  app.js, canvas.css, index.html
tools/canvas.mjs         local server (127.0.0.1:4720) and CLI: list, new, path, validate, layout, export
tools/canvas-context.mjs UserPromptSubmit hook: hands a queued canvas request to Claude, once
skills/paid-media-planner   how Claude builds, reviews and edits plans
commands/                /paid-media-planner:open, /paid-media-planner:share
```

Plans are JSON files in `~/.paid-media-planner/plans/`, and uploaded creative goes in `~/.paid-media-planner/assets/`. Set
`PAID_MEDIA_PLANNER_HOME` to keep them somewhere else. Saves are version-checked, so an edit made by Claude and one made in
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
  `~/.paid-media-planner/assets/`. A request queued from the canvas is written to `~/.paid-media-planner/request.json`.
  Exports go to `~/.paid-media-planner/exports/` unless you choose another folder.
- **One hook.** On `UserPromptSubmit`, `tools/canvas-context.mjs` reads `request.json`. If a request is waiting, it adds
  that request to the message you're sending, once, and marks it delivered. It never blocks a message, and it sends
  nothing anywhere else.
- **Fonts in exported packs.** The exported HTML loads Manrope and DM Mono from Google Fonts when someone opens it. The
  canvas itself uses the bundled copies in `studio/fonts/`.
- **Sharing is opt-in.** A private claude.ai link is created only when you run `/paid-media-planner:share` or press
  **Ask Claude** in the Share dialog, and only after you've reviewed the plan.

Works in Claude Code, and in Cowork when the session runs on your computer. claude.ai chat loads the skill and the
commands, but not the hook or the local canvas.

## License

MIT © GrowthCast. Manrope and DM Mono are bundled under the SIL Open Font License.
