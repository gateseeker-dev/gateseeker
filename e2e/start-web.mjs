/* global process, Buffer, URL */
// Starts the public page's local server against a stub GitHub and a stub OSV,
// so the browser tests never reach the network. The stub serves:
//   GET  /repos/acme/vibe                  -> a public repository record
//   GET  /repos/acme/vibe/commits/<ref>    -> a fixed commit sha
//   GET  /acme/vibe/tar.gz/<sha>           -> fixtures/projects/vibe-next-supabase as a tarball
//   GET  /repos/acme/private               -> 404 (private or missing)
//   GET  /repos/acme/huge                  -> a repository over the size limit
//   GET  /repos/acme/secret                -> 404 without the installation token, a private record with it (Sprint 8)
//   GET  /repos/acme/secret/tarball/<sha>  -> the vibe fixture, with the installation token only
//   GET  /apps/gateseeker-e2e/installations/new?state= -> GitHub's install screen: sends the browser straight back to the site
//   GET  /app/installations/77, POST .../access_tokens, GET /installation/repositories -> the App's endpoints for installation 77 (account "acme")
//   POST /v1/query                         -> OSV: no vulnerabilities
// Any other owner/repo answers 404.
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const FIXTURE = join(ROOT, "fixtures", "projects", "vibe-next-supabase");
const SHA = "0123456789abcdef0123456789abcdef01234567";
// A later commit on the "fixed" branch: the clean fixture, so a comparison shows the vibe findings as fixed.
const FIXED = join(ROOT, "fixtures", "projects", "clean-vite");
const SHA_FIXED = "fedcba9876543210fedcba9876543210fedcba98";

function header(name, size, type) {
  const h = Buffer.alloc(512, 0);
  h.write(name.slice(0, 100), 0, "utf8");
  h.write("0000644\0", 100, "ascii");
  h.write("0000000\0", 108, "ascii");
  h.write("0000000\0", 116, "ascii");
  h.write(size.toString(8).padStart(11, "0") + "\0", 124, "ascii");
  h.write("00000000000\0", 136, "ascii");
  h.write("        ", 148, "ascii");
  h.write(type, 156, "ascii");
  h.write("ustar\0", 257, "ascii");
  h.write("00", 263, "ascii");
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
  return h;
}

function tarDirectory(dir, prefix) {
  const parts = [];
  const walk = (d) => {
    for (const entry of readdirSync(d).sort()) {
      const full = join(d, entry);
      const rel = `${prefix}/${relative(dir, full).replace(/\\/g, "/")}`;
      const st = statSync(full);
      if (st.isDirectory()) {
        parts.push(header(`${rel}/`, 0, "5"));
        walk(full);
      } else if (st.isFile()) {
        const data = readFileSync(full);
        parts.push(header(rel, data.length, "0"), data);
        const pad = (512 - (data.length % 512)) % 512;
        if (pad) parts.push(Buffer.alloc(pad, 0));
      }
    }
  };
  parts.push(header(`${prefix}/`, 0, "5"));
  walk(dir);
  parts.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(parts));
}

const archive = tarDirectory(FIXTURE, `vibe-${SHA.slice(0, 7)}`);
const archiveFixed = tarDirectory(FIXED, `vibe-${SHA_FIXED.slice(0, 7)}`);

// The GitHub App of the browser tests: a key generated for this run; the stub does not verify the JWT, only its presence.
const APP_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const INSTALLATION_TOKEN = "ghs_e2einstallationtoken0123456789abcdef";
const SITE = "http://127.0.0.1:4321";

