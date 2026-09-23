/**
 * pi-nebula — the chrome extension.
 *
 * Owns every visual slot pi exposes to extensions:
 *   welcome panel      → ctx.ui.setHeader() — persistent, pinned at the top of
 *                        the screen, above the conversation and the status bar
 *                        (design order: panel · status bar · editor · metrics)
 *   status bar         → ctx.ui.setWidget("nebula-status")  (above editor)
 *   bottom footer      → ctx.ui.setFooter() — rendered blank; only used to
 *                        capture footerData (git branch) for the status bar
 *   metrics bar        → ctx.ui.setWidget("nebula-metrics", …, belowEditor)
 *   editor shell       → class NebulaEditor extends CustomEditor (shared INDENT)
 *   tool rows          → pi.registerTool() over the 7 built-ins, execute()
 *                        delegated back to the original definitions. Drawn with
 *                        renderShell: "self" (no box/background): a call line
 *                        "● Name  [arg • arg]  42ms" plus a "└ summary" result
 *                        line; raw output only when the row is expanded.
 *   user messages      → pi.registerMarkdownTransformer() prepends the design's
 *                        "❯ " marker. Built-in message renderers are not
 *                        replaceable, so this is the only hook that reaches them.
 *
 * Colors are the base16 "nebula" scheme (same values as themes/nebula.json),
 * emitted as raw truecolor ANSI. The chrome and the theme ship together as one
 * package, so the two can never drift.
 *
 * Configuration (settings.json → "nebula" key, per ADR-0002):
 *   { "welcome": "header" | "overlay" | "off" }   default "header"
 *
 * /nebula-off restores pi's built-in header/footer/widgets/editor for the
 * current session. Width is never hardcoded: pi re-calls render(width) on
 * resize, and all trimming goes through pi's own visibleWidth/truncateToWidth.
 */

import { readdirSync, readFileSync, statSync, watch } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
// Namespace import on purpose: a single missing named export would otherwise
// kill the whole module at load time. Everything is read defensively below.
import * as piPkg from "@earendil-works/pi-coding-agent";
// Agent config dir — honors PI_CODING_AGENT_DIR (docs/environment-variables.md).
const getAgentDir: () => string =
	(piPkg as any).getAgentDir ?? (() => join(homedir(), ".pi/agent"));
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const VERSION: string = (piPkg as any).VERSION ?? "?";
const SessionManager: any = (piPkg as any).SessionManager;

