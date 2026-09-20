import { OcrResultItem } from "./types";

const CLAN_GAMES_SYSTEM_PROMPT = `You are a data extraction AI specialized in interpreting game UI screenshots for Clash of Clans.
Task: Analyze the provided screenshot of the Clan Games event board. Extract the player name, their player tag (if visible), and the individual points earned toward the Clan Games.
Output Format: Provide the extracted data strictly in a valid JSON array format, where each object contains the following keys:
* "player_name": string
* "player_tag": string or null
* "points_earned": integer

Instruction: Ensure all numbers are accurately parsed as integers and all strings are cleanly formatted. Do not include any conversational text, explanation, or markdown formatting outside the JSON array. Output strictly raw JSON.`;

export async function extractClanGamesPoints(imageBase64: string, mimeType: string = "image/png"): Promise<OcrResultItem[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in server environment variables.");
  }

  // Remove data:image/...;base64, prefix if present
  const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

  const modelsToTry = [model, "gemini-flash-latest", "gemini-3.8-flash"].filter(
    (v, i, a) => a.indexOf(v) === i
  );

  const requestBody = {
    contents: [
      {
        parts: [
          { text: CLAN_GAMES_SYSTEM_PROMPT },
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  };

  let lastError = "";
  let textContent: string | undefined;

  for (const m of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const result = await response.json();
        textContent = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textContent) break;
      } else {
        const errText = await response.text();
        lastError = `Gemini API error (${response.status}) on ${m}: ${errText}`;
        if (response.status !== 503 && response.status !== 429 && response.status !== 404) {
          throw new Error(lastError);
        }
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (!textContent) {
    throw new Error(lastError || "Failed to extract text from Gemini Vision models.");
  }

  try {
    // Parse JSON
    const parsed = JSON.parse(textContent);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => ({
        player_name: String(item.player_name || ""),
        player_tag: item.player_tag ? String(item.player_tag) : null,
        points_earned: Number(item.points_earned) || 0,
      }));
    }
    throw new Error("Gemini response was not a JSON array.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse extracted JSON from Gemini: ${msg}. Raw output: ${textContent}`);
  }
}
