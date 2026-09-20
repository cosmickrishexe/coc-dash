import { NextRequest, NextResponse } from "next/server";
import { getScoringRules, updateScoringRules } from "@/lib/storage";
import { ScoringRules } from "@/lib/types";

export async function GET() {
  try {
    const rules = await getScoringRules();
    return NextResponse.json({ success: true, data: rules });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to retrieve rules";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password, rules } = body;

    const expectedPin = process.env.SCORING_ADMIN_PIN || "9449";
    if (String(password) !== expectedPin) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid admin password. Password 9449 is required to modify scoring rules." },
        { status: 401 }
      );
    }

    if (!rules) {
      return NextResponse.json({ success: false, error: "Missing rules payload" }, { status: 400 });
    }

    const sanitizedRules: ScoringRules = {
      warStar: Number(rules.warStar) || 10,
      warDestruction: Number(rules.warDestruction) || 1,
      warPenalty: Number(rules.warPenalty) || -30,
      cwlStar: Number(rules.cwlStar) || 15,
      cwlDestruction: Number(rules.cwlDestruction) || 2,
      cwlPenalty: Number(rules.cwlPenalty) || -50,
      raidAttack: Number(rules.raidAttack) || 10,
      cgRatio: Number(rules.cgRatio) || 10,
    };

    await updateScoringRules(sanitizedRules);

    return NextResponse.json({
      success: true,
      message: "Scoring rules updated and all player scores recalculated successfully.",
      data: sanitizedRules,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save rules";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
