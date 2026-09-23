import { NextResponse } from "next/server";
import { getClanInfo, getLeaderboard, getScoringRules } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [clan, players, rules] = await Promise.all([
      getClanInfo(),
      getLeaderboard(),
      getScoringRules(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        clan,
        players,
        rules,
      },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to retrieve leaderboard";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
