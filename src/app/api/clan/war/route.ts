import { NextResponse } from "next/server";
import { fetchCurrentWar, fetchWarLog, SupercellApiError } from "@/lib/coc-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.COC_API_TOKEN;
  const clanTag = process.env.CLAN_TAG || "#2QVJ990GL";

  if (!token) {
    return NextResponse.json(
      { success: false, error: "COC_API_TOKEN is not configured. Please update it in the Admin panel." },
      { status: 400 }
    );
  }

  try {
    // Fetch current war (includes warEnded state — data stays available until next war prep starts)
    const [warData, warLogData] = await Promise.all([
      fetchCurrentWar(clanTag, token).catch(() => null),
      fetchWarLog(clanTag, token).catch(() => null),
    ]);

    const warState: string = warData?.state || "notInWar";

    // Parse current war members attacks
    let warMembers: Array<{
      tag: string;
      name: string;
      townhallLevel: number;
      attacks: Array<{
        stars: number;
        destructionPercentage: number;
        defenderTag: string;
        order: number;
      }>;
      totalStars: number;
      avgDestruction: number;
      attacksMade: number;
      attacksMissed: number;
    }> = [];

    if (warData?.clan?.members && Array.isArray(warData.clan.members)) {
      const maxAttacks = warData.attacksPerMember || 2;
      const isEnded = warState === "warEnded";

      warMembers = warData.clan.members
        .map((wm: {
          tag: string;
          name?: string;
          townhallLevel?: number;
          attacks?: Array<{ stars?: number; destructionPercentage?: number; defenderTag?: string; order?: number }>;
        }) => {
          const attacks = (wm.attacks || []).map((a) => ({
            stars: a.stars ?? 0,
            destructionPercentage: a.destructionPercentage ?? 0,
            defenderTag: a.defenderTag ?? "",
            order: a.order ?? 0,
          }));

          const totalStars = attacks.reduce((s, a) => s + a.stars, 0);
          const avgDestruction =
            attacks.length > 0
              ? Math.round(attacks.reduce((s, a) => s + a.destructionPercentage, 0) / attacks.length)
              : 0;
          const attacksMissed = isEnded ? Math.max(0, maxAttacks - attacks.length) : 0;

          return {
            tag: wm.tag,
            name: wm.name ?? "",
            townhallLevel: wm.townhallLevel ?? 0,
            attacks,
            totalStars,
            avgDestruction,
            attacksMade: attacks.length,
            attacksMissed,
          };
        })
        .sort((a: { totalStars: number; avgDestruction: number }, b: { totalStars: number; avgDestruction: number }) =>
          b.totalStars - a.totalStars || b.avgDestruction - a.avgDestruction
        );
    }

    // Parse war log (clan-level summary of past wars)
    const warLog = warLogData?.items?.map((entry: {
      result?: string;
      endTime?: string;
      teamSize?: number;
      attacksPerMember?: number;
      clan?: { stars?: number; destructionPercentage?: number; attacks?: number };
      opponent?: { name?: string; tag?: string; stars?: number; destructionPercentage?: number };
    }) => ({
      result: entry.result ?? "unknown",
      endTime: entry.endTime ?? null,
      teamSize: entry.teamSize ?? 0,
      clanStars: entry.clan?.stars ?? 0,
      clanDestruction: entry.clan?.destructionPercentage ?? 0,
      opponentName: entry.opponent?.name ?? "Unknown",
      opponentTag: entry.opponent?.tag ?? "",
      opponentStars: entry.opponent?.stars ?? 0,
      opponentDestruction: entry.opponent?.destructionPercentage ?? 0,
    })) ?? [];

    return NextResponse.json({
      success: true,
      data: {
        state: warState,
        teamSize: warData?.teamSize ?? 0,
        attacksPerMember: warData?.attacksPerMember ?? 2,
        startTime: warData?.startTime ?? null,
        endTime: warData?.endTime ?? null,
        clanTag: warData?.clan?.tag ?? clanTag,
        clanName: warData?.clan?.name ?? null,
        clanStars: warData?.clan?.stars ?? 0,
        clanDestruction: warData?.clan?.destructionPercentage ?? 0,
        clanAttacks: warData?.clan?.attacks ?? 0,
        opponentName: warData?.opponent?.name ?? null,
        opponentTag: warData?.opponent?.tag ?? null,
        opponentStars: warData?.opponent?.stars ?? 0,
        opponentDestruction: warData?.opponent?.destructionPercentage ?? 0,
        warMembers,
        warLog,
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
          instructions: err.requiredIp
            ? `Your current IP (${err.requiredIp}) is not whitelisted. Go to https://developer.clashofclans.com and add this IP to your API key, or update the token in the Admin panel.`
            : "Supercell API authorization failed. Please verify your token.",
        },
        { status: err.statusCode || 500 }
      );
    }

    const message = err instanceof Error ? err.message : "Failed to fetch war data.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
