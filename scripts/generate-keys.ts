import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ENV_PATH = join(ROOT, ".env");

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const kid = randomUUID();
const jwk = privateKey.export({ format: "jwk" }) as Record<string, unknown>;
const privateKeyJwk = JSON.stringify({ ...jwk, kid });

let env = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf-8") : "";

function upsert(content: string, key: string, value: string): string {
  const re = new RegExp(`^${key}=.*`, "m");
  const line = `${key}=${value}`;
  return re.test(content) ? content.replace(re, line) : content + "\n" + line;
}

env = upsert(env, "PRIVATE_KEY_JWK", privateKeyJwk);

// Remove PUBLIC_KEY_PEM if present — replaced by the /.well-known/jwks.json endpoint
env = env.replace(/^PUBLIC_KEY_PEM=.*\n?/m, "");

if (!env.includes("CLIENT_ID="))
  env += "\nCLIENT_ID=poc-better-auth-client";

if (!env.includes("BETTER_AUTH_SECRET="))
  env += `\nBETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}`;

if (!env.includes("BETTER_AUTH_URL="))
  env += "\nBETTER_AUTH_URL=http://localhost:8080";

writeFileSync(ENV_PATH, env.trimStart());

console.log("Keys written to .env");
console.log("  PRIVATE_KEY_JWK  RSA-2048 private key as JWK (includes kid; served as public JWK at /.well-known/jwks.json)");
console.log("");
console.log("Next steps:");
console.log("  docker compose down && docker compose up -d");
console.log("  pnpm dev");