// ---------------------------------------------------------------- palette --
// base16 "nebula" — ~/.dotfiles/nix/homeConfigurations/unsual/stylix/default.nix
// (user's own relabeling: base08 = pink, base0B = cyan)
const C = {
	panel: "131c26", sel: "1b2834", dim: "30465b", muted: "5d7a96",
	text: "c9d8e8", bright: "e8f1f8", white: "ffffff",
	accent: "ff6ad5", warn: "ffe08a", ok: "7de4ff", info: "9cd9ff", key: "c48dff",
};
const rgb = (h: string) => `${parseInt(h.slice(0, 2), 16)};${parseInt(h.slice(2, 4), 16)};${parseInt(h.slice(4, 6), 16)}`;
const fg = (c: string, s: string) => `\x1b[38;2;${rgb(c)}m${s}\x1b[39m`;
const bg = (c: string, s: string) => `\x1b[48;2;${rgb(c)}m${s}\x1b[49m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;

// ----------------------------------------------------------------- indent --
// Single knob for the whole chrome block: status bar, metrics bar and the
// editor shell all use it, so they stay aligned. 0 = flush left.
const INDENT = 0;

// ------------------------------------------------------------------ width --
const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - visibleWidth(s)));
const padL = (s: string, n: number) => " ".repeat(Math.max(0, n - visibleWidth(s))) + s;
const center = (s: string, n: number) => " ".repeat(Math.max(0, Math.floor((n - visibleWidth(s)) / 2))) + s;
const fit = (s: string, n: number) => truncateToWidth(pad(s, n), n);
const lr = (l: string, r: string, n: number) => pad(l, Math.max(0, n - visibleWidth(r))) + r;

// The Pi logo: 4x4 grid 1110 / 1010 / 1101 / 1001, each cell 3 chars wide.
const PI_BANNER = ["█████████", "███   ███", "██████   ███", "███      ███"];
const BANNER_W = Math.max(...PI_BANNER.map((b) => visibleWidth(b)));

const G = { dot: "●", ok: "✓", bad: "✗", tree: "└", bullet: "•", branch: "\ue0a0", bulb: "\uf0eb", cube: "\uf1b2", clock: "\uf017", heavyH: "━", heavyV: "┃" };

// --------------------------------------------------------------- settings --
type WelcomeMode = "overlay" | "header" | "off";

function readJson(path: string): any {
	try { return JSON.parse(readFileSync(path, "utf8")); } catch { return undefined; }
}

function nebulaSettings(cwd: string): { welcome: WelcomeMode } {
	// No extension API for custom settings keys; read the files directly.
	// Project settings win over user settings.
	const user = readJson(join(getAgentDir(), "settings.json"));
	const project = readJson(join(cwd, ".pi/settings.json"));
	const raw = { ...user?.nebula, ...project?.nebula };
	const welcome: WelcomeMode = raw.welcome === "overlay" || raw.welcome === "off" ? raw.welcome : "header";
	return { welcome };
}

// ------------------------------------------------------------------- data --
const safeReaddir = (p: string) => { try { return readdirSync(p).length; } catch { return 0; } };
const safeStat = (p: string) => { try { return statSync(p).mtimeMs; } catch { return Date.now(); } };

function loadedCounts(cwd: string) {
	const agentDir = getAgentDir();
	let packages = 0;
	try {
		const s = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8"));
		packages = Array.isArray(s.packages) ? s.packages.length : 0;
	} catch { /* ignore */ }
	let context = 0;
	for (const f of ["AGENTS.md", "CLAUDE.md", ".pi/AGENTS.md"]) {
		try { statSync(join(cwd, f)); context++; } catch { /* ignore */ }
	}
	return {
		context,
		extensions: packages + safeReaddir(join(agentDir, "extensions")) + safeReaddir(join(cwd, ".pi/extensions")),
		skills: safeReaddir(join(agentDir, "skills")),
		prompts: safeReaddir(join(agentDir, "prompts")),
	};
}

function relTime(ms: number): string {
	const s = Math.max(0, (Date.now() - ms) / 1000);
	if (s < 90) return `${Math.round(s)}s ago`;
	if (s < 5400) return `${Math.round(s / 60)}m ago`;
	if (s < 172800) return `${Math.round(s / 3600)}h ago`;
	return `${Math.round(s / 86400)}d ago`;
}

function sessionLabel(file: string): string {
	try {
		const text = readFileSync(file, "utf8").slice(0, 65536);
		let firstUser = "";
		for (const line of text.split("\n")) {
			if (!line.trim()) continue;
			let e: any;
			try { e = JSON.parse(line); } catch { continue; }
			const named = e?.name ?? e?.title ?? e?.session_info?.name ?? e?.sessionInfo?.name;
			if (typeof named === "string" && named.trim()) return named.trim().slice(0, 22);
			if (!firstUser && e?.type === "message" && e?.message?.role === "user") {
				const c = e.message.content;
				const raw = typeof c === "string" ? c : Array.isArray(c) ? c.map((p: any) => p?.text ?? "").join(" ") : "";
				// A session that opened with a skill invocation starts with a huge
				// <skill name="...">…</skill> block. Drop the whole block (body included),
				// then any other tag, so the label is the user's actual ask.
				const s = raw
					.replace(/<skill\b[^>]*>[\s\S]*?<\/skill>/gi, " ")
					.replace(/<[^>]+>/g, " ")
					.replace(/\s+/g, " ")
					.trim();
				if (s) firstUser = s;
			}
		}
		if (firstUser) return firstUser.slice(0, 22);
	} catch { /* ignore */ }
	return "";
}

type SessionRow = { name: string; ago: string };

async function recentSessions(cwd: string): Promise<SessionRow[]> {
	try {
		if (!SessionManager?.list) return [];
		const list: any[] = await SessionManager.list(cwd);
		return list.slice(0, 3).map((s) => {
			const file: string = s?.file ?? s?.path ?? "";
			const name: string = (() => {
				const direct = s?.name ?? s?.title;
				if (typeof direct === "string" && direct.trim()) return direct.trim().slice(0, 22);
				const mined = file ? sessionLabel(file) : "";
				if (mined) return mined;
				return file ? basename(file).replace(/\.jsonl$/, "").slice(0, 22) : "untitled";
			})();
			const ms: number = s?.mtimeMs ?? s?.mtime ?? (file ? safeStat(file) : Date.now());
			return { name, ago: relTime(ms) };
		});
	} catch {
		return [];
	}
}

// --------------------------------------------------------------- welcome --
function welcomePanel(width: number, counts: ReturnType<typeof loadedCounts>, sessions: SessionRow[], cwd: string): string[] {
	const PANEL_MAX = 100;
	const w = Math.max(60, Math.min(width - INDENT - 2, PANEL_MAX));
	const inner = w - 2;
	const lw = 34;
	const rw = inner - lw - 1;

	const left: string[] = [
		"",
		center(fg(C.key, bold("Ciallo～(∠・ω< )⌒★")), lw),
		"",
		...PI_BANNER.map((b) => center(pad(fg(C.bright, bold(b)), BANNER_W), lw)),
		"",
		center(fg(C.white, "Pi"), lw),
		center(fg(C.muted, `v${VERSION}`), lw),
		"",
		"  " + fg(C.dim, G.heavyH.repeat(lw - 4)),
		"",
		"  " + fg(C.muted, "A minimal terminal"),
		"  " + fg(C.muted, "coding harness."),
		"",
		"  " + fg(C.dim, basename(cwd)),
	];

	const right: string[] = [];
	const rule = "  " + fg(C.dim, G.heavyH.repeat(rw - 4));
	const head = (icon: string, title: string, color: string) => right.push("  " + fg(color, icon + " ") + fg(color, bold(title)));
	const chip = (k: string) => fg(C.dim, "[") + fg(C.text, pad(" " + k + " ", 11)) + fg(C.dim, "]");

	head(G.bulb, "Tips", C.warn);
	for (const [k, v] of [["/", "Open command palette"], ["!", "Run bash command"], ["Shift+Tab", "Cycle thinking level"], ["Ctrl+L", "Clear screen"], ["Ctrl+C", "Interrupt current task"]]) {
		right.push("    " + chip(k) + "  " + fg(C.muted, v));
	}
	right.push(rule);
	head(G.cube, "Loaded", C.ok);
	for (const [n, label] of [[counts.context, "context files"], [counts.extensions, "extensions"], [counts.skills, "skills"], [counts.prompts, "prompt templates"]] as [number, string][]) {
		right.push("    " + fg(C.ok, G.ok + " ") + fg(C.ok, padL(String(n), 3)) + "  " + fg(C.text, label));
	}
	right.push(rule);
	head(G.clock, "Recent sessions", C.accent);
	if (sessions.length === 0) right.push("    " + fg(C.dim, "(none found)"));
	for (const s of sessions) right.push("    " + fg(C.accent, G.bullet + " ") + lr(fg(C.text, s.name), fg(C.dim, s.ago), rw - 8));

	const h = Math.max(left.length, right.length);
	const out: string[] = [bg(C.panel, fg(C.dim, "┌" + "─".repeat(inner) + "┐"))];
	for (let i = 0; i < h; i++) {
		out.push(bg(C.panel, fg(C.dim, "│") + fit(left[i] ?? "", lw) + fg(C.dim, G.heavyV) + fit(right[i] ?? "", rw) + fg(C.dim, "│")));
	}
	out.push(bg(C.panel, fg(C.dim, "└" + "─".repeat(inner) + "┘")));
	return out;
}

// Welcome overlay: centered floating modal, dismissed by any key (per
// CONTEXT.md — 启动面板的反面：居中、一次性、按键即消失). Fire-and-forget: the
// session keeps loading while the overlay floats; the first keypress anywhere
// closes it and hands input back to the editor.
function showWelcomeOverlay(ctx: any, counts: ReturnType<typeof loadedCounts>, sessions: SessionRow[]) {
	try {
		void ctx.ui.custom(
			(_tui: any, _theme: any, _kb: any, done: (v: boolean) => void) => {
				let closed = false;
				const close = () => { if (!closed) { closed = true; done(true); } };
				return {
					render: (width: number) => welcomePanel(width, counts, sessions, ctx.cwd),
					invalidate() {},
					handleInput(data: string) { if (data) close(); },
				};
			},
			{ overlay: true, overlayOptions: { anchor: "center" } },
		);
	} catch (e) {
		console.debug("[pi-nebula] welcome overlay failed:", e);
	}
}

// ------------------------------------------------------------ status bar --
// footerData is only handed to the footer factory; we capture it there so the
// above-editor status widget can read the git branch too.
let cachedFooterData: any = null;

// The design reads "think:med"; pi's level names are longer, so abbreviate the
// two that overflow. ctx.thinkingLevel is the live value (docs/extensions.md:1015).
const THINK_ABBR: Record<string, string> = { minimal: "min", medium: "med", xhigh: "xhi" };
const thinkLabel = (level: string) => `think:${THINK_ABBR[level] ?? level}`;

function statusBar(width: number, ctx: any, footerData: any): string {
	const w = Math.max(40, width - INDENT - 2);
	const ind = " ".repeat(INDENT);
	const sep = fg(C.dim, " │ ");
	// Design shows vendor + model ("OpenAI GPT-5.5"). ctx.model exposes
	// provider (id, e.g. "r4coder") and name (display name from models.json).
	const provider = ctx.model?.provider ?? "";
	const modelName = ctx.model?.name ?? ctx.model?.id ?? "no-model";
	const left = [
		(provider ? fg(C.muted, provider) + " " : "") + fg(C.accent, bold(modelName)),
		fg(C.muted, thinkLabel(ctx.thinkingLevel ?? "off")),
		fg(C.info, (ctx.cwd ?? "").replace(homedir(), "~")),
		fg(C.ok, G.branch + " " + (footerData?.getGitBranch?.() ?? "—")),
	].join(sep);
	const now = new Date();
	const right = [fg(C.muted, `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`)].join(sep);
	return ind + fit(lr(left, right, w), w);
}

// ----------------------------------------------------------- metrics bar --
function metricsBar(width: number, ctx: any): string {
	const w = Math.max(40, width - INDENT - 2);
	let input = 0, output = 0, cost = 0, cacheRead = 0;
	for (const e of ctx.sessionManager.getBranch()) {
		if (e.type === "message" && e.message?.role === "assistant") {
			const u = e.message.usage;
			if (!u) continue;
			input += u.input ?? 0;
			output += u.output ?? 0;
			cacheRead += u.cacheRead ?? 0;
			cost += u.cost?.total ?? 0;
		}
	}
	const fmt = (n: number) => (n < 1000 ? `${n}` : n < 1e6 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1e6).toFixed(1)}M`);
	const usage = ctx.getContextUsage?.();
	const ctxStr = usage?.tokens != null ? `${fmt(usage.tokens)}/${fmt(usage.contextWindow)}` : "—";
	const hit = input + cacheRead > 0 ? `${Math.round((cacheRead / (input + cacheRead)) * 100)}%` : "—";
	const parts = [
		fg(C.info, "↑ ") + fg(C.text, fmt(input)) + " " + fg(C.dim, "input"),
		fg(C.info, "↓ ") + fg(C.text, fmt(output)) + " " + fg(C.dim, "output"),
		fg(C.text, ctxStr) + " " + fg(C.dim, `ctx ${usage?.percent != null ? Math.round(usage.percent) + "%" : ""}`),
		fg(C.text, hit) + " " + fg(C.dim, "cache"),
		fg(C.text, `$${cost.toFixed(3)}`) + " " + fg(C.dim, "cost"),
	];
	return " ".repeat(INDENT) + fit(parts.join(fg(C.dim, " │ ")), w);
}

