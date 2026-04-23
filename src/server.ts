import "dotenv/config";
import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";

const app = express();
const PORT = 8080;

// Run Better Auth database migrations on startup
const ctx = await auth.$context;
await ctx.runMigrations();

// Better Auth handles all /api/auth/* routes.
// Must be registered before express.json() — Better Auth reads the raw request body.
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());

app.get("/", async (req, res) => {
  const session = await auth.api.getSession({ headers: req.headers as any });

  if (session?.user) {
    res.send(`
      <h1>Signed in</h1>
      <pre>${JSON.stringify(session.user, null, 2)}</pre>
      <a href="/api/auth/sign-out">Sign out</a>
    `);
  } else {
    res.send(`
      <h1>GOV.UK One Login POC</h1>
      <p>Testing Better Auth <code>private_key_jwt</code> support with the GOV.UK One Login simulator.</p>
      <a href="/api/auth/sign-in/social?provider=gov-uk-one-login&callbackURL=/">
        Sign in with GOV.UK One Login
      </a>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
