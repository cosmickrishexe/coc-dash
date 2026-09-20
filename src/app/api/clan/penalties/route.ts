import { NextRequest, NextResponse } from "next/server";
import { adjustPlayerPenalty } from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { playerTag, deltaMissed } = body;

    if (!playerTag || typeof deltaMissed !== "number") {
      return NextResponse.json(
        { success: false, error: "Missing playerTag or deltaMissed" },
        { status: 400 }
      );
    }

    const updated = await adjustPlayerPenalty(playerTag, deltaMissed);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Player not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Updated penalty for ${updated.name}`,
      data: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update penalty";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