// ---------------------------------------------------------- editor shell --
// Extend CustomEditor — pi's own default editor — rather than wrapping whatever
// getEditorComponent() returns. That API only exposes a *previously installed
// custom* editor, so it is undefined by default and the shell silently no-ops.
// Canonical pattern: examples/extensions/border-status-editor.ts.
//
// We do NOT draw our own frame: CustomEditor already renders pi's bordered box.
// We only apply INDENT so it lines up with the status/metrics bars.
// Shifting rendered lines is cursor-safe: pi positions the hardware cursor by
// scanning the output for CURSOR_MARKER, a zero-width APC sequence that lives
// inside the line text, so it travels with the indent — but never truncate,
// an over-wide line would clip the marker.
const CustomEditor: any = (piPkg as any).CustomEditor;
const EDITOR_PAD = INDENT;

const NebulaEditor: any = typeof CustomEditor === "function"
	? class extends CustomEditor {
		render(width: number): string[] {
			// Render at the inset width, then shift right.
			const w = Math.max(40, width - EDITOR_PAD - 2);
			const ind = " ".repeat(EDITOR_PAD);
			return (super.render(w) as string[]).map((line) => ind + line);
		}
	}
	: null;

// --------------------------------------------------------------- tool rows --
// A Component is just { render(width), invalidate() } — so the row lays itself
// out against the real width pi hands us. renderCall/renderResult REPLACE pi's
// built-in tool-box content entirely (tool-execution.ts).
//
// renderShell: "self" — we draw our own framing because the design has no box
// or background. In self-shell mode ToolExecutionComponent stacks our call
// component then our result component into a bare Container and emits one blank
// line above the row. It also re-runs renderCall whenever the row updates, so
// the call line picks up the final duration once the result lands.
//
// Layout (per design稿):
//   ● Read  [./README.md • lines 1–120]           42ms
//     └ Read 120 lines
//         <raw output, only when the row is expanded>
const rowComponent = (make: (w: number) => string[]) => ({ render: (w: number) => make(w), invalidate() {} });

