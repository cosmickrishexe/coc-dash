import { NextRequest, NextResponse } from "next/server";
import { extractClanGamesPoints } from "@/lib/gemini";
import { applyClanGamesOcrPoints, getLeaderboard } from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let base64Image = "";
    let mimeType = "image/png";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      base64Image = body.image || "";
      mimeType = body.mimeType || "image/png";
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ success: false, error: "No image file uploaded" }, { status: 400 });
      }
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      base64Image = buffer.toString("base64");
      mimeType = file.type || "image/png";
    } else {
      return NextResponse.json({ success: false, error: "Unsupported content type" }, { status: 400 });
    }

    if (!base64Image) {
      return NextResponse.json({ success: false, error: "Image data is empty" }, { status: 400 });
    }

    // Step 1: Run Gemini Flash Vision OCR Extraction
    const extractedItems = await extractClanGamesPoints(base64Image, mimeType);

    // Step 2: Correlate with active clan members
    const currentMembers = await getLeaderboard();
    const correlated = extractedItems.map((item) => {
      const matched = currentMembers.some(
        (m) => (item.player_tag && m.tag === item.player_tag) || m.name.toLowerCase() === item.player_name.toLowerCase()
      );
      return {
        ...item,
        matched,
        masterBonus: Math.min(400, Math.floor(item.points_earned / 10)),
      };
    });

    return NextResponse.json({
      success: true,
      data: correlated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to process screenshot with Gemini Flash Vision";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

interface IncomingCommitItem {
  player_name?: string;
  name?: string;
  player_tag?: string | null;
  tag?: string | null;
  points_earned?: number;
  points?: number;
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: "No items to commit" }, { status: 400 });
    }

    const ocrPayload = (items as IncomingCommitItem[]).map((i) => ({
      name: i.player_name || i.name || "",
      tag: i.player_tag || i.tag || null,
      points: Number(i.points_earned ?? i.points) || 0,
    }));

    const result = await applyClanGamesOcrPoints(ocrPayload);

    return NextResponse.json({
      success: true,
      message: `Committed Clan Games points for ${result.updatedCount} members to the database.`,
      data: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to commit OCR points";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