const stub = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://stub");
  const json = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "POST" && url.pathname === "/v1/query") return json(200, { vulns: [] });
  // --- the GitHub App (Sprint 8) ---
  const auth = req.headers.authorization ?? "";
  if (url.pathname === "/apps/gateseeker-e2e/installations/new") {
    // GitHub's install screen, reduced to its outcome: the person picked repositories and is sent back with the installation.
    res.writeHead(302, { location: `${SITE}/app/github/setup?installation_id=77&state=${encodeURIComponent(url.searchParams.get("state") ?? "")}` });
    return res.end();
  }
  if (url.pathname === "/app/installations/77") return auth.startsWith("Bearer ey") ? json(200, { id: 77, account: { login: "acme", type: "Organization" } }) : json(401, { message: "Bad credentials" });
  if (url.pathname === "/app/installations/77/access_tokens" && req.method === "POST") return auth.startsWith("Bearer ey") ? json(201, { token: INSTALLATION_TOKEN, expires_at: "2099-01-01T00:00:00Z" }) : json(401, { message: "Bad credentials" });
  if (url.pathname === "/installation/repositories") return json(200, { total_count: 1, repositories: [{ full_name: "acme/secret" }] });
  const withToken = auth === `Bearer ${INSTALLATION_TOKEN}`;
  if (url.pathname === "/repos/acme/secret") return withToken ? json(200, { full_name: "acme/secret", private: true, size: 300, default_branch: "main", html_url: "https://github.com/acme/secret" }) : json(404, { message: "Not Found" });
  if (url.pathname.startsWith("/repos/acme/secret/commits/")) return withToken ? json(200, { sha: SHA }) : json(404, { message: "Not Found" });
  if (url.pathname === `/repos/acme/secret/tarball/${SHA}`) {
    if (!withToken) return json(404, { message: "Not Found" });
    res.writeHead(200, { "content-type": "application/x-gzip", "content-length": archive.length });
    return res.end(archive);
  }
  if (url.pathname === "/repos/acme/vibe") return json(200, { full_name: "acme/vibe", private: false, size: 300, default_branch: "main", html_url: "https://github.com/acme/vibe" });
  if (url.pathname === "/repos/acme/huge") return json(200, { full_name: "acme/huge", private: false, size: 900_000, default_branch: "main", html_url: "https://github.com/acme/huge" });
  if (url.pathname === "/repos/acme/vibe/commits/fixed") return json(200, { sha: SHA_FIXED });
  if (url.pathname.startsWith("/repos/acme/vibe/commits/")) return json(200, { sha: SHA });
  if (url.pathname === `/acme/vibe/tar.gz/${SHA_FIXED}`) {
    res.writeHead(200, { "content-type": "application/x-gzip", "content-length": archiveFixed.length });
    return res.end(archiveFixed);
  }
  if (url.pathname === `/acme/vibe/tar.gz/${SHA}`) {
    res.writeHead(200, { "content-type": "application/x-gzip", "content-length": archive.length });
    return res.end(archive);
  }
  return json(404, { message: "Not Found" });
});

stub.listen(4322, "127.0.0.1", () => {
  const child = spawn(process.execPath, [join(ROOT, "dist", "web", "local-server.js")], {
    stdio: "inherit",
    env: {
      ...process.env,
      GATESEEKER_WEB_PORT: "4321",
      GATESEEKER_GITHUB_API: "http://127.0.0.1:4322",
      GATESEEKER_GITHUB_ARCHIVE: "http://127.0.0.1:4322",
      GATESEEKER_OSV_ENDPOINT: "http://127.0.0.1:4322/v1/query",
      GATESEEKER_PACKAGIST_BASE: "http://127.0.0.1:4322/p2",
      GATESEEKER_AUTH_STUB: "1",
      GATESEEKER_EXAMPLE_REPO: "https://github.com/acme/vibe",
      GATESEEKER_SCAN_LIMIT: "3",
      GATESEEKER_ADMIN_LOGINS: "e2e-user",
      GATESEEKER_GITHUB_APP_ID: "1",
      GATESEEKER_GITHUB_APP_SLUG: "gateseeker-e2e",
      GATESEEKER_GITHUB_APP_KEY: APP_KEY,
      GATESEEKER_GITHUB_WEB: "http://127.0.0.1:4322",
    },
  });
  const stop = () => {
    child.kill();
    stub.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => {
    stub.close();
    process.exit(code ?? 0);
  });
});