const toolDisplayName = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

// Compact, human-readable args per tool (design: "● 名字 [a • b]"). Returned as
// plain-text parts; the row joins them with a dim " • " and wraps in brackets.
// Raw JSON.stringify is unreadable for multi-field tools like edit.
function argParts(name: string, args: any): string[] {
	if (!args) return [];
	const s = (v: any) => (v == null ? "" : String(v));
	switch (name) {
		case "bash": return [s(args.command).split("\n")[0].trim()];
		case "write": return [s(args.path)];
		case "ls": return [s(args.path) || "."];
		case "read": {
			const parts = args.path ? [s(args.path)] : [];
			if (args.offset !== undefined || args.limit !== undefined) {
				const start = args.offset ?? 1;
				const end = args.limit !== undefined ? start + args.limit - 1 : undefined;
				parts.push(`lines ${start}${end !== undefined ? `–${end}` : "+"}`);
			}
			return parts;
		}
		case "edit": {
			const n = Array.isArray(args.edits) ? args.edits.length : args.oldText ? 1 : 0;
			return [s(args.path), `${n} change${n === 1 ? "" : "s"}`];
		}
		case "grep": {
			const parts = [`"${s(args.pattern)}"`];
			if (args.path) parts.push(s(args.path));
			if (args.glob) parts.push(s(args.glob));
			return parts;
		}
		case "find": {
			const parts = [s(args.pattern)];
			if (args.path) parts.push(s(args.path));
			return parts;
		}
		default: return [JSON.stringify(args).slice(0, 70)];
	}
}

