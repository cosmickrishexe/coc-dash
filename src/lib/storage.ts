import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { ClanInfo, DEFAULT_RULES, PlayerRecord, ScoringRules } from "./types";
import { calculateMasterScore } from "./scoring";

interface LocalStore {
  clan: ClanInfo | null;
  players: PlayerRecord[];
  rules: ScoringRules;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function getInitialStore(): LocalStore {
  return {
    clan: null,
    players: [],
    rules: DEFAULT_RULES,
  };
}

function readLocalStore(): LocalStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
      const init = getInitialStore();
      fs.writeFileSync(STORE_PATH, JSON.stringify(init, null, 2));
      return init;
    }
    const data = fs.readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading local store:", err);
    return getInitialStore();
  }
}

function writeLocalStore(store: LocalStore) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error("Error writing local store:", err);
  }
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key && key.length > 20) {
    return createClient(url, key);
  }
  return null;
}

export async function getScoringRules(): Promise<ScoringRules> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.from("scoring_rules").select("*").eq("id", 1).single();
      if (!error && data) {
        return {
          warStar: data.war_star,
          warDestruction: data.war_destruction,
          warPenalty: data.war_penalty,
          cwlStar: data.cwl_star,
          cwlDestruction: data.cwl_destruction,
          cwlPenalty: data.cwl_penalty,
          raidAttack: data.raid_attack,
          cgRatio: data.cg_ratio,
        };
      }
    } catch {
      // fallback
    }
  }
  const store = readLocalStore();
  return store.rules || DEFAULT_RULES;
}

export async function updateScoringRules(rules: ScoringRules): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from("scoring_rules").upsert({
        id: 1,
        war_star: rules.warStar,
        war_destruction: rules.warDestruction,
        war_penalty: rules.warPenalty,
        cwl_star: rules.cwlStar,
        cwl_destruction: rules.cwlDestruction,
        cwl_penalty: rules.cwlPenalty,
        raid_attack: rules.raidAttack,
        cg_ratio: rules.cgRatio,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Supabase scoring rules update error:", err);
    }
  }

  const store = readLocalStore();
  store.rules = rules;

  // Recalculate all players
  store.players.forEach((p) => {
    p.masterScore = calculateMasterScore(p, rules);
  });
  store.players.sort((a, b) => (b.masterScore ?? 0) - (a.masterScore ?? 0));
  store.players.forEach((p, idx) => {
    p.rank = idx + 1;
  });

  writeLocalStore(store);
}

export async function getClanInfo(): Promise<ClanInfo | null> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase.from("clan_metadata").select("*").limit(1).single();
      if (!error && data) {
        return {
          tag: data.clan_tag,
          name: data.name,
          level: data.level,
          membersCount: data.members_count,
          warState: data.war_state,
          warWinStreak: data.war_win_streak,
          warWins: data.war_wins,
          warTies: data.war_ties,
          warLosses: data.war_losses,
        };
      }
    } catch {
      // fallback
    }
  }
  const store = readLocalStore();
  return store.clan;
}

export async function getLeaderboard(): Promise<PlayerRecord[]> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .order("master_score", { ascending: false });
      if (!error && data && data.length > 0) {
        return data.map((d, idx) => ({
          tag: d.player_tag,
          name: d.name,
          role: d.role,
          th: d.town_hall_level,
          trophies: d.trophies,
          rank: d.rank ?? idx + 1,
          trend: d.rank_trend ?? 0,
          masterScore: d.master_score,
          warStars: d.war_stars,
          warDest: Number(d.war_dest_pct) || 0,
          raidAtks: d.raid_attacks,
          cgPoints: d.cg_points,
          missed: d.missed_attacks,
          lastSyncedAt: d.last_synced_at,
        }));
      }
    } catch {
      // fallback
    }
  }
  const store = readLocalStore();
  return store.players;
}

interface ApiClanMember {
  tag: string;
  name: string;
  role?: string;
  townHallLevel?: number;
  trophies?: number;
}

interface ApiClanPayload {
  tag: string;
  name: string;
  clanLevel?: number;
  members?: number;
  badgeUrls?: { large?: string; medium?: string; small?: string };
  warWinStreak?: number;
  warWins?: number;
  warTies?: number;
  warLosses?: number;
  clanPoints?: number;
  requiredTrophies?: number;
  memberList?: ApiClanMember[];
}

