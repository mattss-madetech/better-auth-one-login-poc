import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";

const SIMULATOR_URL =
  process.env.BETTER_AUTH_SIMULATOR_URL ?? "http://localhost:3000";
const USERINFO_URL = `${SIMULATOR_URL}/userinfo`;
const DID_URL = `${SIMULATOR_URL}/.well-known/did.json`;
// The coreIdentityJWT issuer mirrors the real GOV.UK pattern: simulator base URL with trailing slash.
const ISSUER = `${SIMULATOR_URL}/`;

const clientId = process.env.CLIENT_ID;
if (!clientId) throw new Error("CLIENT_ID env var is required");

export interface NamePart {
  value: string;
  type: "GivenName" | "FamilyName";
}

export interface NameRecord {
  nameParts: NamePart[];
  validFrom?: string;
  validUntil?: string;
}

export interface AddressRecord {
  addressCountry?: string;
  buildingNumber?: string;
  buildingName?: string;
  streetName?: string;
  postalCode?: string;
  addressLocality?: string;
  uprn?: number;
  validFrom?: string;
  validUntil?: string;
}

export interface IdentityData {
  sub: string;
  vot: string;
  credentialSubject: {
    name: NameRecord[];
    birthDate: Array<{ value: string }>;
  };
  address: AddressRecord[];
}

/**
 * Calls the GOV.UK One Login /userinfo endpoint, extracts the coreIdentityJWT,
 * validates its ES256 signature via the simulator's DID document, checks all
 * standard JWT claims (iss, aud, exp), cross-checks sub against the session's
 * GOV.UK pairwise sub, and returns the parsed identity data.
 */
export async function validateIdentity(
  accessToken: string,
  govukSub: string,
): Promise<IdentityData> {
  // 1. Fetch /userinfo — User-Agent is required by real GOV.UK (403 without it).
  const userinfoRes = await fetch(USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "better-auth-govuk-poc/1.0",
    },
  });
  if (!userinfoRes.ok) {
    throw new Error(
      `/userinfo returned ${userinfoRes.status}: ${await userinfoRes.text()}`,
    );
  }
  const userinfo = (await userinfoRes.json()) as Record<string, unknown>;

  // 2. Extract identity claims.
  const coreIdentityJwt =
    userinfo["https://vocab.account.gov.uk/v1/coreIdentityJWT"];
  if (typeof coreIdentityJwt !== "string") {
    throw new Error(
      `coreIdentityJWT not present in userinfo response. Keys returned: ${Object.keys(userinfo).join(", ")}`,
    );
  }
  const address = (userinfo["https://vocab.account.gov.uk/v1/address"] ??
    []) as AddressRecord[];

  // 3. Decode JWT header → get kid and confirm ES256 algorithm.
  const header = decodeProtectedHeader(coreIdentityJwt);
  if (header.alg !== "ES256") {
    throw new Error(
      `Unexpected coreIdentityJWT alg: ${header.alg}, expected ES256`,
    );
  }
  const kid = header.kid;
  if (!kid) throw new Error("coreIdentityJWT header is missing kid");

  // 4. Fetch the DID document and find the assertionMethod entry matching kid.
  //    DID document JWKs don't have a kid field, so we match by the method's id.
  const didRes = await fetch(DID_URL);
  if (!didRes.ok) {
    throw new Error(`DID document fetch failed: ${didRes.status}`);
  }
  const didDoc = (await didRes.json()) as {
    assertionMethod: Array<{ id: string; publicKeyJwk: Record<string, unknown> }>;
  };

  const method = didDoc.assertionMethod?.find((m) => m.id === kid);
  if (!method) {
    const available = didDoc.assertionMethod?.map((m) => m.id).join(", ");
    throw new Error(
      `Signing key ${kid} not found in DID document. Available: ${available}`,
    );
  }

  // 5. Import the EC public key and verify the JWT.
  //    jwtVerify automatically validates exp, nbf, iss, and aud.
  const publicKey = await importJWK(method.publicKeyJwk, "ES256");
  const { payload } = await jwtVerify(coreIdentityJwt, publicKey, {
    issuer: ISSUER,
    audience: clientId,
    algorithms: ["ES256"],
  });

  // 6. Cross-check sub against the pairwise sub from the token exchange.
  if (payload.sub !== govukSub) {
    throw new Error(
      `coreIdentityJWT sub mismatch: JWT has "${payload.sub}", expected "${govukSub}"`,
    );
  }

  console.log(`coreIdentityJWT validated for sub: ${govukSub}`);

  const vc = (payload as Record<string, unknown>).vc as {
    credentialSubject: IdentityData["credentialSubject"];
  };

  return {
    sub: payload.sub!,
    vot: (payload as Record<string, unknown>).vot as string,
    credentialSubject: vc.credentialSubject,
    address,
  };
}
