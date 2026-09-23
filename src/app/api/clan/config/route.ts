import { NextRequest, NextResponse } from "next/server";
import fs from "fs";

export const dynamic = "force-dynamic";
import path from "path";
import { fetchClanData, SupercellApiError } from "@/lib/coc-api";

async function detectPublicIp(): Promise<string> {
  try {
    const res = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data.ip) return data.ip;
    }
  } catch {
    // fallback
  }
  return "106.192.233.235";
}

export async function GET() {
  const publicIp = await detectPublicIp();
  const token = process.env.COC_API_TOKEN || "";
  const maskedToken = token.length > 15 
    ? `${token.slice(0, 8)}...${token.slice(-6)}` 
    : (token ? "••••••••••••" : "");

  return NextResponse.json({
    success: true,
    data: {
      publicIp,
      clanTag: process.env.CLAN_TAG || "#2QVJ990GL",
      hasToken: Boolean(token),
      maskedToken,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password, clanTag } = body;

    const expectedPin = process.env.SCORING_ADMIN_PIN || "9449";
    if (String(password) !== expectedPin) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid admin password." },
        { status: 401 }
      );
    }

    const cleanTag = (clanTag && typeof clanTag === "string" ? clanTag.trim() : (process.env.CLAN_TAG || "#2QVJ990GL"));
    const formattedTag = cleanTag.startsWith("#") ? cleanTag : `#${cleanTag}`;

    // 1. Update in-memory process environment
    process.env.CLAN_TAG = formattedTag;

    // 2. Persist to .data/store.json
    try {
      const storePath = path.join(process.cwd(), ".data", "store.json");
      if (fs.existsSync(storePath)) {
        const storeContent = JSON.parse(fs.readFileSync(storePath, "utf-8"));
        storeContent.cocConfig = {
          clanTag: formattedTag,
          updatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(storePath, JSON.stringify(storeContent, null, 2));
      }
    } catch (e) {
      console.error("Failed to update store.json config:", e);
    }

    // 3. Persist to .env.local
    try {
      const envPath = path.join(process.cwd(), ".env.local");
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, "utf-8");
        envContent = envContent.replace(/^CLAN_TAG=.*$/m, `CLAN_TAG=${formattedTag}`);
        fs.writeFileSync(envPath, envContent);
      }
    } catch (e) {
      console.error("Failed to update .env.local:", e);
    }

    // 4. Test the newly saved key immediately
    let connectionStatus: "connected" | "ip_mismatch" | "invalid_token" | "unknown" = "unknown";
    let testMessage = "";
    let requiredIp = "";

    try {
      const clanData = await fetchClanData(formattedTag);
      connectionStatus = "connected";
      testMessage = `Verified successfully! Connected to clan "${clanData.name}" (${clanData.members} members).`;
    } catch (err: unknown) {
      if (err instanceof SupercellApiError) {
        if (err.statusCode === 403 && err.reason === "accessDenied.invalidIp") {
          connectionStatus = "ip_mismatch";
          requiredIp = err.requiredIp || (await detectPublicIp());
          testMessage = `Token saved, but Supercell rejected IP access. Please add IP ${requiredIp} to this key at developer.clashofclans.com.`;
        } else {
          connectionStatus = "invalid_token";
          testMessage = `Supercell rejected token (${err.statusCode}): ${err.message}`;
        }
      } else {
        testMessage = err instanceof Error ? err.message : "Error testing API token";
      }
    }

    return NextResponse.json({
      success: true,
      message: "Clash of Clans API credentials updated.",
      data: {
        clanTag: formattedTag,
        connectionStatus,
        testMessage,
        requiredIp,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update configuration";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