interface WarAttack {
  attackerTag?: string;
  defenderTag?: string;
  stars?: number;
  destructionPercentage?: number;
  order?: number;
}

interface WarMember {
  tag: string;
  name?: string;
  townhallLevel?: number;
  attacks?: WarAttack[];
}

interface CurrentWarPayload {
  state?: string;
  teamSize?: number;
  attacksPerMember?: number;
  clan?: {
    tag?: string;
    name?: string;
    attacks?: number;
    stars?: number;
    destructionPercentage?: number;
    members?: WarMember[];
  };
  opponent?: {
    tag?: string;
    name?: string;
    stars?: number;
    destructionPercentage?: number;
  };
}
interface RaidSeasonMember {
  tag: string;
  name: string;
  attacks: number;
  attackLimit: number;
  bonusAttackLimit: number;
  capitalResourcesLooted: number;
}

interface RaidSeasonPayload {
  items?: Array<{
    state?: string;
    members?: RaidSeasonMember[];
  }>;
}

export async function syncClanFromApi(
  apiClanData: ApiClanPayload,
  currentWarData?: CurrentWarPayload | null,
  raidData?: RaidSeasonPayload | null
) {
  const rules = await getScoringRules();
  const store = readLocalStore();

  const clanInfo: ClanInfo = {
    tag: apiClanData.tag,
    name: apiClanData.name,
    level: apiClanData.clanLevel ?? 1,
    membersCount: apiClanData.members ?? 0,
    badgeUrl: apiClanData.badgeUrls?.large || apiClanData.badgeUrls?.medium,
    warWinStreak: apiClanData.warWinStreak ?? null,
    warWins: apiClanData.warWins ?? null,
    warTies: apiClanData.warTies ?? null,
    warLosses: apiClanData.warLosses ?? null,
    clanPoints: apiClanData.clanPoints,
    requiredTrophies: apiClanData.requiredTrophies,
    warState: currentWarData?.state || "notInWar",
  };

  const existingMap = new Map<string, PlayerRecord>();
  store.players.forEach((p) => existingMap.set(p.tag, p));

  // Build war stats map from current / ended war
  const warMemberMap = new Map<
    string,
    { stars: number; dest: number; attacksCount: number; missed: number }
  >();

  if (currentWarData?.clan?.members) {
    const maxAttacks = currentWarData.attacksPerMember || 2;
    const isWarConcluded = currentWarData.state === "warEnded";

    currentWarData.clan.members.forEach((wm) => {
      const atks = wm.attacks || [];
      const totalStars = atks.reduce((acc, a) => acc + (a.stars || 0), 0);
      const avgDest =
        atks.length > 0
          ? Math.round(
              atks.reduce((acc, a) => acc + (a.destructionPercentage || 0), 0) / atks.length
            )
          : 0;
      const missed = isWarConcluded ? Math.max(0, maxAttacks - atks.length) : 0;

      warMemberMap.set(wm.tag, {
        stars: totalStars,
        dest: avgDest,
        attacksCount: atks.length,
        missed,
      });
    });
  }

  // Build raid stats map from most recent raid season
  const raidMemberMap = new Map<string, number>();
  const latestRaid = raidData?.items?.[0];
  if (latestRaid?.members) {
    latestRaid.members.forEach((rm) => {
      raidMemberMap.set(rm.tag, rm.attacks);
    });
  }

  const memberList: ApiClanMember[] = apiClanData.memberList || [];
  const updatedPlayers: PlayerRecord[] = memberList.map((m: ApiClanMember) => {
    const existing = existingMap.get(m.tag);
    const warStats = warMemberMap.get(m.tag);

    // If war data exists for this member, use it; otherwise preserve existing or null
    const warStars = warStats !== undefined ? warStats.stars : (existing?.warStars ?? null);
    const warDest = warStats !== undefined ? warStats.dest : (existing?.warDest ?? null);
    const raidAtks = raidMemberMap.has(m.tag) ? raidMemberMap.get(m.tag)! : (existing?.raidAtks ?? null);
    const cgPoints = existing?.cgPoints ?? null;
    const missed = warStats !== undefined ? warStats.missed : (existing?.missed ?? 0);

    const player: PlayerRecord = {
      tag: m.tag,
      name: m.name,
      role: m.role
        ? m.role === "admin"
          ? "Elder"
          : m.role === "coLeader"
          ? "Co-Leader"
          : m.role === "leader"
          ? "Leader"
          : "Member"
        : "Member",
      th: m.townHallLevel ?? null,
      trophies: m.trophies ?? null,
      rank: null,
      trend: existing?.trend ?? 0,
      warStars,
      warDest,
      raidAtks,
      cgPoints,
      missed,
      masterScore: null,
      lastSyncedAt: new Date().toISOString(),
    };

    // Calculate master score only if player has any recorded stats
    const hasStats = warStars !== null || raidAtks !== null || cgPoints !== null;
    player.masterScore = hasStats ? calculateMasterScore(player, rules) : 0;
    return player;
  });

  // Sort by master score (or trophies if scores are equal)
  updatedPlayers.sort((a, b) => {
    const scoreDiff = (b.masterScore ?? 0) - (a.masterScore ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.trophies ?? 0) - (a.trophies ?? 0);
  });

  updatedPlayers.forEach((p, idx) => {
    p.rank = idx + 1;
  });

  store.clan = clanInfo;
  store.players = updatedPlayers;
  writeLocalStore(store);

  // Sync to Supabase if connected
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from("clan_metadata").upsert({
        clan_tag: clanInfo.tag,
        name: clanInfo.name,
        level: clanInfo.level,
        members_count: clanInfo.membersCount,
        war_state: clanInfo.warState,
        war_win_streak: clanInfo.warWinStreak,
        war_wins: clanInfo.warWins,
        war_ties: clanInfo.warTies,
        war_losses: clanInfo.warLosses,
        last_synced_at: new Date().toISOString(),
      });

      for (const p of updatedPlayers) {
        await supabase.from("players").upsert({
          player_tag: p.tag,
          name: p.name,
          role: p.role,
          town_hall_level: p.th || 1,
          trophies: p.trophies || 0,
          war_stars: p.warStars || 0,
          war_dest_pct: p.warDest || 0,
          raid_attacks: p.raidAtks || 0,
          cg_points: p.cgPoints || 0,
          missed_attacks: p.missed || 0,
          master_score: p.masterScore || 0,
          rank: p.rank,
          rank_trend: p.trend || 0,
          last_synced_at: p.lastSyncedAt,
        });
      }
    } catch (err) {
      console.error("Supabase sync write error:", err);
    }
  }

  return { clan: clanInfo, players: updatedPlayers };
}

