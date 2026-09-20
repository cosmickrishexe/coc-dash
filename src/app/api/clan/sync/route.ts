import { NextResponse } from "next/server";
import { fetchClanData, fetchCurrentWar, fetchRaidSeasons, SupercellApiError } from "@/lib/coc-api";
import { syncClanFromApi } from "@/lib/storage";

export async function POST() {
  const token = process.env.COC_API_TOKEN;
  const clanTag = process.env.CLAN_TAG || "#2QVJ990GL";

  if (!token) {
    return NextResponse.json(
      { success: false, error: "COC_API_TOKEN is not configured in environment variables." },
      { status: 400 }
    );
  }

  try {
    const clanData = await fetchClanData(clanTag, token);
    const [warData, raidData] = await Promise.all([
      fetchCurrentWar(clanTag, token).catch(() => null),
      fetchRaidSeasons(clanTag, token).catch(() => null),
    ]);

    const result = await syncClanFromApi(clanData, warData, raidData);

    const warState = warData?.state || "notInWar";
    const warMembersWithAttacks = warData?.clan?.members
      ? warData.clan.members.filter((m: { attacks?: unknown[] }) => (m.attacks?.length ?? 0) > 0).length
      : 0;

    let syncMessage = `Successfully synchronized ${result.players.length} clan members from Supercell API.`;
    if (warState === "warEnded") {
      syncMessage += ` War data imported (${warMembersWithAttacks}/${warData?.teamSize ?? "?"} members attacked).`;
    } else if (warState === "inWar") {
      syncMessage += ` Live war in progress — attack stats loaded.`;
    } else if (warState === "preparation") {
      syncMessage += ` Clan is in war preparation phase.`;
    }

    return NextResponse.json({
      success: true,
      message: syncMessage,
      data: {
        ...result,
        warState,
        warTeamSize: warData?.teamSize ?? 0,
        warMembersWithAttacks,
      },
    });
  } catch (err: unknown) {
    if (err instanceof SupercellApiError) {
      return NextResponse.json(
        {
          success: false,
          error: err.message,
          reason: err.reason,
          requiredIp: err.requiredIp,
          statusCode: err.statusCode,
          instructions: err.requiredIp
            ? `Your current IP address (${err.requiredIp}) is not whitelisted on this Supercell API key. Please visit https://developer.clashofclans.com and add IP ${err.requiredIp} to your key.`
            : "Supercell API authorization failed. Please verify your token.",
        },
        { status: err.statusCode || 500 }
      );
    }

    const message = err instanceof Error ? err.message : "Failed to synchronize with Supercell API.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
