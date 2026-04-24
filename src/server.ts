import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import { toNodeHandler } from "better-auth/node";
import { auth, db } from "./auth.js";
import { validateIdentity } from "./identity.js";

const app = express();
const PORT = 8080;

const identityRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// Run Better Auth database migrations on startup
// (!! not recommended for production use)
const ctx = await auth.$context;
await ctx.runMigrations();

// Better Auth handles all /api/auth/* routes.
// Must be registered before express.json() — Better Auth reads the raw request body.
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());

app.get("/api/identity", identityRateLimiter, async (req, res) => {
  const session = await auth.api.getSession({ headers: req.headers as any });
  if (!session?.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Look up the GOV.UK account record to get the access token and pairwise sub.
  // Better Auth stores the pairwise sub as account.accountId and the OAuth
  // access token as account.accessToken.
  const account = db
    .prepare(
      "SELECT accountId, accessToken FROM account WHERE userId = ? AND providerId = 'gov-uk-one-login'",
    )
    .get(session.user.id) as
    | { accountId: string; accessToken: string }
    | undefined;

  if (!account?.accessToken) {
    return res
      .status(404)
      .json({ error: "No GOV.UK account or access token found" });
  }

  try {
    const identity = await validateIdentity(account.accessToken, account.accountId);
    res.json(identity);
  } catch (err) {
    console.error("Identity validation failed:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.get("/", async (req, res) => {
  const session = await auth.api.getSession({ headers: req.headers as any });

  if (session?.user) {
    res.send(`
      <h1>Signed in</h1>
      <h2>Better Auth session</h2>
      <pre>${JSON.stringify(session.user, null, 2)}</pre>
      <h2>GOV.UK Identity</h2>
      <div id="identity"><em>Loading identity claims...</em></div>
      <br>
      <a href="#" id="sign-out">Sign out</a>
      <script>
        fetch('/api/identity')
          .then(r => r.json())
          .then(data => {
            if (data.error) {
              document.getElementById('identity').innerHTML = '<strong>Error:</strong> ' + data.error;
              return;
            }
            const names = data.credentialSubject?.name?.[0]?.nameParts ?? [];
            const given = names.filter(p => p.type === 'GivenName').map(p => p.value).join(' ');
            const family = names.filter(p => p.type === 'FamilyName').map(p => p.value).join(' ');
            const dob = data.credentialSubject?.birthDate?.[0]?.value ?? 'Unknown';
            const addr = data.address?.[0];
            const addrStr = addr
              ? [addr.buildingNumber, addr.streetName, addr.addressLocality, addr.postalCode]
                  .filter(Boolean).join(', ')
              : null;
            document.getElementById('identity').innerHTML =
              '<p><strong>Name:</strong> ' + given + ' ' + family + '</p>' +
              '<p><strong>Date of birth:</strong> ' + dob + '</p>' +
              '<p><strong>Identity confidence:</strong> ' + (data.vot ?? 'Unknown') + '</p>' +
              (addrStr ? '<p><strong>Address:</strong> ' + addrStr + '</p>' : '') +
              '<details><summary>Raw identity JSON</summary><pre>' + JSON.stringify(data, null, 2) + '</pre></details>';
          })
          .catch(e => {
            document.getElementById('identity').textContent = 'Error fetching identity: ' + e.message;
          });

        document.getElementById('sign-out').addEventListener('click', async function(e) {
          e.preventDefault();
          await fetch('/api/auth/sign-out', { method: 'POST' });
          window.location.href = '/';
        });
      </script>
    `);
  } else {
    res.send(`
      <h1>GOV.UK One Login POC</h1>
      <p>Testing Better Auth <code>private_key_jwt</code> support with the GOV.UK One Login simulator.</p>
      <a href="#" id="sign-in">Sign in with GOV.UK One Login</a>
      <script>
        document.getElementById('sign-in').addEventListener('click', async function(e) {
          e.preventDefault();
          const res = await fetch('/api/auth/sign-in/social', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'gov-uk-one-login', callbackURL: '/' })
          });
          const data = await res.json();
          if (data.url) window.location.href = data.url;
        });
      </script>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
