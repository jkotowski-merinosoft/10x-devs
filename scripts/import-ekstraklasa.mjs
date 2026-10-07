// Imports the Ekstraklasa 2026/27 season from apifootball.com into public.matches (upsert by provider id).
// Zero dependencies on purpose. Dry run by default; `--apply` writes. Local stack: npm run import:ekstraklasa:local.
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and APIFOOTBALL_KEY. Each is taken from the first source that has
// it: the shell, `.env.import.<dev|prod>` (only with `--env <dev|prod>`), `.env.import`, and for APIFOOTBALL_KEY
// alone the gitignored .env (the app's file, pointing at the cloud dev project). The report header names the sources.
// `--apply` names the target database and asks for confirmation before writing; `--yes` skips the question.
// Imports only `Not Started` and `Finished` matches. Never deletes: matches imported earlier that are now
// missing or skipped are only listed. No key and no API URL (the key is in its query) is ever printed.

import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { URL } from "node:url";

const LEAGUE_ID = "259";
const FROM = "2026-07-01";
const TO = "2027-06-30";
const SOURCE = "apifootball";
const DEV_PROJECT_REF = "mwmugmjikpltdaijjkoa";
const IMPORTED_STATUSES = ["Not Started", "Finished"];

// apifootball.com spelling (all 18 names in the 2026/27 response) -> official Polish club name.
// "Wisla" is Wisła Kraków and "Zaglebie" is Zagłębie Lubin (by their stadiums). Unknown names are kept, with a warning.
const TEAM_NAMES = {
  Cracovia: "Cracovia",
  "GKS Katowice": "GKS Katowice",
  "Gornik Zabrze": "Górnik Zabrze",
  Jagiellonia: "Jagiellonia Białystok",
  "Korona Kielce": "Korona Kielce",
  "Lech Poznan": "Lech Poznań",
  Legia: "Legia Warszawa",
  "Motor Lublin": "Motor Lublin",
  "Piast Gliwice": "Piast Gliwice",
  "Pogon Szczecin": "Pogoń Szczecin",
  "Radomiak Radom": "Radomiak Radom",
  Rakow: "Raków Częstochowa",
  "Slask Wroclaw": "Śląsk Wrocław",
  "Widzew Lodz": "Widzew Łódź",
  "Wieczysta Krakow": "Wieczysta Kraków",
  Wisla: "Wisła Kraków",
  "Wisla Plock": "Wisła Płock",
  Zaglebie: "Zagłębie Lubin",
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const assumeYes = args.includes("--yes");
const envArg = args.findIndex((arg) => arg === "--env" || arg.startsWith("--env="));
const envVariant =
  envArg === -1 ? null : args[envArg].startsWith("--env=") ? args[envArg].slice(6) : (args[envArg + 1] ?? "");
const IMPORT_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "APIFOOTBALL_KEY"];

function fail(message) {
  console.error(message);
  process.exit(1);
}

