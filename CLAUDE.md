# nightmare-fuel-prototype

Hex/path tile-laying board game prototype (React + boardgame.io). The server (`server.ts`, run with **bun**) hosts multiplayer matches and server-run AI seats; the Vite client is served from `dist/`.

## Runtime & tooling

- Use **bun** for running the server and installing packages (`bun install`, `bun server.ts`). Railway deploys with `bun server.ts` and installs with a **frozen bun.lock**.
- Local dev without Postgres: `USE_FLATFILE=1 bun server.ts` (FlatFile storage; needs the `node-persist` devDependency).
- Tests: `npx vitest run` (unit), `npm run test:ui` (browser smoke, needs `CHROME_PATH`).

## Rules toggles (env)

Rules knobs resolve from env in `rulesConfig.ts` (Vite `import.meta.env` in the browser, `process.env` on the server) and are snapshotted into each match at creation — existing matches keep the rules they started with:

- `VITE_ACTION_CARDS` = `disabled` | `one-per-turn` (default) | `unlimited`
- `VITE_FORK_SUPPORT` = `1`/`0` — support-tree fork constraints (default off: playtests found forking too hard)

Tests that exercise a mechanic must pin its flag in their own rules rather than relying on the shipping default.

## Versioning (semver — required)

- `package.json` `version` (MAJOR.MINOR.PATCH) is the single source of truth. It is baked into the client at build time (`__APP_VERSION__`/`__APP_COMMIT__` via `vite.config.ts` define), displayed in the app (bottom-left version badge and the network modal), and logged by the server at startup — the deployed version is always identifiable.
- Every change that alters app behavior must bump the version in the same PR:
  - **PATCH** — bug fixes, visual tweaks, copy changes, deploy/tooling fixes
  - **MINOR** — new features or rules options that stay backwards compatible
  - **MAJOR** — breaking changes: persisted match state, lobby/API, or save-format incompatibilities
- After changing `version` or any dependency, regenerate BOTH lockfiles and commit them together: `bun install` (bun.lock) and `npm install --package-lock-only` (package-lock.json). A stale bun.lock fails the Railway deploy at install, before the build even runs.
