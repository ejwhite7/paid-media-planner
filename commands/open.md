---
description: Open the paid media planner, where you lay out campaigns, ad sets and ads, mock the ads natively, and send requests to Claude with your next message
argument-hint: "[what the campaign is for, to build it straight away]"
---

Open the paid media planner for the user.

1. Start it: `node "${CLAUDE_PLUGIN_ROOT}/tools/canvas.mjs" --port 4720` (if `${CLAUDE_PLUGIN_ROOT}` wasn't filled in, the
   script is `tools/canvas.mjs` in the paid-media-planner plugin's folder). It is a local server: start it the way this
   client runs dev servers (a preview or launch configuration if there is one, otherwise in the background). If it says
   port 4720 is busy, it is already running.
2. Open http://127.0.0.1:4720 where the user can see it: the client's built-in browser pane if it has one, otherwise
   start it with `--open` so it opens in their browser.
3. Tell the user in two or three sentences: drag a Campaign, Ad set or Ad from the left onto the canvas (or drag out of a
   node's right-hand dot to create its next level), click a node to edit it, and open Mocks to see every ad in its
   network's native format, where any text can be rewritten in place and images or video dropped onto the grey blocks.
   The Ask Claude buttons queue a request that comes to Claude with their next message here.

If `$ARGUMENTS` describes a campaign, also build it now: create a plan with
`node "${CLAUDE_PLUGIN_ROOT}/tools/canvas.mjs" new "<short name>"`, then follow the paid-media-planner skill's "Build from
prompt" steps on that plan, and open http://127.0.0.1:4720/#<plan id>.

When a message arrives with a `[Paid media planner request]` block, it is the request the user queued in the canvas: follow
it with the paid-media-planner skill.
