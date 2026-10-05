// `npm run smoke` with the local Supabase stack's keys and SMOKE_REQUIRE_ADMIN=1, so organizer steps cannot SKIP.
// The server under test must use the same stack: start it with `npm run dev:local`.

import { spawn } from "node:child_process";
import { URL, fileURLToPath } from "node:url";
import { localSupabaseEnv } from "./local-supabase.mjs";

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = localSupabaseEnv();
const smoke = fileURLToPath(new URL("./smoke.mjs", import.meta.url));
const child = spawn(process.execPath, [smoke], {
  stdio: "inherit",
  env: {
    ...process.env,
    SUPABASE_URL: API_URL,
    SUPABASE_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    SMOKE_REQUIRE_ADMIN: "1",
  },
});
child.on("exit", (code) => process.exit(code ?? 1));
