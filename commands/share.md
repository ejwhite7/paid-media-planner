---
description: Export a campaign plan as a hand-off pack (HTML brief with native mocks), slide-deck PDF, Excel workbook, CSV build sheet, Google Ads Editor import and Markdown, and publish a private link
argument-hint: "[plan id or name]"
---

Share a paid media planner plan.

1. Find the plan: `node "${CLAUDE_PLUGIN_ROOT}/tools/canvas.mjs" list`. Use the one `$ARGUMENTS` names, otherwise the
   most recently updated; if several are plausible, ask which one.
2. Validate it with `canvas.mjs validate <id>`. If there are blocker checks (severity `error`), list them and ask whether
   to share anyway.
3. Export: `node "${CLAUDE_PLUGIN_ROOT}/tools/canvas.mjs" export <id>`. It writes `plan.html` (self-contained: brief,
   each network's objective, targeting, copy, native mocks, build checklist), `slides.pdf` (a 16:9 deck walking through
   structure, budget, targeting and every ad as a mockup; printed with a local Chrome-family browser, and skipped with a
   note if there isn't one: offer to run `npx -y playwright@1.56.1 install chromium-headless-shell` and export again, or print
   `slides.html` to PDF from any browser), `plan.xlsx`, `build-sheet.csv`,
   `plan.md`, `canvas-images.zip` (SVG images of the whole canvas, each network and each campaign; the Share dialog makes PNGs),
   and `google-ads-editor.zip` when the plan has Google campaigns (import files for Google Ads Editor). Add `--net <network>` when the user wants one network's canvas only.
4. Read `plan.html`, then publish it as a private claude.ai Artifact (load the artifact-design skill first; keep the page
   as exported apart from what that skill requires). Give the user the link and say that it's private until they share it.
5. Mention the PDF, Excel, CSV, Markdown and Google Ads Editor paths for whoever builds the campaigns, and that the build checklist in the page keeps
   its ticks in each viewer's own browser.
