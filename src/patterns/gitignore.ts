/**
 * Minimal .gitignore matcher: enough to answer "does the root .gitignore cover
 * this path?" for the common patterns found in JavaScript projects.
 *
 * Supported: blank lines and comments, `name`, `name/` (directory only),
 * `/anchored`, `dir/sub`, `*`, `?`, `**`, and `[abc]` classes.
 * Not supported (documented limitation): negation (`!pattern`) is ignored,
 * nested .gitignore files are not read, and `**` edge cases follow a simple
 * interpretation. The matcher only ever reads text; it never runs git.
 */

type Token =
  | { kind: "lit"; ch: string }
  | { kind: "one" }
  | { kind: "star" }
  | { kind: "globstar" }
  | { kind: "dirs" }
  | { kind: "class"; negate: boolean; items: { from: string; to: string }[] };

interface CompiledPattern {
  tokens: Token[];
  anchored: boolean;
  dirOnly: boolean;
}

/** Lines longer than this are skipped: no real .gitignore needs them, and they bound the work per path. */
const MAX_PATTERN = 1000;
const MAX_PATTERNS = 2000;

function parseClass(body: string): Token {
  let rest = body;
  const negate = rest.startsWith("!") || rest.startsWith("^");
  if (negate) rest = rest.slice(1);
  const items: { from: string; to: string }[] = [];
  for (let i = 0; i < rest.length; i++) {
    let from = rest[i] ?? "";
    if (from === "\\" && i + 1 < rest.length) from = rest[++i] ?? "";
    if (rest[i + 1] === "-" && i + 2 < rest.length) {
      let to = rest[i + 2] ?? "";
      i += 2;
      if (to === "\\" && i + 1 < rest.length) to = rest[++i] ?? "";
      // A reversed range ([z-a]) matches nothing, as in git; it never throws.
      if (from <= to) items.push({ from, to });
    } else {
      items.push({ from, to: from });
    }
  }
  return { kind: "class", negate, items };
}

function tokenize(glob: string): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i] ?? "";
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        // `**/` matches zero or more directories; any other `**` matches anything.
        if (glob[i + 2] === "/") {
          out.push({ kind: "dirs" });
          i += 2;
        } else {
          out.push({ kind: "globstar" });
          i += 1;
          while (glob[i + 1] === "*") i += 1;
        }
      } else {
        // Consecutive stars are one star: `a**b` is not special in git outside a whole segment, and this keeps the token count small.
        if (out.at(-1)?.kind !== "star") out.push({ kind: "star" });
      }
    } else if (ch === "?") {
      out.push({ kind: "one" });
    } else if (ch === "[") {
      const end = glob.indexOf("]", i + 2);
      if (end === -1) {
        out.push({ kind: "lit", ch: "[" });
      } else {
        out.push(parseClass(glob.slice(i + 1, end)));
        i = end;
      }
    } else if (ch === "\\" && i + 1 < glob.length) {
      out.push({ kind: "lit", ch: glob[++i] ?? "" });
    } else {
      out.push({ kind: "lit", ch });
    }
  }
  return out;
}

export function compileGitignore(text: string): CompiledPattern[] {
  const patterns: CompiledPattern[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (patterns.length >= MAX_PATTERNS) break;
    const line = rawLine.replace(/\s+$/, "");
    if (line === "" || line.length > MAX_PATTERN || line.startsWith("#") || line.startsWith("!")) continue;

    let pattern = line;
    let dirOnly = false;
    if (pattern.endsWith("/")) {
      dirOnly = true;
      pattern = pattern.slice(0, -1);
    }
    const anchored = pattern.startsWith("/") || pattern.slice(0, -1).includes("/");
    if (pattern.startsWith("/")) pattern = pattern.slice(1);
    if (pattern === "") continue;
    patterns.push({ tokens: tokenize(pattern), anchored, dirOnly });
  }
  return patterns;
}

function inClass(t: Extract<Token, { kind: "class" }>, c: string): boolean {
  const hit = t.items.some((r) => c >= r.from && c <= r.to);
  return t.negate ? !hit : hit;
}

/**
 * Positions where the pattern can end when it starts at `start`: one pass per
 * token over the path, so the cost is (tokens x path length) whatever the
 * pattern looks like. A regular expression built from an analyzed project's
 * .gitignore could backtrack for minutes (security review 2026-11-14).
 */
function ends(tokens: Token[], s: string, start: number): boolean[] {
  const n = s.length;
  let cur = new Array<boolean>(n + 1).fill(false);
  cur[start] = true;
  for (const t of tokens) {
    const next = new Array<boolean>(n + 1).fill(false);
    let any = false;
    if (t.kind === "star") {
      let run = false;
      for (let j = 0; j <= n; j++) {
        if (cur[j]) run = true;
        if (run) next[j] = any = true;
        if (s[j] === "/") run = false;
      }
    } else if (t.kind === "globstar") {
      let run = false;
      for (let j = 0; j <= n; j++) {
        if (cur[j]) run = true;
        if (run) next[j] = any = true;
      }
    } else if (t.kind === "dirs") {
      let run = false;
      for (let j = 0; j <= n; j++) {
        if (cur[j] || (run && s[j - 1] === "/")) next[j] = any = true;
        if (cur[j]) run = true;
      }
    } else {
      for (let j = 0; j < n; j++) {
        if (!cur[j]) continue;
        const c = s[j] ?? "";
        const ok = t.kind === "lit" ? c === t.ch : c !== "/" && (t.kind === "one" || inClass(t, c));
        if (ok) next[j + 1] = any = true;
      }
    }
    if (!any) return next;
    cur = next;
  }
  return cur;
}

function matches(p: CompiledPattern, s: string): boolean {
  const starts = [0];
  // Unanchored patterns match at any depth.
  if (!p.anchored) for (let i = 0; i < s.length; i++) if (s[i] === "/") starts.push(i + 1);
  for (const start of starts) {
    const e = ends(p.tokens, s, start);
    for (let j = start; j <= s.length; j++) {
      if (!e[j]) continue;
      // The pattern covers the whole path, or a directory above it (everything underneath a matched directory is ignored).
      // A directory-only pattern must stop at a "/": the path is that directory ("dir/") or something inside it.
      if (s[j] === "/" || (j === s.length && !p.dirOnly)) return true;
    }
  }
  return false;
}

export function makeGitignoreMatcher(text: string | null): (relPath: string) => boolean {
  if (text === null) return () => false;
  const patterns = compileGitignore(text);
  return (relPath: string): boolean => {
    const p = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
    return patterns.some((pattern) => matches(pattern, p));
  };
}