// Reads only `keys` from a file in the project root (first occurrence wins); null when the file is missing.
function readEnvFile(name, keys) {
  const path = new URL(`../${name}`, import.meta.url);
  if (!existsSync(path)) return null;
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const found = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (found && keys.includes(found[1]) && !Object.hasOwn(values, found[1])) {
      values[found[1]] = found[2].replace(/^(["'])(.*)\1$/, "$2").trim();
    }
  }
  return values;
}

// Highest priority first; the shell wins, as with dotenv and `node --env-file`.
const sources = [{ name: "shell", values: process.env }];
if (envVariant !== null) {
  if (!["dev", "prod"].includes(envVariant)) fail("--env must be dev or prod.");
  const name = `.env.import.${envVariant}`;
  const values = readEnvFile(name, IMPORT_KEYS);
  if (!values) fail(`--env ${envVariant} needs ${name} in the project root.`);
  sources.push({ name, values });
}
sources.push({ name: ".env.import", values: readEnvFile(".env.import", IMPORT_KEYS) ?? {} });
// Only APIFOOTBALL_KEY may come from .env; everything else there is ignored on purpose.
sources.push({ name: ".env", values: readEnvFile(".env", ["APIFOOTBALL_KEY"]) ?? {} });

const resolved = Object.fromEntries(
  IMPORT_KEYS.map((key) => {
    const source = sources.find(({ values }) => values[key]);
    return [key, { value: source?.values[key] ?? "", source: source?.name ?? "not set" }];
  }),
);
const SUPABASE_URL = resolved.SUPABASE_URL.value;
const SUPABASE_SERVICE_ROLE_KEY = resolved.SUPABASE_SERVICE_ROLE_KEY.value;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  fail("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the shell or in .env.import(.dev|.prod), never in .env.");
}
let supabaseHost = "";
let supabaseHostname = "";
try {
  ({ host: supabaseHost, hostname: supabaseHostname } = new URL(SUPABASE_URL));
} catch {
  fail("SUPABASE_URL is not a valid URL.");
}
// Only a hint for the confirmation; any other host is assumed to be production.
const target = ["localhost", "127.0.0.1", "[::1]"].includes(supabaseHostname)
  ? "local stack"
  : supabaseHostname.startsWith(`${DEV_PROJECT_REF}.`)
    ? "cloud dev project"
    : "NOT local, NOT cloud dev: probably PRODUCTION";
const apiKey = resolved.APIFOOTBALL_KEY.value;
if (!apiKey || apiKey === "###") fail("Set APIFOOTBALL_KEY in the shell, .env.import(.dev|.prod) or .env.");

// Defensive: whatever text leaves this script never carries a key.
function redact(text) {
  return [apiKey, SUPABASE_SERVICE_ROLE_KEY].reduce((out, secret) => out.split(secret).join("***"), String(text));
}

console.log(`Ekstraklasa import -> ${supabaseHost} [${target}] (${apply ? "--apply" : "dry run"})`);
console.log(`  keys: ${IMPORT_KEYS.map((key) => `${key} from ${resolved[key].source}`).join(", ")}`);

// --- Fetch -------------------------------------------------------------------------------------------

async function fetchEvents() {
  const params = new URLSearchParams({
    action: "get_events",
    league_id: LEAGUE_ID,
    from: FROM,
    to: TO,
    timezone: "UTC",
    // The provider caches responses per URL; a fresh parameter avoids a stale timezone.
    _: String(Date.now()),
    APIkey: apiKey,
  });
  let response;
  try {
    response = await fetch(`https://apiv3.apifootball.com/?${params.toString()}`);
  } catch (error) {
    fail(redact(`API request failed: network error (${error?.cause?.code ?? error?.name ?? "unknown"}).`));
  }
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON body
  }
  if (!response.ok || !Array.isArray(json) || json.length === 0) {
    const reason = !response.ok
      ? "HTTP error"
      : Array.isArray(json)
        ? "empty list"
        : `not a list${json?.message ? `: ${String(json.message)}` : ""}`;
    fail(redact(`API request failed: ${response.status}, ${reason}`.slice(0, 160)) + ". Nothing written.");
  }
  return json;
}

// --- Supabase REST (service role) --------------------------------------------------------------------

async function supabase(path, { method = "GET", body, prefer } = {}) {
  const response = await fetch(SUPABASE_URL + path, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON body
  }
  if (!response.ok) {
    const message = String(json?.msg ?? json?.message ?? json?.error_description ?? json?.error ?? "");
    fail(redact(`Supabase ${method} failed: ${response.status} ${message.slice(0, 120)}`));
  }
  return { json, range: response.headers.get("content-range") ?? "" };
}

// Reads all rows of a query; fails instead of silently working on a truncated page (PostgREST max rows).
async function readAll(path) {
  const { json, range } = await supabase(path, { prefer: "count=exact" });
  const total = Number(range.split("/")[1]);
  if (!Array.isArray(json) || (Number.isFinite(total) && total !== json.length)) {
    fail(`Supabase read returned ${Array.isArray(json) ? json.length : "no"} of ${range.split("/")[1]} rows.`);
  }
  return json;
}

// --- Transform ---------------------------------------------------------------------------------------

const events = await fetchEvents();

const statusCounts = new Map();
const skipped = [];
const warnings = [];
const unknownNames = new Set();
const skipReason = new Map(); // match_id -> reason, for stale matches
const rows = [];
const seenIds = new Set();

function polishName(raw) {
  const name = String(raw ?? "").trim();
  if (Object.hasOwn(TEAM_NAMES, name)) return TEAM_NAMES[name];
  if (!unknownNames.has(name)) {
    unknownNames.add(name);
    warnings.push(`team name not in TEAM_NAMES, kept as is: "${name}"`);
  }
  return name;
}

function score(value) {
  const text = String(value ?? "").trim();
  return /^\d{1,2}$/.test(text) ? Number(text) : null;
}

function startsAt(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const value = `${date}T${time}:00Z`;
  const parsed = new Date(value);
  // Round trip rejects impossible dates such as 2026-02-30 or 25:00.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(`${date}T${time}`) ? value : null;
}