function bracketize(parts: string[]): string {
	if (parts.length === 0) return "";
	const body = parts.map((p) => fg(C.text, p)).join(fg(C.dim, " • "));
	return "  " + fg(C.dim, "[") + body + fg(C.dim, "]");
}

// 42ms / 2.3s / 1m 5s — matches the design's right-aligned duration.
function fmtDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	const sec = ms / 1000;
	if (sec < 60) return `${sec.toFixed(1)}s`;
	return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
}

// Tool call row — ● Name  [arg • arg]  <right>ms (✗ + accent on error). No rail.
function toolCallRow(width: number, name: string, args: any, ms: number | null, isError: boolean): string {
	const w = Math.max(40, width);
	const color = isError ? C.accent : C.ok;
	const mark = isError ? G.bad : G.dot;
	const left = fg(color, mark + " ") + fg(color, bold(toolDisplayName(name))) + bracketize(argParts(name, args));
	const right = ms != null ? fg(C.dim, fmtDuration(ms)) : "";
	return fit(lr(left, right, w), w);
}

// Text content of a tool result (text blocks only; pi renders images itself).
function resultText(result: any): string {
	if (!Array.isArray(result?.content)) return "";
	return result.content
		.filter((c: any) => c?.type === "text" && typeof c.text === "string")
		.map((c: any) => c.text)
		.join("\n");
}

