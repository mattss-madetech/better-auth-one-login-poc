# Better Auth × GOV.UK One Login

A proof-of-concept showing [Better Auth](https://www.better-auth.com) (beta) mounted on an [Express](https://expressjs.com) app working end-to-end with the [GOV.UK One Login](https://signin.account.gov.uk) service using `private_key_jwt` client authentication (RFC 7523) and identity proving. The integration runs against the official [GOV.UK One Login simulator](https://github.com/govuk-one-login/simulator) locally in Docker.

After sign-in the app displays the user's verified name, date of birth, identity confidence level (P2), and address — all extracted from the `coreIdentityJWT` credential returned by the `/userinfo` endpoint and validated using the simulator's DID document.

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

To start afresh: `mise run clean` removes all generated artifacts (`node_modules`, `.env`, `dist`, `test-results`). Follow up with the full reset cycle:

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

1. The browser calls Better Auth's sign-in endpoint, which stores PKCE state and redirects to the simulator's `/authorize` — including [`vtr=["Cl.Cm.P2"]`](https://docs.sign-in.service.gov.uk/integrate-with-integration-environment/authenticate-your-user/#choose-which-authentication-and-identity-proving-to-request) (medium identity confidence + two-factor auth) and a [`claims` parameter](https://docs.sign-in.service.gov.uk/integrate-with-integration-environment/prove-users-identity/#make-a-request-to-prove-your-user-s-identity) requesting `coreIdentityJWT` and `address`
2. The simulator redirects back to `/api/auth/callback/gov-uk-one-login?code=…&state=…`
3. Better Auth calls the simulator's `/token` endpoint, authenticating with a signed `client_assertion` JWT ([`private_key_jwt`](https://docs.sign-in.service.gov.uk/integrate-with-integration-environment/authenticate-your-user/#make-a-token-request))
4. The simulator verifies the assertion against the public key registered at startup, then issues tokens
5. Better Auth calls `/userinfo` to get the user's email and stores the access token; the browser is redirected to `/`
6. The home page calls `GET /api/identity`, which fetches `/userinfo` again with the stored access token, [validates the `coreIdentityJWT`](https://docs.sign-in.service.gov.uk/integrate-with-integration-environment/prove-users-identity/#validate-the-core-identity-claim) (ES256 signature via the simulator's DID document, `iss`/`aud`/`sub`/`exp` checks), and returns the verified identity claims

## Key files

| File | Purpose |
|---|---|
| `src/server.ts` | Express app — mounts Better Auth, `GET /api/identity` route, serves the `/` page |
| `src/auth.ts` | Better Auth config — `genericOAuth` plugin with `private_key_jwt`; exports `db` |
| `src/identity.ts` | Identity proving — calls `/userinfo`, validates `coreIdentityJWT` via DID document |
| `scripts/generate-keys.ts` | Generates RSA-2048 keypair, writes to `.env` |
| `docker-compose.yml` | GOV.UK One Login simulator on port 3000 |

## GOV.UK One Login documentation

| Topic | URL |
|---|---|
| Authenticate your user (authorize, token, userinfo, vtr, PKCE) | [docs.sign-in.service.gov.uk/…/authenticate-your-user](https://docs.sign-in.service.gov.uk/integrate-with-integration-environment/authenticate-your-user/) |
| Prove your user's identity (claims, coreIdentityJWT, DID document) | [docs.sign-in.service.gov.uk/…/prove-users-identity](https://docs.sign-in.service.gov.uk/integrate-with-integration-environment/prove-users-identity/) |
| Choose the correct token authentication method (private_key_jwt) | [docs.sign-in.service.gov.uk/…/use-correct-token-authentication-method](https://docs.sign-in.service.gov.uk/before-integrating/use-correct-token-authentication-method/) |

## Gotchas

- **`pnpm rebuild better-sqlite3` is required** — pnpm blocks native builds by default; `pnpm install` alone is not enough. `mise run setup` handles this.
- **`PUBLIC_KEY_PEM` must stay double-quoted in `.env`** — docker-compose only interprets `\n` as newlines inside double-quoted values. Don't alter this quoting or the simulator's SPKI import will fail.
- **Key rotation requires a full Docker restart** — `docker compose restart` does not re-read `.env`. Use `mise run simulator:down` then `mise run simulator`.
- **Changing `docker-compose.yml` also requires a full restart** — `IDENTITY_VERIFICATION_SUPPORTED` and other env vars are only read at container startup.
