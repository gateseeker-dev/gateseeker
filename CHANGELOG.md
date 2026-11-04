# Changelog

One short section per published version, newest first. The workspace links the current section from its "updated" notice, so write for the person who uses the product, not for the engineer.

## 1.0.0 (2026-11-04)

First stable version: `npm install gateseeker` now gets this one (`latest`), and the Action is listed on the GitHub Marketplace.

- Admin master: an admin area (`/app/admin`) with accounts, last access and activity, and a User/Admin switch in the sidebar for the configured admin logins.
- Update notice: open workspaces learn about a new version within minutes and offer to reload; the CLI and the Action say when a newer version exists.
- Live example on the Home without signing in, shareable report links (`/p/<id>`), one public page per curated advisory, sharing image and README badge.
- Hosting fix (2026-11-04, same version): on Vercel the nested API paths (shared report links, the admin area, the daily jobs) were answered by the platform's 404 instead of the service. Every `/api` path is now routed to the one function explicitly.

## 1.0.0-beta.7 (2026-10-28)

- First release under the `gateseeker-dev` organization. The hosted page (Sprint 4) follows in later versions; the engine, the CLI and the Action are unchanged from beta.6.

## 1.0.0-beta.6 (2026-10-28)

- First release published by CI with npm provenance (staged publishing, approved by the maintainer).
- GitHub Action with SARIF output, pull-request comment and a configurable gate.
- Composer lockfiles, structural supply-chain rules and the curated advisory feed next to OSV.

## 1.0.0-beta.1 (2026-10-27)

- First public build: `gateseeker scan` for `package-lock.json`, OSV lookups, explainable P1 to P4 priorities, gate exit codes, eight code-pattern rules for AI-generated apps.