const hasImage = (result: any) => Array.isArray(result?.content) && result.content.some((c: any) => c?.type === "image");
// Drop the trailing "[...]" continuation notice pi appends, so counts are clean.
const stripNotices = (s: string) => s.replace(/\n\n\[[\s\S]*\]\s*$/, "").trim();
const countLines = (s: string) => { const t = s.replace(/\n+$/, ""); return t.trim() === "" ? 0 : t.split("\n").length; };

function diffStats(diff: string): { add: number; del: number } {
	let add = 0, del = 0;
	for (const line of diff.split("\n")) {
		if (line.startsWith("+") && !line.startsWith("+++")) add++;
		else if (line.startsWith("-") && !line.startsWith("---")) del++;
	}
	return { add, del };
}

function errorLine(result: any): string {
	const raw = String(result?.details?.error ?? resultText(result)).trim();
	return raw.split("\n")[0] ?? "";
}

// One-line human summary for the "└" subline — the design's hand-picked
// summaries, reconstructed from each tool's real result/details.
function resultSummary(name: string, args: any, result: any, isError: boolean): string {
	if (isError) return fg(C.accent, errorLine(result) || "error");
	const text = resultText(result);
	switch (name) {
		case "read": {
			if (hasImage(result)) return fg(C.ok, "Image loaded");
			const n = countLines(stripNotices(text));
			return fg(C.muted, `Read ${n} line${n === 1 ? "" : "s"}`);
		}
		case "write": {
			const n = args?.content ? String(args.content).replace(/\n+$/, "").split("\n").length : 0;
			return fg(C.muted, `Wrote ${n} line${n === 1 ? "" : "s"}`);
		}
		case "edit": {
			const d = result?.details?.diff;
			if (typeof d !== "string" || !d) return fg(C.muted, "Updated");
			const { add, del } = diffStats(d);
			return fg(C.muted, "Updated • ") + fg(C.ok, `+${add}`) + " " + fg(C.accent, `−${del}`);
		}
		case "grep": {
			if (/no matches/i.test(text)) return fg(C.muted, "No matches");
			const n = countLines(text);
			return fg(C.muted, `Found ${n} match${n === 1 ? "" : "es"}`);
		}
		case "find": {
			if (/no files found/i.test(text)) return fg(C.muted, "No files");
			const n = countLines(text);
			return fg(C.muted, `Found ${n} file${n === 1 ? "" : "s"}`);
		}
		case "ls": {
			if (/empty directory/i.test(text)) return fg(C.muted, "Empty");
			const n = countLines(text);
			return fg(C.muted, `Listed ${n} entr${n === 1 ? "y" : "ies"}`);
		}
		case "bash": {
			const n = text ? countLines(stripNotices(text)) : 0;
			return fg(C.muted, "Done") + (n ? fg(C.dim, ` • ${n} line${n === 1 ? "" : "s"}`) : "");
		}
		default: return fg(C.muted, (text.split("\n")[0] ?? "").slice(0, 80));
	}
}

const RESULT_INDENT = "  ";    // puts └ under the ●
const OUTPUT_INDENT = "    ";

// Tool result — "└ summary" plus, when expanded, the raw output lines indented
// below (read/write get line numbers; other tools stay plain).
function toolResultRow(width: number, name: string, args: any, result: any, isPartial: boolean, expanded: boolean, isError: boolean): string[] {
	const w = Math.max(40, width);
	const head = RESULT_INDENT + fg(C.dim, G.tree + " ");
	if (isPartial) return [truncateToWidth(head + fg(C.dim, "…"), w, "")];

	const lines: string[] = [truncateToWidth(head + resultSummary(name, args, result, isError), w, "")];
	if (!expanded || isError) return lines;

	const raw = resultText(result).replace(/\n+$/, "").split("\n");
	if (raw.length === 0 || (raw.length === 1 && raw[0] === "")) return lines;
	const numbered = name === "read" || name === "write";
	const numW = String(raw.length).length;
	raw.forEach((l, i) => {
		const num = numbered ? fg(C.dim, String(i + 1).padStart(numW) + "  ") : "";
		lines.push(truncateToWidth(OUTPUT_INDENT + num + fg(C.muted, l), w, ""));
	});
	return lines;
}

