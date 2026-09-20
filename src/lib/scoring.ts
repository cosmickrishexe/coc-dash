import { PlayerRecord, ScoringRules } from "./types";

export function calculateMasterScore(member: Partial<PlayerRecord>, rules: ScoringRules): number {
  // If no performance data has been indexed yet, return 0 or null
  const stars = member.warStars ?? 0;
  const dest = member.warDest ?? 0;
  const th = member.th ?? 14;
  const raid = member.raidAtks ?? 0;
  const cg = member.cgPoints ?? 0;
  const missed = member.missed ?? 0;

  // Regular War component: stars * weight + floor(dest% / 10) * weight
  const warScore = (stars * rules.warStar) + Math.floor((dest / 10) * rules.warDestruction);

  // CWL component (multiplier by TH level)
  const cwlMult = th >= 17 ? 1.3 : (th === 16 ? 1.2 : (th === 15 ? 1.1 : 1.0));
  const cwlScore = Math.floor(stars * 1.5 * rules.cwlStar * cwlMult);

  // Raid Weekend component: +10 pts per attack (max 6 attacks = 60 pts)
  const raidScore = raid * rules.raidAttack;

  // Clan Games component: points / ratio (max 4000 pts / 10 = 400 pts)
  const cgScore = Math.min(400, Math.floor(cg / rules.cgRatio));

  // Missed war attack penalties
  const penaltyScore = missed * Math.abs(rules.warPenalty);

  const total = warScore + cwlScore + raidScore + cgScore - penaltyScore;
  return Math.max(0, total);
}
