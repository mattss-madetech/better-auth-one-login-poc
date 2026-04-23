# Better Auth × GOV.UK One Login

A proof-of-concept showing [Better Auth](https://www.better-auth.com) (beta) working end-to-end with the [GOV.UK One Login](https://signin.account.gov.uk) service using `private_key_jwt` client authentication (RFC 7523). The integration runs against the official [GOV.UK One Login simulator](https://github.com/govuk-one-login/simulator) locally in Docker.

## Prerequisites

- [mise](https://mise.jdx.dev) (manages Node 20 and pnpm 10.16.0 automatically)
- [Docker](https://www.docker.com) (for the simulator)

## Quick start

```bash
# 0. Install Node and pnpm (once, after cloning)
mise install

# 1. Install dependencies and generate RSA keys + .env
mise run setup

# 2. Start the GOV.UK One Login simulator
mise run simulator

# 3. Start the Express app
mise run dev
```

Then open http://localhost:8080 and click **Sign in with GOV.UK One Login**.

To stop the simulator: `mise run simulator:down`

To run tests: `mise run test` (headless) or `mise run test:ui` (interactive)

To start afresh: `mise run clean` removes all generated artifacts (`node_modules`, `sqlite.db`, `.env`, `dist`, `test-results`). Follow up with the full reset cycle:

```bash
mise run simulator:down
mise run clean
mise run setup
mise run simulator
```

## Development workflow

After initial setup you only need steps 2 and 3 on each session. Re-run `mise run setup` only when you want to regenerate keys — but note that changing keys requires a full simulator restart:

```bash
mise run simulator:down
mise run setup
mise run simulator
```

(`docker compose restart` alone won't pick up the new public key.)

## How it works

1. The browser calls Better Auth's sign-in endpoint, which stores PKCE state and redirects to the simulator's `/authorize`
2. The simulator redirects back to `/api/auth/callback/gov-uk-one-login?code=…&state=…`
3. Better Auth calls the simulator's `/token` endpoint, authenticating with a signed `client_assertion` JWT (`private_key_jwt`)
4. The simulator verifies the assertion against the public key registered at startup, then issues tokens
5. Better Auth creates a session; the browser is redirected to `/`

## Key files

| File | Purpose |
|---|---|
| `src/server.ts` | Express app — mounts Better Auth, serves the `/` page |
| `src/auth.ts` | Better Auth config — `genericOAuth` plugin with `private_key_jwt` |
| `scripts/generate-keys.ts` | Generates RSA-2048 keypair, writes to `.env` |
| `docker-compose.yml` | GOV.UK One Login simulator on port 3000 |

## Gotchas

- **`pnpm rebuild better-sqlite3` is required** — pnpm blocks native builds by default; `pnpm install` alone is not enough. `mise run setup` handles this.
- **`PUBLIC_KEY_PEM` must stay double-quoted in `.env`** — docker-compose only interprets `\n` as newlines inside double-quoted values. Don't alter this quoting or the simulator's SPKI import will fail.
- **Key rotation requires a full Docker restart** — `docker compose restart` does not re-read `.env`. Use `mise run simulator:down` then `mise run simulator`.
