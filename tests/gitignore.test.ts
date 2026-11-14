import { describe, expect, it } from "vitest";

import { makeGitignoreMatcher } from "../src/patterns/gitignore.js";

/**
 * The .gitignore of an analyzed project is attacker-controlled text. Until
 * 2026-11-14 each line became a regular expression: `*a*a*a*a*a*a*a*a*b`
 * backtracked for minutes on one path, and `[z-a]` threw and failed the scan
 * (security review). The matcher now walks the path once per token.
 */

describe("gitignore matcher", () => {
  it("keeps the usual semantics", () => {
    const m = makeGitignoreMatcher("node_modules/\n/dist\n*.log\nsecrets/**/*.pem\ndocs/**\n.env*\n!keep.log\n# comment\nbuild/\n[Tt]emp\nfile?.txt\n");
    expect(m("node_modules/")).toBe(true);
    expect(m("a/node_modules/x.js")).toBe(true);
    expect(m("dist")).toBe(true);
    expect(m("dist/app.js")).toBe(true);
    expect(m("src/dist/app.js")).toBe(false);
    expect(m("logs/out.log")).toBe(true);
    expect(m("secrets/a/b/key.pem")).toBe(true);
    expect(m("secrets/key.pem")).toBe(true);
    expect(m("docs/a/b.md")).toBe(true);
    expect(m(".env.local")).toBe(true);
    expect(m("build/")).toBe(true);
    expect(m("build")).toBe(false); // a file named build: the pattern is directory-only
    expect(m("Temp")).toBe(true);
    expect(m("temp/x")).toBe(true);
    expect(m("file1.txt")).toBe(true);
    expect(m("file12.txt")).toBe(false);
    expect(m("src/index.ts")).toBe(false);
    expect(makeGitignoreMatcher(null)("anything")).toBe(false);
  });

  it("never throws on malformed classes; a reversed range matches nothing", () => {
    const m = makeGitignoreMatcher("[z-a]\n[\n[]\n[!a-c]x\n\\*literal\n");
    expect(m("q")).toBe(false);
    expect(m("dx")).toBe(true);
    expect(m("ax")).toBe(false);
    expect(m("*literal")).toBe(true);
    expect(m("xliteral")).toBe(false);
  });

  it("stays linear on adversarial patterns and long paths", () => {
    const evil = ["*a*a*a*a*a*a*a*a*a*a*a*a*b", "**/**/**/**/**/**/**/**/x", `${"?*".repeat(400)}z`, `${"[a-z]*".repeat(150)}!`, "*".repeat(900)].join("\n");
    const m = makeGitignoreMatcher(`${evil}\n${"x".repeat(2000)}\n`);
    const paths = [`dist/${"a".repeat(255)}`, `${"a/".repeat(200)}${"a".repeat(255)}`, "a".repeat(4000)];
    const start = performance.now();
    for (const p of paths) m(p);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

describe("sanitize (terminal and report text)", () => {
  it("removes bidirectional overrides and isolates, so text reads as what it is", async () => {
    const { sanitize } = await import("../src/report/text.js");
    const rlo = String.fromCharCode(0x202e);
    const lri = String.fromCharCode(0x2066);
    const pdi = String.fromCharCode(0x2069);
    expect(sanitize(`safe${rlo}gnp.exe`)).toBe("safegnp.exe");
    expect(sanitize(`a${lri}b${pdi}c`)).toBe("abc");
    expect(sanitize("plain ascii")).toBe("plain ascii");
  });
});
