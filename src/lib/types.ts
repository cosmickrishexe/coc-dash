export interface ScoringRules {
  warStar: number;
  warDestruction: number;
  warPenalty: number;
  cwlStar: number;
  cwlDestruction: number;
  cwlPenalty: number;
  raidAttack: number;
  cgRatio: number;
}

export const DEFAULT_RULES: ScoringRules = {
  warStar: 10,
  warDestruction: 1,
  warPenalty: -30,
  cwlStar: 15,
  cwlDestruction: 2,
  cwlPenalty: -50,
  raidAttack: 10,
  cgRatio: 10,
};

export interface PlayerRecord {
  tag: string;
  name: string;
  role: string;
  th: number | null;
  trophies: number | null;
  rank: number | null;
  trend: number | null;
  masterScore: number | null;
  warStars: number | null;
  warDest: number | null;
  raidAtks: number | null;
  cgPoints: number | null;
  missed: number | null;
  lastSyncedAt?: string;
}

export interface ClanInfo {
  tag: string;
  name: string;
  level: number | null;
  membersCount: number | null;
  badgeUrl?: string;
  warWinStreak: number | null;
  warWins: number | null;
  warTies: number | null;
  warLosses: number | null;
  warState?: string;
  clanPoints?: number;
  requiredTrophies?: number;
}

export interface OcrResultItem {
  player_name: string;
  player_tag: string | null;
  points_earned: number;
  matched?: boolean;
  masterBonus?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  clientIp?: string;
}
