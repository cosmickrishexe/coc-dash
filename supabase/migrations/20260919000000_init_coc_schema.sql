-- ====================================================================
-- Clash of Clans Performance Dashboard: Database Schema
-- Adheres to Supabase Postgres Best Practices & Canonical Specifications
-- ====================================================================

-- 1. Players Master Table
CREATE TABLE IF NOT EXISTS public.players (
    player_tag TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Member',
    town_hall_level INTEGER NOT NULL DEFAULT 1,
    trophies INTEGER NOT NULL DEFAULT 0,
    war_stars INTEGER NOT NULL DEFAULT 0,
    war_dest_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    raid_attacks INTEGER NOT NULL DEFAULT 0,
    cg_points INTEGER NOT NULL DEFAULT 0,
    missed_attacks INTEGER NOT NULL DEFAULT 0,
    master_score INTEGER NOT NULL DEFAULT 0,
    rank INTEGER,
    rank_trend INTEGER NOT NULL DEFAULT 0,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for instant leaderboard retrieval (write-heavy, read-light architecture)
CREATE INDEX IF NOT EXISTS idx_players_master_score_desc 
ON public.players (master_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_players_role 
ON public.players (role);

CREATE INDEX IF NOT EXISTS idx_players_th 
ON public.players (town_hall_level);

-- 2. War Performance History Table
CREATE TABLE IF NOT EXISTS public.war_performance (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_tag TEXT NOT NULL REFERENCES public.players(player_tag) ON DELETE CASCADE,
    war_id TEXT NOT NULL,
    war_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    opponent_clan TEXT,
    attacks_used INTEGER NOT NULL DEFAULT 0 CHECK (attacks_used >= 0 AND attacks_used <= 2),
    stars_earned INTEGER NOT NULL DEFAULT 0 CHECK (stars_earned >= 0 AND stars_earned <= 6),
    destruction_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (destruction_pct >= 0 AND destruction_pct <= 100),
    missed_attacks INTEGER NOT NULL DEFAULT 0 CHECK (missed_attacks >= 0 AND missed_attacks <= 2),
    is_cwl BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_war_performance_player_tag 
ON public.war_performance (player_tag);

CREATE INDEX IF NOT EXISTS idx_war_performance_war_date 
ON public.war_performance (war_date DESC);

-- 3. Raid Weekends Table
CREATE TABLE IF NOT EXISTS public.raid_weekends (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_tag TEXT NOT NULL REFERENCES public.players(player_tag) ON DELETE CASCADE,
    weekend_date DATE NOT NULL,
    attacks_used INTEGER NOT NULL DEFAULT 0 CHECK (attacks_used >= 0 AND attacks_used <= 6),
    capital_gold_looted INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_player_weekend UNIQUE (player_tag, weekend_date)
);

CREATE INDEX IF NOT EXISTS idx_raid_weekends_player_tag 
ON public.raid_weekends (player_tag);

-- 4. Clan Games OCR Extraction History Table
CREATE TABLE IF NOT EXISTS public.clan_games (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_tag TEXT NOT NULL REFERENCES public.players(player_tag) ON DELETE CASCADE,
    season_month TEXT NOT NULL,
    points_earned INTEGER NOT NULL DEFAULT 0 CHECK (points_earned >= 0 AND points_earned <= 4000),
    extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_player_season UNIQUE (player_tag, season_month)
);

CREATE INDEX IF NOT EXISTS idx_clan_games_player_tag 
ON public.clan_games (player_tag);

-- 5. Scoring Engine Rules Configuration Table (Guarded by PIN 9449)
CREATE TABLE IF NOT EXISTS public.scoring_rules (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    war_star INTEGER NOT NULL DEFAULT 10,
    war_destruction INTEGER NOT NULL DEFAULT 1,
    war_penalty INTEGER NOT NULL DEFAULT -30,
    cwl_star INTEGER NOT NULL DEFAULT 15,
    cwl_destruction INTEGER NOT NULL DEFAULT 2,
    cwl_penalty INTEGER NOT NULL DEFAULT -50,
    raid_attack INTEGER NOT NULL DEFAULT 10,
    cg_ratio INTEGER NOT NULL DEFAULT 10,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default singleton rule if not present
INSERT INTO public.scoring_rules (id, war_star, war_destruction, war_penalty, cwl_star, cwl_destruction, cwl_penalty, raid_attack, cg_ratio)
VALUES (1, 10, 1, -30, 15, 2, -50, 10, 10)
ON CONFLICT (id) DO NOTHING;

-- 6. Clan Sync Metadata / State Table
CREATE TABLE IF NOT EXISTS public.clan_metadata (
    clan_tag TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    members_count INTEGER NOT NULL DEFAULT 0,
    war_state TEXT,
    war_win_streak INTEGER NOT NULL DEFAULT 0,
    war_wins INTEGER NOT NULL DEFAULT 0,
    war_ties INTEGER NOT NULL DEFAULT 0,
    war_losses INTEGER NOT NULL DEFAULT 0,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Security: Enable Row Level Security (RLS) on all exposed tables
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.war_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raid_weekends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_metadata ENABLE ROW LEVEL SECURITY;

-- Read policies for public / anon (single admin personal dashboard view)
CREATE POLICY "Allow public read on players" ON public.players FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read on war_performance" ON public.war_performance FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read on raid_weekends" ON public.raid_weekends FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read on clan_games" ON public.clan_games FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read on scoring_rules" ON public.scoring_rules FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read on clan_metadata" ON public.clan_metadata FOR SELECT TO anon, authenticated USING (true);
