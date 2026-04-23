import { generateKeyPairSync, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ENV_PATH = join(ROOT, ".env");

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const privateKeyJwk = JSON.stringify(privateKey.export({ format: "jwk" }));
// Store PEM with literal \n inside double quotes.
// Docker Compose interprets \n as actual newlines in double-quoted .env values,
// which is required for importSPKI in the simulator to parse the PEM correctly.
const publicKeyPemRaw = publicKey.export({ type: "spki", format: "pem" }) as string;
const publicKeyPem =
  '"' + publicKeyPemRaw.trimEnd().replace(/\n/g, "\\n") + '"';

let env = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf-8") : "";

function upsert(content: string, key: string, value: string): string {
  const re = new RegExp(`^${key}=.*`, "m");
  const line = `${key}=${value}`;
  return re.test(content) ? content.replace(re, line) : content + "\n" + line;
}

env = upsert(env, "PRIVATE_KEY_JWK", privateKeyJwk);
env = upsert(env, "PUBLIC_KEY_PEM", publicKeyPem);

if (!env.includes("CLIENT_ID="))
  env += "\nCLIENT_ID=poc-better-auth-client";

if (!env.includes("BETTER_AUTH_SECRET="))
  env += `\nBETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}`;

if (!env.includes("BETTER_AUTH_URL="))
  env += "\nBETTER_AUTH_URL=http://localhost:8080";

writeFileSync(ENV_PATH, env.trimStart());

console.log("Keys written to .env");
console.log("  PRIVATE_KEY_JWK  RSA-2048 private key as JWK (for Better Auth)");
console.log("  PUBLIC_KEY_PEM   RSA-2048 public key as SPKI PEM (for simulator)");
console.log("");
console.log("Next steps:");
console.log("  docker compose up -d");
console.log("  pnpm dev");
