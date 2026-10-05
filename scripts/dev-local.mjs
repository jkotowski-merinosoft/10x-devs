// `astro dev` against the local Supabase stack instead of the project in .env / .dev.vars, which stay untouched.
// Keys come from `npx supabase status -o env` (the stack is started if needed) and reach the app twice:
// as process env, which beats .env in astro:env, and as .dev.vars.local, which wrangler reads with CLOUDFLARE_ENV=local.
// Extra arguments go to astro, e.g. `npm run dev:local -- --port 4322`.

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { URL, fileURLToPath } from "node:url";
import { localSupabaseEnv } from "./local-supabase.mjs";

const { API_URL, ANON_KEY } = localSupabaseEnv({ start: true });
const devVars = fileURLToPath(new URL("../.dev.vars.local", import.meta.url));
writeFileSync(devVars, `SUPABASE_URL=${API_URL}\nSUPABASE_KEY=${ANON_KEY}\n`);

const astro = fileURLToPath(new URL("../node_modules/astro/bin/astro.mjs", import.meta.url));
const child = spawn(process.execPath, [astro, "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, CLOUDFLARE_ENV: "local", SUPABASE_URL: API_URL, SUPABASE_KEY: ANON_KEY },
});
child.on("exit", (code) => process.exit(code ?? 1));
