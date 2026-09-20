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

export async function fetchClanData(clanTag: string, token: string) {
  const formattedTag = encodeURIComponent(clanTag.startsWith("#") ? clanTag : `#${clanTag}`);
  const url = `https://api.clashofclans.com/v1/clans/${formattedTag}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.trim()}`,
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

export async function fetchCurrentWar(clanTag: string, token: string) {
  const formattedTag = encodeURIComponent(clanTag.startsWith("#") ? clanTag : `#${clanTag}`);
  const url = `https://api.clashofclans.com/v1/clans/${formattedTag}/currentwar`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }
  return await res.json();
}

export async function fetchWarLog(clanTag: string, token: string) {
  const formattedTag = encodeURIComponent(clanTag.startsWith("#") ? clanTag : `#${clanTag}`);
  const url = `https://api.clashofclans.com/v1/clans/${formattedTag}/warlog?limit=10`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }
  return await res.json();
}

export async function fetchRaidSeasons(clanTag: string, token: string) {
  const formattedTag = encodeURIComponent(clanTag.startsWith("#") ? clanTag : `#${clanTag}`);
  const url = `https://api.clashofclans.com/v1/clans/${formattedTag}/capitalraidseasons?limit=5`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }
  return await res.json();
}