export async function applyClanGamesOcrPoints(ocrItems: Array<{ tag?: string | null; name: string; points: number }>) {
  const rules = await getScoringRules();
  const store = readLocalStore();
  let updatedCount = 0;

  for (const item of ocrItems) {
    const target = store.players.find((p) => (item.tag && p.tag === item.tag) || p.name.toLowerCase() === item.name.toLowerCase());
    if (target) {
      target.cgPoints = item.points;
      target.masterScore = calculateMasterScore(target, rules);
      updatedCount++;
    }
  }

  // Re-rank
  store.players.sort((a, b) => (b.masterScore ?? 0) - (a.masterScore ?? 0));
  store.players.forEach((p, idx) => {
    p.rank = idx + 1;
  });

  writeLocalStore(store);

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      for (const p of store.players) {
        await supabase.from("players").update({
          cg_points: p.cgPoints || 0,
          master_score: p.masterScore || 0,
          rank: p.rank,
        }).eq("player_tag", p.tag);
      }
    } catch (err) {
      console.error("Supabase OCR update error:", err);
    }
  }

  return { updatedCount, players: store.players };
}

export async function adjustPlayerPenalty(playerTag: string, deltaMissed: number) {
  const rules = await getScoringRules();
  const store = readLocalStore();
  const player = store.players.find((p) => p.tag === playerTag);
  if (!player) return null;

  player.missed = Math.max(0, (player.missed ?? 0) + deltaMissed);
  player.masterScore = calculateMasterScore(player, rules);

  store.players.sort((a, b) => (b.masterScore ?? 0) - (a.masterScore ?? 0));
  store.players.forEach((p, idx) => {
    p.rank = idx + 1;
  });

  writeLocalStore(store);

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from("players").update({
        missed_attacks: player.missed,
        master_score: player.masterScore,
        rank: player.rank,
      }).eq("player_tag", player.tag);
    } catch (err) {
      console.error("Supabase penalty update error:", err);
    }
  }

  return player;
}