function registerToolRows(pi: ExtensionAPI, cwd: string) {
	const names: [string, string][] = [
		["read", "createReadToolDefinition"], ["write", "createWriteToolDefinition"], ["edit", "createEditToolDefinition"],
		["grep", "createGrepToolDefinition"], ["find", "createFindToolDefinition"], ["ls", "createLsToolDefinition"],
		["bash", "createBashToolDefinition"],
	];
	for (const [name, factoryName] of names) {
		try {
			const make = (piPkg as any)[factoryName];
			if (typeof make !== "function") {
				console.debug(`[pi-nebula] ${factoryName} not exported; skipping ${name}`);
				continue;
			}
			const def = make(cwd);
			pi.registerTool({
				name,
				label: (def as any).label ?? name,
				description: (def as any).description,
				parameters: (def as any).parameters,
				...(def as any).promptSnippet ? { promptSnippet: (def as any).promptSnippet } : {},
				...(def as any).promptGuidelines ? { promptGuidelines: (def as any).promptGuidelines } : {},
				...(def as any).prepareArguments ? { prepareArguments: (def as any).prepareArguments } : {},
				...(def as any).executionMode ? { executionMode: (def as any).executionMode } : {},
				// Preserve the built-in's structured-output preference — registerTool
				// replaces the definition entirely, so an omitted field is dropped.
				...(def as any).constrainedSampling ? { constrainedSampling: (def as any).constrainedSampling } : {},
				// Draw our own framing (no Box/background). Self-shell rows get one blank
				// line above them from ToolExecutionComponent, which matches the design gap.
				renderShell: "self",
				async execute(...a: any[]) { return (def as any).execute(...a); },
				renderCall(args: any, _theme: any, context: any) {
					// t0 is captured once; endedAt freezes the duration on the first
					// non-partial render so the row does not keep counting after it settles.
					const state = context.state;
					if (context.executionStarted && state.t0 === undefined) state.t0 = Date.now();
					if (!context.isPartial && state.t0 !== undefined && state.endedAt === undefined) state.endedAt = Date.now();
					const ms = state.t0 !== undefined ? (state.endedAt ?? Date.now()) - state.t0 : null;
					return rowComponent((w) => [toolCallRow(w, name, args, ms, !!context.isError)]);
				},
				renderResult(result: any, opts: any, _theme: any, context: any) {
					return rowComponent((w) =>
						toolResultRow(w, name, context.args, result, !!opts?.isPartial, !!opts?.expanded, !!context.isError),
					);
				},
			} as any);
		} catch (e) {
			console.debug(`[pi-nebula] tool override failed for ${name}:`, e);
		}
	}
}

