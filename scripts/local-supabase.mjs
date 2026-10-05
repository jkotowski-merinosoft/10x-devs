// Reads the local Supabase stack's URL and keys from `npx supabase status -o env`, so no key is copied by hand.
// Used by dev-local.mjs and smoke-local.mjs. Refuses anything but a local API URL.

import { execSync } from "node:child_process";

function readStatus() {
  try {
    return execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    return "";
  }
}

export function localSupabaseEnv({ start = false } = {}) {
  let output = readStatus();
  if (!output.includes("API_URL=") && start) {
    console.log("Local Supabase is not running, starting it (Docker required)...");
    execSync("npx supabase start", { stdio: "inherit" });
    output = readStatus();
  }

  const env = Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line))
      .filter(Boolean)
      .map(([, key, value]) => [key, value]),
  );

  if (!env.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) {
    console.error("Local Supabase is not running. Start Docker and run: npx supabase start");
    process.exit(1);
  }
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.API_URL)) {
    console.error(`Refusing non-local Supabase URL: ${env.API_URL}`);
    process.exit(1);
  }
  return env;
}