for (const event of events) {
  const id = String(event?.match_id ?? "").trim();
  const status = String(event?.match_status ?? "");
  statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  const label = `${id} ${String(event?.match_hometeam_name ?? "")} - ${String(event?.match_awayteam_name ?? "")}`;
  const skip = (reason) => {
    skipped.push(`${label}: ${reason}`);
    if (id && !skipReason.has(id)) skipReason.set(id, reason);
  };

  if (!IMPORTED_STATUSES.includes(status)) {
    skip(`status "${status}"`);
    continue;
  }
  if (!id) {
    skip("missing match_id");
    continue;
  }
  if (seenIds.has(id)) {
    skipped.push(`${label}: duplicate match_id (first one kept)`);
    continue;
  }
  seenIds.add(id);

  const sideA = polishName(event.match_hometeam_name);
  const sideB = polishName(event.match_awayteam_name);
  const start = startsAt(String(event.match_date ?? ""), String(event.match_time ?? ""));
  if (!start) {
    skip(`invalid date/time "${String(event.match_date ?? "")} ${String(event.match_time ?? "")}"`);
    continue;
  }
  if ([sideA, sideB].some((name) => name.length < 1 || name.length > 100)) {
    skip("team name empty or longer than 100 characters");
    continue;
  }
  if (sideA.toLowerCase() === sideB.toLowerCase()) {
    skip("same team on both sides");
    continue;
  }

  let scoreA = null;
  let scoreB = null;
  if (status === "Finished") {
    scoreA = score(event.match_hometeam_score);
    scoreB = score(event.match_awayteam_score);
    if (scoreA === null || scoreB === null) {
      scoreA = null;
      scoreB = null;
      warnings.push(`${label}: Finished without a valid score, imported without score`);
    }
  }

  // Every row has the same keys: PostgREST bulk insert requires it.
  rows.push({
    side_a: sideA,
    side_b: sideB,
    starts_at: start,
    score_a: scoreA,
    score_b: scoreB,
    created_by: null,
    external_source: SOURCE,
    external_id: id,
  });
}

// --- Compare with the database -----------------------------------------------------------------------

const existing = await readAll(
  `/rest/v1/matches?select=external_id,side_a,side_b,starts_at,score_a,score_b&external_source=eq.${SOURCE}`,
);
const manual = await readAll("/rest/v1/matches?select=id&external_source=is.null");
const existingById = new Map(existing.map((row) => [String(row.external_id), row]));

let created = 0;
let changed = 0;
let unchanged = 0;
for (const row of rows) {
  const current = existingById.get(row.external_id);
  if (!current) created++;
  else if (
    current.side_a === row.side_a &&
    current.side_b === row.side_b &&
    new Date(current.starts_at).getTime() === new Date(row.starts_at).getTime() &&
    current.score_a === row.score_a &&
    current.score_b === row.score_b
  )
    unchanged++;
  else changed++;
}

const importedIds = new Set(rows.map((row) => row.external_id));
const stale = existing
  .filter((row) => !importedIds.has(String(row.external_id)))
  .map((row) => {
    const reason = skipReason.get(String(row.external_id));
    return `${row.external_id} ${row.side_a} - ${row.side_b}: ${reason ?? "missing from API"}`;
  });

// --- Report ------------------------------------------------------------------------------------------

function list(title, items) {
  console.log(`\n${title}: ${items.length}`);
  for (const item of items) console.log(`  ${item}`);
}

console.log(`\nMatches in API: ${events.length}`);
for (const [status, count] of statusCounts) console.log(`  ${status === "" ? '""' : status}: ${count}`);
console.log(`To import: ${rows.length} (new ${created}, changed ${changed}, unchanged ${unchanged})`);
console.log(`  with score: ${rows.filter((row) => row.score_a !== null).length}`);
list("Skipped", skipped);
list("Warnings", warnings);
list("Stale (imported earlier, not in this import; left unchanged)", stale);
console.log(
  `\nMatches without external_source (added by hand, not touched; may duplicate imported ones): ${manual.length}`,
);

const sorted = [...rows].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
const now = new Date().toISOString();
const upcoming = sorted.filter((row) => row.starts_at > now);
const samples = (upcoming.length >= 3 ? upcoming : sorted).slice(0, 3);
console.log("\nSample rows (starts_at in UTC / Warsaw):");
for (const row of samples) {
  const warsaw = new Date(row.starts_at).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });
  const result = row.score_a === null ? "" : ` ${row.score_a}:${row.score_b}`;
  console.log(`  ${row.external_id} ${row.side_a} - ${row.side_b}${result}  ${row.starts_at} / ${warsaw}`);
}

if (!apply) {
  console.log("\nDRY RUN: nothing written. Re-run with --apply to write.");
  process.exit(0);
}

// --- Confirm -----------------------------------------------------------------------------------------

async function confirmWrite() {
  console.log(`\nTarget database: ${supabaseHost} [${target}]`);
  if (assumeYes) return;
  if (!process.stdin.isTTY) fail("No terminal to confirm the write. Re-run with --apply --yes. Nothing written.");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`Write ${rows.length} match(es) into ${supabaseHost}? [y/N] `);
  prompt.close();
  if (!["y", "yes", "t", "tak"].includes(answer.trim().toLowerCase())) fail("Aborted. Nothing written.");
}

await confirmWrite();

// --- Write (one atomic bulk upsert) ------------------------------------------------------------------

if (rows.length > 0) {
  await supabase(`/rest/v1/matches?on_conflict=external_source,external_id`, {
    method: "POST",
    body: rows,
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}
console.log(`\nAPPLIED: ${rows.length} match(es) upserted into ${supabaseHost}.`);