// ---------------------------------------------------------- user messages --
// pi renders built-in messages itself — UserMessageComponent is a Box filled
// with userMessageBg wrapping Markdown colored by userMessageText, and there is
// no render hook for it. The one lever is registerMarkdownTransformer, which
// runs on messageType "user" too (UserMessageComponent feeds registered
// transformers into its Markdown). We use it to prepend the design's "❯ " mark.
// Guard: skip when the first line is block-level markdown (fence / heading /
// quote / list / table / HTML), so the prefix can never demote it to a paragraph.
function markUserMessage(markdown: string): string {
	const lines = markdown.split("\n");
	const i = lines.findIndex((l) => l.trim() !== "");
	if (i === -1) return markdown;
	if (/^\s*(```|~~~|#{1,6}\s|>|[-*+]\s|\d+[.)]\s|\||<)/.test(lines[i])) return markdown;
	if (lines[i].startsWith("❯ ")) return markdown;
	lines[i] = "❯ " + lines[i];
	return lines.join("\n");
}

// ================================================================= entry ===
export default function (pi: ExtensionAPI) {
	// Live handle on the status widget's TUI, so a thinking-level change repaints
	// the status bar without re-installing the whole chrome.
	let statusTui: any = null;
	let stopWatching: (() => void) | undefined;

	// Registered at load time (not per session_start) so repeated session
	// replacement cannot stack duplicate handlers.
	pi.on("thinking_level_select", () => { statusTui?.requestRender(); });
	pi.on("session_shutdown", () => { stopWatching?.(); stopWatching = undefined; });

	// "❯ " marker on user messages (see markUserMessage). Display-only.
	try {
		(pi as any).registerMarkdownTransformer?.((markdown: string, tctx: any) =>
			tctx?.messageType === "user" && !tctx?.isStreaming ? markUserMessage(markdown) : markdown,
		);
	} catch (e) { console.debug("[pi-nebula] registerMarkdownTransformer failed:", e); }

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		const install = async () => {
			const settings = nebulaSettings(ctx.cwd);
			const counts = loadedCounts(ctx.cwd);
			const sessions = await recentSessions(ctx.cwd);

			// Welcome panel: persistent header (default) / one-shot overlay / off.
			try {
				if (settings.welcome === "header") {
					ctx.ui.setHeader((_tui: any, _theme: any) => ({
						render: (width: number) => welcomePanel(width, counts, sessions, ctx.cwd),
						invalidate() {},
					}));
				} else {
					// Clear a header left behind by a previous mode, then optionally
					// float the one-shot overlay instead.
					ctx.ui.setHeader(undefined);
					if (settings.welcome === "overlay") showWelcomeOverlay(ctx, counts, sessions);
				}
			} catch (e) { console.debug("[pi-nebula] setHeader failed:", e); }

			// Design order, top → bottom: STATUS BAR · editor · METRICS BAR.
			// setFooter always renders below the editor, so the status bar has to be
			// an above-editor widget (setWidget's default placement).
			try {
				ctx.ui.setWidget("nebula-status", (tui: any) => {
					statusTui = tui;
					return {
						invalidate() { tui.requestRender(); },
						render: (width: number) => [statusBar(width, ctx, cachedFooterData)],
					};
				});
			} catch (e) { console.debug("[pi-nebula] setWidget(status) failed:", e); }

			// Blank the built-in bottom footer — the design's last line is the metrics
			// bar. We still call setFooter to capture footerData + branch changes.
			try {
				ctx.ui.setFooter((tui: any, _theme: any, footerData: any) => {
					cachedFooterData = footerData;
					return {
						dispose: footerData.onBranchChange(() => tui.requestRender()),
						invalidate() {},
						render: () => [],
					};
				});
			} catch (e) { console.debug("[pi-nebula] setFooter failed:", e); }

			try {
				ctx.ui.setWidget("nebula-metrics", (tui: any) => ({
					invalidate() { tui.requestRender(); },
					render: (width: number) => [metricsBar(width, ctx)],
				}), { placement: "belowEditor" });
			} catch (e) { console.debug("[pi-nebula] setWidget(metrics) failed:", e); }

			try {
				if (NebulaEditor) {
					ctx.ui.setEditorComponent((tui: any, theme: any, kb: any) => new NebulaEditor(tui, theme, kb));
				} else {
					console.debug("[pi-nebula] CustomEditor unavailable; skipping editor shell");
				}
			} catch (e) { console.debug("[pi-nebula] setEditorComponent failed:", e); }

		};

		// Tool rows are registered once per session: re-registering the same seven
		// names on every settings change is pointless and noisy.
		try { registerToolRows(pi, ctx.cwd); } catch (e) { console.debug("[pi-nebula] tool rows failed:", e); }

		await install();

		// Re-read settings / refresh data when settings.json changes on disk
		// (e.g. after a home-manager switch mid-session). Re-installing chrome is
		// cheap (all setters are idempotent) and picks up nebula.welcome changes.
		// Watch settings.json so a home-manager switch mid-session re-applies the
		// chrome. Closed on session_shutdown — which also fires for reload / new /
		// fork / quit (docs/extensions.md:516) — and the re-install is guarded: a
		// watcher that outlives its ctx hits "This extension ctx is stale after
		// session replacement or reload" and surfaces as an unhandled rejection.
		try {
			let timer: any;
			let disposed = false;
			const w = watch(join(getAgentDir(), "settings.json"), () => {
				clearTimeout(timer);
				timer = setTimeout(() => {
					if (!disposed) void install().catch((e) => console.debug("[pi-nebula] re-install failed:", e));
				}, 500);
			});
			stopWatching = () => { disposed = true; clearTimeout(timer); w.close(); };
		} catch { /* best effort */ }
	});

	pi.registerCommand("nebula-off", {
		description: "Restore pi's built-in header/footer/widget/editor",
		handler: async (_args, ctx) => {
			ctx.ui.setHeader(undefined);
			ctx.ui.setFooter(undefined);
			ctx.ui.setWidget("nebula-status", undefined);
			ctx.ui.setWidget("nebula-metrics", undefined);
			ctx.ui.setEditorComponent(undefined);
			ctx.ui.notify("pi-nebula disabled for this session", "info");
		},
	});
}

