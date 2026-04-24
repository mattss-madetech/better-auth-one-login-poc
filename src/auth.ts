import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import Database from "better-sqlite3";

const clientId = process.env.CLIENT_ID;
const privateKeyJwkRaw = process.env.PRIVATE_KEY_JWK;

if (!clientId) throw new Error("CLIENT_ID env var is required");
if (!privateKeyJwkRaw) throw new Error("PRIVATE_KEY_JWK env var is required");

export const db = new Database("sqlite.db");

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:8080",
  secret: process.env.BETTER_AUTH_SECRET,
  database: db,
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "gov-uk-one-login",
          clientId,
          discoveryUrl:
            "http://localhost:3000/.well-known/openid-configuration",
          authentication: "private_key_jwt",
          clientAssertion: {
            privateKeyJwk: JSON.parse(privateKeyJwkRaw),
            algorithm: "RS256",
          },
          pkce: true,
          scopes: ["openid", "email"],
          // GOV.UK One Login requires a nonce parameter.
          // A static value is acceptable for this POC; production would generate
          // a per-request nonce and verify it against the returned ID token.
          //
          // vtr=["Cl.Cm.P2"]: medium-confidence authentication (Cl.Cm) + medium
          // identity confidence (P2). Required to trigger identity proving.
          //
          // claims: requests coreIdentityJWT (name + DOB credential) and address
          // from the /userinfo endpoint. These are identity claims, not scopes.
          authorizationUrlParams: {
            nonce: "poc-nonce",
            vtr: JSON.stringify(["Cl.Cm.P2"]),
            claims: JSON.stringify({
              userinfo: {
                "https://vocab.account.gov.uk/v1/coreIdentityJWT": null,
                "https://vocab.account.gov.uk/v1/address": null,
              },
            }),
          },
        },
      ],
    }),
  ],
});
