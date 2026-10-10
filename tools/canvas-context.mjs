// UserPromptSubmit hook: hands Claude the request queued in the paid media planner (Build from prompt, Review plan, Improve
// selection, Write copy) as context for the message being sent. Each request is delivered once, to the first session
// that sends a message; the canvas then shows it as picked up. A request older than twelve hours is ignored. The hook
// never blocks a message: on any problem it adds nothing.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const home = args.includes("--home") ? args[args.indexOf("--home") + 1] : join(homedir(), ".paid-media-planner");
const reqPath = join(resolve(home), "request.json");

try {
	const input = JSON.parse(readFileSync(0, "utf8") || "{}");
	const r = JSON.parse(readFileSync(reqPath, "utf8"));
	if (!r?.context || r.deliveredAt || Date.now() - r.at > 12 * 3600e3) process.exit(0);
	writeFileSync(`${reqPath}.tmp`, JSON.stringify({ ...r, deliveredAt: Date.now(), session: input.session_id ?? null }, null, 2));
	renameSync(`${reqPath}.tmp`, reqPath);
	process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: `[Paid media planner request]\n${r.context}` } }));
} catch {
	process.exit(0);
}
