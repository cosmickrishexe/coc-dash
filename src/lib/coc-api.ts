import { Client } from "clashofclans.js";

export class SupercellApiError extends Error {
  statusCode: number;
  reason?: string;
  requiredIp?: string;

  constructor(message: string, statusCode: number, reason?: string, requiredIp?: string) {
    super(message);
    this.name = "SupercellApiError";
    this.statusCode = statusCode;
    this.reason = reason;
    this.requiredIp = requiredIp;
  }
}

// --- Automated token management via clashofclans.js ---
// If COC_EMAIL and COC_PASSWORD are set, the library logs into the
// Supercell developer portal and provisions a JWT key for the current
// server IP automatically. Falls back to the manual COC_API_TOKEN env var.
let cocClient: Client | null = null;
let cocClientReady: Promise<void> | null = null;

async function initCocClient(): Promise<void> {
  const email = process.env.COC_EMAIL;
  const password = process.env.COC_PASSWORD;
  if (!email || !password) return;

  cocClient = new Client();
  await cocClient.login({ email, password });
}

async function getAutoToken(): Promise<string | null> {
  const email = process.env.COC_EMAIL;
  const password = process.env.COC_PASSWORD;
  if (!email || !password) return null;

  // Initialise once, reuse the promise so concurrent requests don't race
  if (!cocClientReady) {
    cocClientReady = initCocClient();
  }
  await cocClientReady;

  // @ts-ignore – internal property to read the auto-provisioned keys
  const keys: string[] = cocClient?.rest?.requestHandler?.keys ?? [];
  return keys.length > 0 ? keys[0] : null;
}

/**
 * Resolve a valid Supercell API bearer token.
 * Priority: auto-managed key > manually supplied token > COC_API_TOKEN env var.
 */
export async function resolveToken(manualToken?: string): Promise<string> {
  // 1. Try automated token
  const auto = await getAutoToken();
  if (auto) return auto;

  // 2. Use explicitly passed token (from the UI config form)
  if (manualToken && manualToken.trim().length > 10) return manualToken.trim();

  // 3. Fall back to env var
  const envToken = process.env.COC_API_TOKEN;
  if (envToken && envToken.trim().length > 10) return envToken.trim();

  throw new Error(
    "No valid Supercell API token available. Set COC_EMAIL/COC_PASSWORD for automatic management, or provide a manual token."
  );
}

export async function fetchClanData(clanTag: string, token?: string) {
  const resolvedToken = await resolveToken(token);
  const formattedTag = encodeURIComponent(clanTag.startsWith("#") ? clanTag : `#${clanTag}`);
  const url = `https://api.clashofclans.com/v1/clans/${formattedTag}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${resolvedToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text();
    let reason = "unknown";
    let message = `Supercell API error (${res.status})`;
    let requiredIp: string | undefined;

    try {
      const parsed = JSON.parse(errorText);
      reason = parsed.reason || reason;
      message = parsed.message || message;
      // Extract IP from message like: "API key does not allow access from IP 106.192.233.235"
      const ipMatch = message.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
      if (ipMatch) {
        requiredIp = ipMatch[0];
      }
    } catch {
      // not json
    }

    throw new SupercellApiError(message, res.status, reason, requiredIp);
  }

  return await res.json();
}

export async function fetchCurrentWar(clanTag: string, token?: string) {
  const resolvedToken = await resolveToken(token);
  const formattedTag = encodeURIComponent(clanTag.startsWith("#") ? clanTag : `#${clanTag}`);
  const url = `https://api.clashofclans.com/v1/clans/${formattedTag}/currentwar`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${resolvedToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }
  return await res.json();
}

export async function fetchWarLog(clanTag: string, token?: string) {
  const resolvedToken = await resolveToken(token);
  const formattedTag = encodeURIComponent(clanTag.startsWith("#") ? clanTag : `#${clanTag}`);
  const url = `https://api.clashofclans.com/v1/clans/${formattedTag}/warlog?limit=10`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${resolvedToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }
  return await res.json();
}

export async function fetchRaidSeasons(clanTag: string, token?: string) {
  const resolvedToken = await resolveToken(token);
  const formattedTag = encodeURIComponent(clanTag.startsWith("#") ? clanTag : `#${clanTag}`);
  const url = `https://api.clashofclans.com/v1/clans/${formattedTag}/capitalraidseasons?limit=5`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${resolvedToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }
  return await res.json();
}
