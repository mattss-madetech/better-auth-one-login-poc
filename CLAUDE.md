# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A POC integration between the [Better Auth](https://www.better-auth.com) library (`beta` — v1.7.0-beta.2) and the GOV.UK One Login service, using `private_key_jwt` client authentication and identity proving. The app verifies that Better Auth's implementation of RFC 7523 works end-to-end against the [GOV.UK One Login simulator](https://github.com/govuk-one-login/simulator) running locally in Docker, and demonstrates the full identity proving flow: requesting `coreIdentityJWT` + `address` claims, validating the ES256-signed credential JWT against the simulator's DID document, and displaying verified name, date of birth, and address.

## Commands

```bash
# First-time setup (after cloning or after changing keys)
pnpm install
pnpm rebuild better-sqlite3     # required: pnpm blocks native builds by default
pnpm run generate-keys          # writes PRIVATE_KEY_JWK, PUBLIC_KEY_PEM, CLIENT_ID, etc. to .env

# Start the simulator (reads .env for client registration)
docker compose up -d
docker compose down             # stop

# Start the Express server (runs migrations, then listens on :8080)
pnpm dev
```

There are Playwright e2e tests but no lint/build steps — `tsx` runs TypeScript directly.

## Architecture

```
src/server.ts          Express entry point — mounts Better Auth, /api/identity route, serves the / page
src/auth.ts            Better Auth config — genericOAuth plugin with private_key_jwt; exports db
src/identity.ts        Identity proving — calls /userinfo, validates coreIdentityJWT via DID document
scripts/generate-keys.ts  One-shot RSA-2048 keypair generator → writes to .env
docker-compose.yml     GOV.UK One Login Simulator on :3000
sqlite.db              Created at runtime by Better Auth migrations (gitignored)
```

### Request flow

1. Browser hits `POST /api/auth/sign-in/social?provider=gov-uk-one-login` (Better Auth route)
2. Better Auth stores `state` + PKCE `code_verifier` in the `verification` SQLite table and returns a redirect URL to the simulator's `/authorize` — including `vtr=["Cl.Cm.P2"]` (medium identity confidence) and a `claims` parameter requesting `coreIdentityJWT` and `address`
3. Simulator redirects back to `/api/auth/callback/gov-uk-one-login?code=…&state=…`
4. Better Auth retrieves the stored `code_verifier`, then calls the simulator's `/token` endpoint with a signed `client_assertion` JWT (`private_key_jwt`)
5. Simulator verifies the assertion against `PUBLIC_KEY` (SPKI PEM registered at startup), issues tokens
6. Better Auth calls `/userinfo` to get the user's email, stores the access token in the `account` table, creates a session; browser is redirected to `/`
7. Browser loads `/` → page JS calls `GET /api/identity`
8. `/api/identity` queries the `account` table for the access token, calls `/userinfo` with a `User-Agent` header, extracts and validates the `coreIdentityJWT` (ES256 signature via the simulator's DID document, `iss`/`aud`/`sub`/`exp` claims), and returns name, DOB, confidence level, and address

### Key configuration wiring

- `PRIVATE_KEY_JWK` (from `.env`) → `src/auth.ts` `clientAssertion.privateKeyJwk` — signs the JWT assertion
- `PUBLIC_KEY_PEM` (from `.env`) → docker-compose `PUBLIC_KEY` env var → simulator verifies assertions
- `CLIENT_ID` → both `src/auth.ts` and docker-compose must agree on the same value
- `IDENTITY_VERIFICATION_SUPPORTED: "true"` in docker-compose → simulator returns `coreIdentityJWT` + `address` in `/userinfo`
- Database migrations run automatically on startup via `await (await auth.$context).runMigrations()`
- `db` is exported from `src/auth.ts` so `server.ts` can query the `account` table for the access token

## Non-obvious gotchas

- **`better-sqlite3` native build**: `pnpm install` alone is not enough — run `pnpm rebuild better-sqlite3` after install. The `onlyBuiltDependencies` field in `package.json` allows the build; `pnpm rebuild` triggers it.
- **`PUBLIC_KEY_PEM` must be double-quoted in `.env`**: docker-compose only interprets `\n` as real newlines inside double-quoted values. `generate-keys.ts` writes `PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\nMII..."`. If this quoting is lost, `importSPKI` in the simulator will fail.
- **Simulator `SCOPES` is comma-separated**: `"openid,email"` not `"openid email"` — the simulator calls `.split(",")`.
- **`nonce` is required by GOV.UK One Login**: sent as a static `authorizationUrlParams: { nonce: "poc-nonce" }` in `src/auth.ts`. A production integration would generate a per-request nonce and validate it from the ID token.
- **Regenerating keys requires restarting Docker**: `docker compose down && docker compose up -d` — `docker compose restart` does not re-read `.env`.
- **`minimumReleaseAge` in `pnpm-workspace.yaml`**: pnpm ≥ 10.16 uses camelCase `minimumReleaseAge: 1440` (minutes) in `pnpm-workspace.yaml`, not `minimum-release-age` in `.npmrc`. The pnpm version is pinned to 10.16.0 via `.mise.toml`.
- **Express 4, not 5**: `app.all("/api/auth/*", ...)` uses Express 4 wildcard syntax. Express 5 changed it.
- **`coreIdentityJWT` issuer has a trailing slash**: the simulator's `iss` claim is `http://localhost:3000/` (with trailing slash), matching the real GOV.UK identity issuer pattern. The `issuer` option in `jwtVerify` must match exactly.
- **DID document keys have no `kid` field**: `createLocalJWKSet` from jose won't match them. Instead, find the `assertionMethod` entry where `.id === header.kid`, extract `.publicKeyJwk`, and import it directly with `importJWK`.
- **`coreIdentityJWT` uses ES256 (EC), `id_token` uses RS256 (RSA)**: they are signed by different keys. The ES256 key comes from `/.well-known/did.json`; the RS256 key comes from `/.well-known/jwks.json`.
- **`User-Agent` header is required on `/userinfo`**: the real GOV.UK One Login returns 403 without it. The simulator is lenient but we send it anyway for production fidelity.
- **Identity data is not persisted**: `validateIdentity` re-fetches and re-validates on every `/api/identity` request. The access token is stored by Better Auth in `account.accessToken`; identity itself is not stored in the DB.

## Environment variables (`.env`)

Generated by `pnpm run generate-keys`. See `.env.example` for the shape.

| Variable | Used by |
|---|---|
| `PRIVATE_KEY_JWK` | `src/auth.ts` — signs client assertions |
| `PUBLIC_KEY_PEM` | docker-compose → simulator — verifies assertions |
| `CLIENT_ID` | both `src/auth.ts` and docker-compose |
| `BETTER_AUTH_SECRET` | Better Auth session signing |
| `BETTER_AUTH_URL` | Better Auth base URL (default `http://localhost:8080`) |
