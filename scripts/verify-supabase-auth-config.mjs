import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const configPath = resolve(process.cwd(), "supabase/config.toml");
const config = readFileSync(configPath, "utf8");

function sectionBody(sectionName) {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = config.match(new RegExp(`\\[${escaped}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
  return match?.[1] ?? "";
}

function rootValue(key) {
  const root = config.split(/\n\[auth\.rate_limit\]|\n\[auth\.email\]/)[0];
  const match = root.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"));
  return match?.[1]?.trim();
}

function sectionValue(sectionName, key) {
  const body = sectionBody(sectionName);
  const match = body.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"));
  return match?.[1]?.trim();
}

function stripQuotes(value) {
  return value?.replace(/^"|"$/g, "");
}

const failures = [];

function requireValue(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label} must be ${expected}, found ${actual ?? "missing"}`);
  }
}

requireValue("auth.enable_signup", rootValue("enable_signup"), "false");
requireValue("auth.enable_anonymous_sign_ins", rootValue("enable_anonymous_sign_ins"), "false");
requireValue("auth.email.enable_signup", sectionValue("auth.email", "enable_signup"), "false");
requireValue("auth.email.enable_confirmations", sectionValue("auth.email", "enable_confirmations"), "true");
requireValue(
  "auth.password_requirements",
  stripQuotes(rootValue("password_requirements")),
  "lower_upper_letters_digits_symbols"
);

const minPasswordLength = Number(rootValue("minimum_password_length"));
if (!Number.isFinite(minPasswordLength) || minPasswordLength < 8) {
  failures.push(`auth.minimum_password_length must be at least 8, found ${rootValue("minimum_password_length") ?? "missing"}`);
}

const productionAppUrl = process.env.PRODUCTION_APP_URL?.trim();
if (productionAppUrl) {
  const siteUrl = stripQuotes(rootValue("site_url"));
  const redirectUrls = rootValue("additional_redirect_urls") ?? "";
  if (siteUrl !== productionAppUrl) {
    failures.push(`site_url must match PRODUCTION_APP_URL (${productionAppUrl}) for production verification, found ${siteUrl ?? "missing"}`);
  }
  if (!redirectUrls.includes(productionAppUrl)) {
    failures.push(`additional_redirect_urls must include PRODUCTION_APP_URL (${productionAppUrl}) for production verification`);
  }
}

if (failures.length > 0) {
  console.error("Supabase Auth configuration audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Supabase Auth configuration audit passed.");
