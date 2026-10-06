// `npm run import:ekstraklasa` against the local Supabase stack, with its URL and service role key, so no key
// is copied by hand. Arguments pass through, e.g. `npm run import:ekstraklasa:local -- --apply`.
// Refuses a non-local Supabase URL (local-supabase.mjs).

import { spawn } from "node:child_process";
import { URL, fileURLToPath } from "node:url";
import { localSupabaseEnv } from "./local-supabase.mjs";

const { API_URL, SERVICE_ROLE_KEY } = localSupabaseEnv();
const script = fileURLToPath(new URL("./import-ekstraklasa.mjs", import.meta.url));
const child = spawn(process.execPath, [script, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, SUPABASE_URL: API_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY },
});
child.on("exit", (code) => process.exit(code ?? 1));
