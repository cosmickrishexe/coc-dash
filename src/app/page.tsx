"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { ClanInfo, DEFAULT_RULES, OcrResultItem, PlayerRecord, ScoringRules } from "@/lib/types";

export default function DashboardPage() {
  // --- Core State ---
  const [clan, setClan] = useState<ClanInfo | null>(null);
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [rules, setRules] = useState<ScoringRules>(DEFAULT_RULES);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>("Not synced");

  // --- Filtering & Sorting ---
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [thFilter, setThFilter] = useState<string>("ALL");
  const [penaltyFilter, setPenaltyFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<string>("master_score");
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // --- Modals & Slide-Overs ---
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRecord | null>(null);
  const [rulesModalOpen, setRulesModalOpen] = useState<boolean>(false);
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [warPanelOpen, setWarPanelOpen] = useState<boolean>(false);
  const [warData, setWarData] = useState<{
    state: string;
    teamSize: number;
    attacksPerMember: number;
    startTime: string | null;
    endTime: string | null;
    clanName: string | null;
    clanStars: number;
    clanDestruction: number;
    clanAttacks: number;
    opponentName: string | null;
    opponentTag: string | null;
    opponentStars: number;
    opponentDestruction: number;
    warMembers: Array<{
      tag: string;
      name: string;
      townhallLevel: number;
      totalStars: number;
      avgDestruction: number;
      attacksMade: number;
      attacksMissed: number;
      attacks: Array<{ stars: number; destructionPercentage: number; defenderTag: string; order: number }>;
    }>;
    warLog: Array<{
      result: string;
      endTime: string | null;
      teamSize: number;
      clanStars: number;
      clanDestruction: number;
      opponentName: string;
      opponentTag: string;
      opponentStars: number;
      opponentDestruction: number;
    }>;
  } | null>(null);
  const [warLoading, setWarLoading] = useState<boolean>(false);

  // --- Rules Password Gate State (PIN Protected) ---
  const [isRulesUnlocked, setIsRulesUnlocked] = useState<boolean>(false);
  const [rulesPasswordInput, setRulesPasswordInput] = useState<string>("");
  const [rulesAuthError, setRulesAuthError] = useState<boolean>(false);
  const [tempRules, setTempRules] = useState<ScoringRules>(DEFAULT_RULES);

  // --- Dynamic Supercell API & IP Whitelist State ---
  const [detectedPublicIp, setDetectedPublicIp] = useState<string>("106.192.233.235");
  const [cocApiTokenInput, setCocApiTokenInput] = useState<string>("");
  const [clanTagInput, setClanTagInput] = useState<string>("#2QVJ990GL");
  const [apiSaving, setApiSaving] = useState<boolean>(false);
  const [apiSaveResult, setApiSaveResult] = useState<{
    status: "idle" | "connected" | "ip_mismatch" | "invalid_token" | "error";
    message: string;
    requiredIp?: string;
  }>({ status: "idle", message: "" });

  // --- Gemini OCR Upload State ---
  const [ocrStep, setOcrStep] = useState<"upload" | "scanning" | "results">("upload");
  const [ocrLog, setOcrLog] = useState<string[]>([]);
  const [ocrResults, setOcrResults] = useState<OcrResultItem[]>([]);
  const [ocrLoading, setOcrLoading] = useState<boolean>(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Toasts ---
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type?: "info" | "error" | "success" }>>([]);

  const addToast = (message: string, type: "info" | "error" | "success" = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const loadApiConfig = async () => {
    try {
      const res = await fetch("/api/clan/config");
      const json = await res.json();
      if (json.success && json.data) {
        if (json.data.publicIp) setDetectedPublicIp(json.data.publicIp);
        if (json.data.clanTag) setClanTagInput(json.data.clanTag);
      }
    } catch {
      // ignore
    }
  };

  // --- Fetch Leaderboard Data on Mount ---
  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/clan/leaderboard");
      const json = await res.json();
      if (json.success && json.data) {
        setClan(json.data.clan);
        setPlayers(json.data.players || []);
        if (json.data.rules) {
          setRules(json.data.rules);
          setTempRules(json.data.rules);
        }
      }
      loadApiConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading data";
      addToast("Failed to load clan data: " + msg, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaderboard();
  }, []);

  // --- Sync from Supercell API ---
  const handleSyncApi = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/clan/sync", { method: "POST" });
      const json = await res.json();

      if (json.success && json.data) {
        setClan(json.data.clan);
        setPlayers(json.data.players || []);
        setLastSyncTime("Just now");
        addToast(json.message || "Successfully synchronized clan data!", "success");
        // If war data was also synced, auto-fetch war details
        if (json.data.warState && json.data.warState !== "notInWar") {
          handleFetchWar();
        }
      } else {
        if (json.instructions) {
          alert(`⚠️ Supercell API Authorization Alert:\n\n${json.instructions}`);
        }
        addToast(json.error || "Sync failed", "error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      addToast("Network error syncing with Supercell: " + msg, "error");
    } finally {
      setSyncing(false);
    }
  };

  // --- Fetch War Details ---
  const handleFetchWar = async () => {
    setWarLoading(true);
    try {
      const res = await fetch("/api/clan/war");
      const json = await res.json();

      if (json.success && json.data) {
        setWarData(json.data);
        setWarPanelOpen(true);
        const st = json.data.state;
        if (st === "warEnded") {
          addToast(`War data loaded — ${json.data.warMembers?.length ?? 0} members' attacks imported.`, "success");
        } else if (st === "inWar") {
          addToast("Live war in progress — attack data loaded.", "info");
        } else if (st === "notInWar") {
          addToast("Clan is not currently in war.", "info");
        }
      } else {
        if (json.instructions) {
          alert(`⚠️ Supercell API Alert:\n\n${json.instructions}`);
        }
        addToast(json.error || "Could not fetch war data", "error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      addToast("Error fetching war data: " + msg, "error");
    } finally {
      setWarLoading(false);
    }
  };

  // --- Filtered and Sorted Members ---
  const filteredPlayers = useMemo(() => {
    return players
      .filter((p) => {
        // Search query
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const matchName = p.name.toLowerCase().includes(q);
          const matchTag = p.tag.toLowerCase().includes(q);
          if (!matchName && !matchTag) return false;
        }
        // Role filter
        if (roleFilter !== "ALL" && p.role !== roleFilter) return false;
        // TH filter
        if (thFilter !== "ALL" && p.th !== null && `TH${p.th}` !== thFilter) return false;
        // Penalty filter
        if (penaltyFilter === "WITH_PENALTY" && (p.missed === null || p.missed === 0)) return false;
        if (penaltyFilter === "CLEAN" && p.missed !== null && p.missed > 0) return false;

        return true;
      })
      .sort((a, b) => {
        let valA: number = 0;
        let valB: number = 0;

        if (sortField === "master_score") {
          valA = a.masterScore ?? 0;
          valB = b.masterScore ?? 0;
        } else if (sortField === "war_stars") {
          valA = a.warStars ?? 0;
          valB = b.warStars ?? 0;
        } else if (sortField === "raid_attacks") {
          valA = a.raidAtks ?? 0;
          valB = b.raidAtks ?? 0;
        } else if (sortField === "clan_games") {
          valA = a.cgPoints ?? 0;
          valB = b.cgPoints ?? 0;
        } else if (sortField === "trophies") {
          valA = a.trophies ?? 0;
          valB = b.trophies ?? 0;
        } else if (sortField === "penalties") {
          valA = a.missed ?? 0;
          valB = b.missed ?? 0;
        }

        return sortAsc ? valA - valB : valB - valA;
      });
  }, [players, searchQuery, roleFilter, thFilter, penaltyFilter, sortField, sortAsc]);

  // Pagination Slice
  const totalFiltered = filteredPlayers.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPlayers.slice(start, start + pageSize);
  }, [filteredPlayers, currentPage, pageSize]);

  // Handle Sort Toggle
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
    setCurrentPage(1);
  };

  // --- Rules Password Gate Handlers ---
  const handleUnlockRules = () => {
    if (rulesPasswordInput === "9449") {
      setIsRulesUnlocked(true);
      setRulesAuthError(false);
      setRulesPasswordInput("");
      addToast("Admin authorization confirmed: Controls unlocked.", "success");
      loadApiConfig();
    } else {
      setRulesAuthError(true);
      addToast("Access Denied: Incorrect password.", "error");
    }
  };

  const handleLockRules = () => {
    setIsRulesUnlocked(false);
    setRulesAuthError(false);
    addToast("Admin controls returned to read-only view.", "info");
  };

  const handleSaveCocApi = async () => {
    if (!isRulesUnlocked) {
      addToast("Admin password required to update API credentials.", "error");
      return;
    }
    if (!cocApiTokenInput.trim()) {
      addToast("Please paste your Supercell API token.", "error");
      return;
    }

    setApiSaving(true);
    try {
      const res = await fetch("/api/clan/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: "9449",
          cocApiToken: cocApiTokenInput.trim(),
          clanTag: clanTagInput.trim(),
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setApiSaveResult({
          status: json.data.connectionStatus,
          message: json.data.testMessage,
          requiredIp: json.data.requiredIp,
        });

        if (json.data.connectionStatus === "connected") {
          addToast("Supercell API token updated & verified! Syncing clan...", "success");
          handleSyncApi();
        } else if (json.data.connectionStatus === "ip_mismatch") {
          addToast("Token saved, but Supercell requires IP whitelisting.", "error");
        } else {
          addToast(json.data.testMessage || "Token saved", "info");
        }
      } else {
        setApiSaveResult({
          status: "error",
          message: json.error || "Failed to update token",
        });
        addToast(json.error || "Failed to update token", "error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setApiSaveResult({ status: "error", message: msg });
      addToast("Network error: " + msg, "error");
    } finally {
      setApiSaving(false);
    }
  };

  const handleSaveRules = async () => {
    if (!isRulesUnlocked) {
      addToast("Admin password required to modify scoring rules.", "error");
      return;
    }

    try {
      const res = await fetch("/api/clan/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: "9449",
          rules: tempRules,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setRules(tempRules);
        setRulesModalOpen(false);
        addToast("Updated scoring weights & recalculated all master scores!", "success");
        loadLeaderboard();
      } else {
        addToast(json.error || "Failed to save rules", "error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving rules";
      addToast("Error saving rules: " + msg, "error");
    }
  };

  const handleResetRules = () => {
    if (!isRulesUnlocked) {
      addToast("Admin password required to reset defaults.", "error");
      return;
    }
    setTempRules(DEFAULT_RULES);
    addToast("Scoring parameters reset to defaults.", "info");
  };

  // --- Gemini Flash OCR Flow ---
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrStep("scanning");
    setOcrLoading(true);
    setOcrError(null);
    setOcrLog(["> Initializing Gemini Flash Vision (v3.6) OCR pipeline..."]);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;

      setTimeout(() => {
        setOcrLog((prev) => [
          ...prev,
          "> Ingesting screenshot bounding boxes & event board rows...",
          "> Running multimodal OCR on player tags and Clan Games points...",
        ]);
      }, 700);

      setTimeout(() => {
        setOcrLog((prev) => [
          ...prev,
          "> Generating structured JSON according to Supercell Clan Games schema...",
          "> Correlating extracted players with active clan roster...",
        ]);
      }, 1400);

      try {
        const res = await fetch("/api/clan/upload-clan-games", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: base64,
            mimeType: file.type || "image/png",
          }),
        });

        const json = await res.json();
        if (json.success && json.data) {
          setOcrResults(json.data);
          setOcrStep("results");
          addToast(`Gemini extracted ${json.data.length} player rows successfully!`, "success");
        } else {
          setOcrError(json.error || "Failed to parse screenshot");
          setOcrStep("upload");
          addToast(json.error || "OCR extraction failed", "error");
        }
      } catch (err: any) {
        setOcrError(err.message);
        setOcrStep("upload");
        addToast("Error calling Gemini Vision API: " + err.message, "error");
      } finally {
        setOcrLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCommitOcr = async () => {
    try {
      const res = await fetch("/api/clan/upload-clan-games", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: ocrResults }),
      });
      const json = await res.json();
      if (json.success) {
        addToast(json.message || "Committed Clan Games points!", "success");
        setUploadModalOpen(false);
        setOcrStep("upload");
        setOcrResults([]);
        loadLeaderboard();
      } else {
        addToast(json.error || "Failed to commit OCR scores", "error");
      }
    } catch (err: any) {
      addToast("Network error committing OCR points: " + err.message, "error");
    }
  };

  // --- Penalty Adjustment Handlers ---
  const handleAdjustPenalty = async (delta: number) => {
    if (!selectedPlayer) return;
    try {
      const res = await fetch("/api/clan/penalties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerTag: selectedPlayer.tag,
          deltaMissed: delta,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setSelectedPlayer(json.data);
        addToast(`Updated penalty for ${selectedPlayer.name}`, "success");
        loadLeaderboard();
      }
    } catch (err: any) {
      addToast("Failed to update penalty: " + err.message, "error");
    }
  };

  // Top KPIs
  const topPlayer = players.length > 0 ? players[0] : null;
  const clanAvgScore = useMemo(() => {
    if (players.length === 0) return null;
    const scored = players.filter((p) => p.masterScore !== null && p.masterScore > 0);
    if (scored.length === 0) return null;
    const total = scored.reduce((acc, p) => acc + (p.masterScore ?? 0), 0);
    return Math.round(total / scored.length);
  }, [players]);

  const totalRaidAttacks = useMemo(() => {
    const recorded = players.filter((p) => p.raidAtks !== null);
    if (recorded.length === 0) return null;
    return recorded.reduce((acc, p) => acc + (p.raidAtks ?? 0), 0);
  }, [players]);

  const totalCgPoints = useMemo(() => {
    const recorded = players.filter((p) => p.cgPoints !== null);
    if (recorded.length === 0) return null;
    return recorded.reduce((acc, p) => acc + (p.cgPoints ?? 0), 0);
  }, [players]);

  const penalizedCount = players.filter((p) => p.missed !== null && p.missed > 0).length;

  return (
    <div className="flex h-screen w-full bg-surface text-on-surface overflow-hidden">
      
      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 border rounded-xl shadow-lg text-xs font-mono transition-all ${
              t.type === "error"
                ? "bg-rose-50 border-rose-300 text-rose-800"
                : t.type === "success"
                ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                : "bg-surface-container-lowest border-outline-variant text-on-surface"
            }`}
          >
            <span className="material-symbols-outlined text-sm">
              {t.type === "error" ? "error" : t.type === "success" ? "check_circle" : "info"}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* ================= 1. DOCKED LEFT SIDEBAR ================= */}
      <aside className="w-64 border-r border-outline-variant bg-surface-container-lowest flex flex-col justify-between shrink-0 select-none">
        <div>
          {/* Clan Brand Rail */}
          <div className="p-4 border-b border-outline-variant flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-low border border-dashed border-outline flex items-center justify-center font-mono font-bold text-primary text-base">
              {clan?.badgeUrl ? (
                <img src={clan.badgeUrl} alt="Emblem" className="w-8 h-8 object-contain" />
              ) : (
                "🛡️"
              )}
            </div>
            <div className="overflow-hidden">
              <h1 className="font-bold text-xs truncate text-on-surface">
                {clan?.name || "--"}
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-surface-container-high rounded text-on-surface-variant">
                  {clan?.level ? `Lvl ${clan.level}` : "Lvl --"}
                </span>
                <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>{clan?.warState || "Sync Ready"}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            <button
              onClick={() => {
                setActiveCategory("all");
                setSortField("master_score");
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                activeCategory === "all"
                  ? "bg-surface-container-low border border-outline-variant text-on-surface font-semibold"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-base">leaderboard</span>
              <span className="flex-1">Master Leaderboard</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-surface-container-high">
                {players.length || "--"}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveCategory("wars");
                setSortField("war_stars");
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                activeCategory === "wars"
                  ? "bg-surface-container-low border border-outline-variant text-on-surface font-semibold"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-base">swords</span>
              <span className="flex-1">Clan Wars & CWL</span>
            </button>

            <button
              onClick={() => {
                setActiveCategory("raids");
                setSortField("raid_attacks");
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                activeCategory === "raids"
                  ? "bg-surface-container-low border border-outline-variant text-on-surface font-semibold"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-base">fort</span>
              <span className="flex-1">Raid Weekends</span>
            </button>

            <button
              onClick={() => {
                setActiveCategory("clan_games");
                setSortField("clan_games");
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                activeCategory === "clan_games"
                  ? "bg-surface-container-low border border-outline-variant text-on-surface font-semibold"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-base">military_tech</span>
              <span className="flex-1">Clan Games OCR</span>
              <span className="text-[10px] font-mono text-primary font-bold">AI</span>
            </button>

            <button
              onClick={() => setRulesModalOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-all text-left"
            >
              <span className="material-symbols-outlined text-base">tune</span>
              <span className="flex-1">Scoring Engine Rules</span>
              <span className="text-[10px] font-mono text-outline">PIN</span>
            </button>
          </nav>

          {/* Primary CTA */}
          <div className="p-3">
            <button
              onClick={() => setUploadModalOpen(true)}
              className="w-full py-2.5 px-3 bg-primary hover:bg-slate-700 text-on-primary rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-base">document_scanner</span>
              <span>+ Upload Clan Games</span>
            </button>
          </div>
        </div>

        {/* Sidebar Footer: Engine Status & Admin Pill */}
        <div className="p-3 border-t border-outline-variant space-y-3">
          {/* Status micro-card */}
          <div className="p-2.5 bg-surface-container-low border border-outline-variant rounded-xl text-[11px] font-mono space-y-1">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span>Supercell API:</span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Active
              </span>
            </div>
            <div className="flex items-center justify-between text-on-surface-variant">
              <span>Last Synced:</span>
              <span className="text-on-surface font-medium">{lastSyncTime}</span>
            </div>
          </div>

          {/* Admin Profile Pill */}
          <div className="p-2 bg-surface-container-low border border-outline-variant rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-surface-container-high border border-outline flex items-center justify-center font-mono font-bold text-xs text-primary">
                👑
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-on-surface">Leader Admin</span>
                <span className="text-[10px] font-mono text-on-surface-variant">Single Operator</span>
              </div>
            </div>
            <button
              onClick={() => setRulesModalOpen(true)}
              className="p-1 hover:bg-surface-container-high rounded text-outline hover:text-on-surface transition-colors"
              title="Configure scoring rules"
            >
              <span className="material-symbols-outlined text-base">settings</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ================= 2. MAIN WORKSPACE ================= */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* Top Global Header */}
        <header className="h-14 border-b border-outline-variant bg-surface-container-lowest px-6 flex items-center justify-between shrink-0 gap-4">
          
          {/* Search Bar */}
          <div className="relative w-80">
            <span className="material-symbols-outlined absolute left-2.5 top-2 text-outline text-lg">
              search
            </span>
            <input
              type="text"
              placeholder="Filter by player name or #tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-7 bg-surface-container-low border border-outline-variant rounded-lg text-xs font-mono placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-2 text-outline hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>

          {/* Active Breadcrumb / View Badge */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs px-2.5 py-1 bg-surface-container-low border border-outline-variant rounded-full font-semibold text-on-surface">
              {activeCategory === "wars"
                ? "View: Clan Wars & CWL"
                : activeCategory === "raids"
                ? "View: Raid Weekends"
                : activeCategory === "clan_games"
                ? "View: Clan Games (Gemini OCR)"
                : "View: Master Leaderboard"}
            </span>
            <span className="text-xs font-mono text-on-surface-variant">
              Tag: {clan?.tag || process.env.NEXT_PUBLIC_CLAN_TAG || "#2QVJ990GL"}
            </span>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRulesModalOpen(true)}
              className="h-8 px-3 text-on-surface bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">tune</span>
              <span>Scoring Rules</span>
            </button>

            <button
              onClick={handleSyncApi}
              disabled={syncing}
              className="h-8 px-3 text-on-primary bg-primary hover:bg-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-sm ${syncing ? "animate-spin" : ""}`}>
                sync
              </span>
              <span>{syncing ? "Syncing..." : "Sync API"}</span>
            </button>

            <button
              onClick={handleFetchWar}
              disabled={warLoading}
              className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-sm ${warLoading ? "animate-spin" : ""}`}>
                {warLoading ? "sync" : "shield"}
              </span>
              <span>{warLoading ? "Loading..." : "War Data"}</span>
            </button>

            <button
              onClick={() => setUploadModalOpen(true)}
              className="h-8 px-3 bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">auto_awesome</span>
              <span>AI OCR Scan</span>
            </button>
          </div>
        </header>

        {/* Scrollable Canvas */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Clan Hero Identity Banner */}
          <div className="p-5 bg-surface-container-lowest border border-outline-variant rounded-2xl flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-surface-container-low border border-dashed border-outline flex items-center justify-center font-mono font-bold text-2xl text-primary">
                {clan?.badgeUrl ? (
                  <img src={clan.badgeUrl} alt="Badge" className="w-11 h-11 object-contain" />
                ) : (
                  "⚔️"
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-base text-on-surface">{clan?.name || "--"}</h2>
                  <span className="font-mono text-xs text-on-surface-variant">{clan?.tag || "--"}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="px-2 py-0.5 bg-surface-container-low border border-outline-variant rounded-full text-[11px] font-mono font-semibold">
                    {clan?.level ? `Level ${clan.level}` : "Level --"}
                  </span>
                  <span className="px-2 py-0.5 bg-surface-container-low border border-outline-variant rounded-full text-[11px] font-mono font-semibold">
                    Roster: {clan?.membersCount !== null && clan?.membersCount !== undefined ? `${clan.membersCount} / 50 Members` : "-- / 50 Members"}
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-full text-[11px] font-mono font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    {clan?.warState || "War Status: Ready"}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Summary: Clan Average Master Score */}
            <div className="text-right flex flex-col items-end">
              <span className="font-mono text-[11px] text-on-surface-variant font-medium">
                Clan Average Master Score
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="font-mono text-2xl font-bold text-on-surface">
                  {clanAvgScore !== null ? clanAvgScore.toLocaleString() : "--"}
                </span>
                <span className="text-xs font-mono text-on-surface-variant">pts</span>
              </div>
            </div>
          </div>

          {/* Top KPI Grid (4 Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* KPI 1: Top Master Score */}
            <div className="p-4 bg-surface-container-lowest border border-outline-variant rounded-xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-on-surface-variant text-xs font-medium">
                <span>Top Master Score</span>
                <span className="material-symbols-outlined text-amber-700 text-base">military_tech</span>
              </div>
              <div className="my-2">
                <span className="font-mono text-2xl font-bold text-on-surface">
                  {topPlayer?.masterScore !== null && topPlayer?.masterScore !== undefined ? topPlayer.masterScore.toLocaleString() : "--"}
                </span>
                <span className="text-xs font-mono text-on-surface-variant ml-1">pts</span>
              </div>
              <div className="text-[11px] font-mono text-on-surface-variant truncate">
                #1 Member: <strong className="text-on-surface">{topPlayer?.name || "--"}</strong>
              </div>
            </div>

            {/* KPI 2: War Win Record */}
            <div className="p-4 bg-surface-container-lowest border border-outline-variant rounded-xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-on-surface-variant text-xs font-medium">
                <span>War Win Record</span>
                <span className="material-symbols-outlined text-primary text-base">swords</span>
              </div>
              <div className="my-2">
                <span className="font-mono text-2xl font-bold text-on-surface">
                  {clan?.warWins !== null && clan?.warWins !== undefined ? `${clan.warWins} Wins` : "-- Wins"}
                </span>
              </div>
              <div className="text-[11px] font-mono text-on-surface-variant">
                Streak: <strong className="text-on-surface">{clan?.warWinStreak ?? "--"}</strong> • Ties: {clan?.warTies ?? "--"}
              </div>
            </div>

            {/* KPI 3: Raid Participation */}
            <div className="p-4 bg-surface-container-lowest border border-outline-variant rounded-xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-on-surface-variant text-xs font-medium">
                <span>Raid Attacks Used</span>
                <span className="material-symbols-outlined text-primary text-base">fort</span>
              </div>
              <div className="my-2">
                <span className="font-mono text-2xl font-bold text-on-surface">
                  {totalRaidAttacks !== null ? `${totalRaidAttacks} / 300` : "-- / 300"}
                </span>
              </div>
              <div className="text-[11px] font-mono text-on-surface-variant">
                Weight: +{rules.raidAttack} pts per completed attack
              </div>
            </div>

            {/* KPI 4: Clan Games Points */}
            <div className="p-4 bg-surface-container-lowest border border-outline-variant rounded-xl flex flex-col justify-between">
              <div className="flex items-center justify-between text-on-surface-variant text-xs font-medium">
                <span>Clan Games Total</span>
                <span className="material-symbols-outlined text-emerald-700 text-base">auto_awesome</span>
              </div>
              <div className="my-2">
                <span className="font-mono text-2xl font-bold text-on-surface">
                  {totalCgPoints !== null ? totalCgPoints.toLocaleString() : "--"}
                </span>
                <span className="text-xs font-mono text-on-surface-variant ml-1">pts</span>
              </div>
              <div className="text-[11px] font-mono text-on-surface-variant">
                Ratio: 1 pt per {rules.cgRatio} Clan Games score
              </div>
            </div>

          </div>

          {/* Split Workspace: 65% Table / 35% Side Context */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left 8 Cols: Leaderboard Table */}
            <div className="lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-2xl overflow-hidden shadow-xs">
              
              {/* Table Controls Header */}
              <div className="p-4 border-b border-outline-variant space-y-3 bg-surface-container-low">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  
                  {/* Category Buttons */}
                  <div className="inline-flex rounded-lg bg-surface-container-high p-0.5 text-xs font-mono">
                    <button
                      onClick={() => {
                        setActiveCategory("all");
                        setSortField("master_score");
                      }}
                      className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                        activeCategory === "all"
                          ? "bg-white text-on-surface shadow-xs"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      Master Score
                    </button>
                    <button
                      onClick={() => {
                        setActiveCategory("wars");
                        setSortField("war_stars");
                      }}
                      className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                        activeCategory === "wars"
                          ? "bg-white text-on-surface shadow-xs"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      Wars & CWL
                    </button>
                    <button
                      onClick={() => {
                        setActiveCategory("raids");
                        setSortField("raid_attacks");
                      }}
                      className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                        activeCategory === "raids"
                          ? "bg-white text-on-surface shadow-xs"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      Raid Weekends
                    </button>
                    <button
                      onClick={() => {
                        setActiveCategory("clan_games");
                        setSortField("clan_games");
                      }}
                      className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                        activeCategory === "clan_games"
                          ? "bg-white text-on-surface shadow-xs"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      Clan Games
                    </button>
                  </div>

                  <span className="text-xs font-mono text-on-surface-variant">
                    Showing <strong className="text-on-surface">{pageItems.length}</strong> of{" "}
                    <strong className="text-on-surface">{totalFiltered}</strong> members
                  </span>
                </div>

                {/* Filter Dropdowns */}
                <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
                  {/* Role */}
                  <select
                    value={roleFilter}
                    onChange={(e) => {
                      setRoleFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="h-7 px-2 bg-white border border-outline-variant rounded-md text-xs font-mono text-on-surface"
                  >
                    <option value="ALL">Role: All</option>
                    <option value="Leader">Leader</option>
                    <option value="Co-Leader">Co-Leader</option>
                    <option value="Elder">Elder</option>
                    <option value="Member">Member</option>
                  </select>

                  {/* Town Hall */}
                  <select
                    value={thFilter}
                    onChange={(e) => {
                      setThFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="h-7 px-2 bg-white border border-outline-variant rounded-md text-xs font-mono text-on-surface"
                  >
                    <option value="ALL">Town Hall: All</option>
                    <option value="TH17">TH17</option>
                    <option value="TH16">TH16</option>
                    <option value="TH15">TH15</option>
                    <option value="TH14">TH14</option>
                    <option value="TH13">TH13</option>
                    <option value="TH12">TH12</option>
                  </select>

                  {/* Penalties */}
                  <select
                    value={penaltyFilter}
                    onChange={(e) => {
                      setPenaltyFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="h-7 px-2 bg-white border border-outline-variant rounded-md text-xs font-mono text-on-surface"
                  >
                    <option value="ALL">Penalties: All</option>
                    <option value="CLEAN">Clean Record</option>
                    <option value="WITH_PENALTY">Has Penalties</option>
                  </select>

                  {/* Sort selector */}
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="text-on-surface-variant text-[11px]">Sort:</span>
                    <select
                      value={sortField}
                      onChange={(e) => {
                        setSortField(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="h-7 px-2 bg-white border border-outline-variant rounded-md text-xs font-mono text-on-surface"
                    >
                      <option value="master_score">Master Score</option>
                      <option value="war_stars">War Stars</option>
                      <option value="raid_attacks">Raid Attacks</option>
                      <option value="clan_games">Clan Games</option>
                      <option value="trophies">Trophies</option>
                      <option value="penalties">Penalties</option>
                    </select>
                    <button
                      onClick={() => setSortAsc(!sortAsc)}
                      className="h-7 px-2 bg-white border border-outline-variant rounded-md text-xs font-mono hover:bg-surface-container-low"
                    >
                      {sortAsc ? "▲ Asc" : "▼ Desc"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant bg-surface-container-low font-mono text-[11px] text-on-surface-variant select-none">
                      <th className="py-2.5 px-3 text-center cursor-pointer" onClick={() => handleSort("master_score")}>
                        Rank
                      </th>
                      <th className="py-2.5 px-2 text-center">Δ</th>
                      <th className="py-2.5 px-3">Member</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3 text-right cursor-pointer" onClick={() => handleSort("master_score")}>
                        Master Score
                      </th>
                      <th className="py-2.5 px-3 text-center cursor-pointer" onClick={() => handleSort("war_stars")}>
                        War Stars & Dest
                      </th>
                      <th className="py-2.5 px-3 text-center cursor-pointer" onClick={() => handleSort("raid_attacks")}>
                        Raid Atks
                      </th>
                      <th className="py-2.5 px-3 text-right cursor-pointer" onClick={() => handleSort("clan_games")}>
                        Clan Games
                      </th>
                      <th className="py-2.5 px-3 text-center">Penalties</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {loading ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center font-mono text-on-surface-variant">
                          <span className="material-symbols-outlined text-3xl text-outline mb-2 animate-spin block">
                            sync
                          </span>
                          Loading clan data...
                        </td>
                      </tr>
                    ) : pageItems.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center font-mono text-on-surface-variant">
                          <span className="material-symbols-outlined text-3xl text-outline mb-2 block">
                            database
                          </span>
                          No player records synchronized yet.
                          <br />
                          Click <strong>Sync API</strong> above to fetch your live clan roster from Supercell.
                        </td>
                      </tr>
                    ) : (
                      pageItems.map((m) => {
                        // Podium highlights for top 3
                        let rankBadge = (
                          <span className="font-mono font-bold text-on-surface text-xs">
                            #{m.rank ?? "--"}
                          </span>
                        );
                        let rowBg = "";

                        if (m.rank === 1 && m.masterScore && m.masterScore > 0) {
                          rankBadge = (
                            <span className="font-mono font-bold text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded text-xs shadow-xs">
                              #1 🏆
                            </span>
                          );
                          rowBg = "bg-amber-50/20";
                        } else if (m.rank === 2 && m.masterScore && m.masterScore > 0) {
                          rankBadge = (
                            <span className="font-mono font-bold text-slate-800 bg-slate-200 border border-slate-300 px-1.5 py-0.5 rounded text-xs">
                              #2
                            </span>
                          );
                        } else if (m.rank === 3 && m.masterScore && m.masterScore > 0) {
                          rankBadge = (
                            <span className="font-mono font-bold text-amber-900 bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded text-xs">
                              #3
                            </span>
                          );
                        }

                        // Penalty pill
                        let penaltyHtml = (
                          <span className="font-mono text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            Clean
                          </span>
                        );
                        if (m.missed && m.missed > 0) {
                          penaltyHtml = (
                            <span className="font-mono text-[11px] text-rose-800 bg-rose-50 border border-rose-300 px-2 py-0.5 rounded-full font-semibold">
                              ⚠️ -{m.missed * 30} pts
                            </span>
                          );
                        }

                        return (
                          <tr
                            key={m.tag}
                            onClick={() => setSelectedPlayer(m)}
                            className={`hover:bg-surface-container-low transition-colors cursor-pointer ${rowBg}`}
                          >
                            <td className="py-2.5 px-3 text-center">{rankBadge}</td>
                            <td className="py-2.5 px-2 text-center font-mono text-xs text-outline">
                              {m.trend && m.trend > 0 ? (
                                <span className="text-emerald-700 font-bold">▲{m.trend}</span>
                              ) : m.trend && m.trend < 0 ? (
                                <span className="text-rose-700 font-bold">▼{Math.abs(m.trend)}</span>
                              ) : (
                                "–"
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full border border-dashed border-outline bg-surface-container-low flex items-center justify-center font-mono text-xs font-semibold text-primary">
                                  {m.name.charAt(0)}
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-medium text-on-surface">{m.name}</span>
                                  <span className="font-mono text-[11px] text-on-surface-variant">{m.tag}</span>
                                </div>
                                {m.th ? (
                                  <span className="font-mono text-[10px] px-1.5 py-0.2 bg-surface-container-high border border-outline-variant rounded font-semibold text-on-surface-variant ml-1">
                                    TH{m.th}
                                  </span>
                                ) : (
                                  <span className="font-mono text-[10px] text-outline">--</span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 bg-surface-container-low border border-outline-variant rounded-full text-[11px] font-mono text-on-surface">
                                {m.role}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="font-mono font-bold text-on-surface text-sm tabular-nums">
                                {m.masterScore !== null && m.masterScore !== undefined ? m.masterScore.toLocaleString() : "--"}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <div className="flex flex-col items-center">
                                <span className="font-mono font-semibold text-xs text-on-surface">
                                  {m.warStars !== null ? `${m.warStars} ★` : "--"}
                                </span>
                                <span className="font-mono text-[10px] text-on-surface-variant">
                                  {m.warDest !== null ? `${m.warDest}% dest` : "--"}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="font-mono text-xs px-2 py-0.5 bg-surface-container-low border border-outline-variant rounded font-medium">
                                {m.raidAtks !== null ? `${m.raidAtks}/6` : "--"}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="font-mono text-xs tabular-nums text-on-surface">
                                {m.cgPoints !== null ? m.cgPoints.toLocaleString() : "--"}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">{penaltyHtml}</td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPlayer(m);
                                }}
                                className="text-outline hover:text-primary p-1 rounded hover:bg-surface-container-high transition-colors"
                                title="Inspect dossier"
                              >
                                <span className="material-symbols-outlined text-base">visibility</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Bar */}
              <div className="p-3 border-t border-outline-variant flex items-center justify-between bg-surface-container-low text-xs font-mono">
                <span className="text-on-surface-variant">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="h-7 px-2.5 border border-outline-variant rounded-md bg-white disabled:opacity-40"
                  >
                    Prev
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`h-7 w-7 border rounded-md ${
                        p === currentPage
                          ? "bg-primary text-on-primary font-bold border-primary"
                          : "bg-white border-outline-variant hover:bg-surface-container-high"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="h-7 px-2.5 border border-outline-variant rounded-md bg-white disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>

            </div>

            {/* Right 4 Cols: Context Panels */}
            <div className="lg:col-span-4 space-y-4">
              
              {/* Context Card 1: CWL Status */}
              <div className="p-4 bg-surface-container-lowest border border-outline-variant rounded-2xl space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-700 text-lg">shield</span>
                    <h3 className="font-bold text-xs text-on-surface">Clan War League (CWL)</h3>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                    High Multiplier
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant font-mono">
                  CWL war stars earn a 1.5× multiplier plus Town Hall scaling bonus (TH17: 1.3×, TH16: 1.2×).
                </p>
                <div className="p-2.5 bg-surface-container-low border border-outline-variant rounded-xl flex items-center justify-between text-xs font-mono">
                  <span>Missed CWL Penalty:</span>
                  <strong className="text-rose-700 font-bold">-{Math.abs(rules.cwlPenalty)} pts</strong>
                </div>
              </div>

              {/* Context Card 2: Gemini Flash OCR Ingestion Widget */}
              <div className="p-4 bg-surface-container-lowest border border-outline-variant rounded-2xl space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-lg">auto_awesome</span>
                    <h3 className="font-bold text-xs text-on-surface">Clan Games OCR Engine</h3>
                  </div>
                  <span className="text-[10px] font-mono text-primary font-bold">v3.6 Flash</span>
                </div>
                <p className="text-[11px] text-on-surface-variant font-mono">
                  Upload screenshots of your clan event board to extract individual player scores automatically.
                </p>
                <button
                  onClick={() => setUploadModalOpen(true)}
                  className="w-full py-2 bg-surface-container-low border border-outline-variant hover:bg-surface-container-high rounded-xl text-xs font-mono font-semibold text-on-surface flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">upload_file</span>
                  <span>Scan Event Screenshot</span>
                </button>
              </div>

              {/* Context Card 3: Infractions & Missed Attack Feed */}
              <div className="p-4 bg-surface-container-lowest border border-outline-variant rounded-2xl space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-rose-700 text-lg">warning</span>
                    <h3 className="font-bold text-xs text-on-surface">Active Infractions</h3>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-rose-50 text-rose-800 border border-rose-200 rounded font-bold">
                    {penalizedCount} Members
                  </span>
                </div>
                
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {penalizedCount === 0 ? (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-[11px] font-mono">
                      Zero missed attack penalties currently active across clan roster.
                    </div>
                  ) : (
                    players
                      .filter((p) => p.missed && p.missed > 0)
                      .map((p) => (
                        <div
                          key={p.tag}
                          onClick={() => setSelectedPlayer(p)}
                          className="p-2 bg-surface-container-low border border-outline-variant rounded-xl flex items-center justify-between text-xs font-mono cursor-pointer hover:bg-surface-container-high"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-rose-700 font-bold">⚠️</span>
                            <span className="font-medium text-on-surface">{p.name}</span>
                          </div>
                          <span className="text-rose-700 font-semibold">
                            -{p.missed! * 30} pts ({p.missed} miss)
                          </span>
                        </div>
                      ))
                  )}
                </div>
              </div>

            </div>

          </div>

        </main>
      </div>

      {/* ================= MODAL 1: GEMINI FLASH OCR UPLOAD ================= */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl w-full max-w-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-low">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">auto_awesome</span>
                <div>
                  <h2 className="text-sm font-bold text-on-surface">Gemini Flash Vision OCR Ingestion</h2>
                  <p className="text-[11px] text-on-surface-variant font-mono">Extract Clan Games points from scoreboard screenshots</p>
                </div>
              </div>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="text-outline hover:text-on-surface p-1 rounded hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs font-mono">
              {ocrStep === "upload" && (
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-outline rounded-2xl p-8 text-center cursor-pointer hover:border-primary hover:bg-surface-container-low transition-all"
                  >
                    <span className="material-symbols-outlined text-4xl text-primary mb-2 block">
                      cloud_upload
                    </span>
                    <span className="font-bold text-on-surface block text-sm">
                      Click to choose screenshot or drag and drop
                    </span>
                    <span className="text-[11px] text-on-surface-variant mt-1 block">
                      PNG, JPG, or WebP screenshot of the Clan Games event board
                    </span>
                  </div>

                  {ocrError && (
                    <div className="mt-3 p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-[11px]">
                      {ocrError}
                    </div>
                  )}
                </div>
              )}

              {ocrStep === "scanning" && (
                <div className="space-y-4 py-6">
                  <div className="flex items-center justify-between text-xs font-bold text-on-surface">
                    <span>Extracting Player Scores via Gemini Flash...</span>
                    <span className="text-primary animate-pulse">Processing</span>
                  </div>
                  <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                    <div className="bg-primary h-full w-3/4 animate-pulse"></div>
                  </div>
                  <div className="p-3 bg-surface-container-low border border-outline-variant rounded-xl text-[11px] space-y-1 text-on-surface-variant">
                    {ocrLog.map((log, i) => (
                      <div key={i}>{log}</div>
                    ))}
                  </div>
                </div>
              )}

              {ocrStep === "results" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-on-surface">Extracted Player Rows ({ocrResults.length})</span>
                    <span className="text-emerald-700 font-bold">✓ OCR Complete</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto border border-outline-variant rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-container-low border-b border-outline-variant text-on-surface-variant">
                        <tr>
                          <th className="p-2">Name</th>
                          <th className="p-2">Tag</th>
                          <th className="p-2 text-right">Points</th>
                          <th className="p-2 text-right">Master Bonus</th>
                          <th className="p-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant">
                        {ocrResults.map((r, i) => (
                          <tr key={i} className="hover:bg-surface-container-low">
                            <td className="p-2 font-bold text-on-surface">{r.player_name}</td>
                            <td className="p-2 text-on-surface-variant">{r.player_tag || "--"}</td>
                            <td className="p-2 text-right font-bold">{r.points_earned.toLocaleString()}</td>
                            <td className="p-2 text-right text-emerald-700 font-bold">
                              +{r.masterBonus} pts
                            </td>
                            <td className="p-2 text-center">
                              {r.matched ? (
                                <span className="text-emerald-700 font-bold">✓ Matched</span>
                              ) : (
                                <span className="text-amber-700 font-medium">New / Unmatched</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-outline-variant flex items-center justify-between bg-surface-container-low font-mono text-xs">
              <button
                onClick={() => {
                  setUploadModalOpen(false);
                  setOcrStep("upload");
                }}
                className="px-3 py-1.5 text-on-surface-variant hover:text-on-surface"
              >
                Cancel
              </button>
              {ocrStep === "results" && (
                <button
                  onClick={handleCommitOcr}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  <span>Approve & Apply to Leaderboard</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= WAR DATA SLIDE-OVER ================= */}
      {warPanelOpen && warData && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="flex-1 bg-slate-900/30 backdrop-blur-xs"
            onClick={() => setWarPanelOpen(false)}
          />
          {/* Panel */}
          <div className="w-full max-w-2xl bg-surface-container-lowest border-l border-outline-variant shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-outline-variant bg-surface-container-low flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-xl">shield</span>
                <div>
                  <h2 className="text-sm font-bold text-on-surface">
                    {warData.state === "warEnded" ? "Ended War" : warData.state === "inWar" ? "Live War" : "War Details"}
                  </h2>
                  <p className="text-[11px] text-on-surface-variant font-mono">
                    {warData.clanName || "Clan"} vs {warData.opponentName || "Opponent"} · {warData.teamSize}v{warData.teamSize}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                  warData.state === "warEnded" ? "bg-slate-100 text-slate-700 border border-slate-300"
                  : warData.state === "inWar" ? "bg-green-50 text-green-800 border border-green-300 animate-pulse"
                  : "bg-amber-50 text-amber-800 border border-amber-300"
                }`}>
                  {warData.state === "warEnded" ? "War Ended" : warData.state === "inWar" ? "⚔️ Live" : warData.state}
                </span>
                <button onClick={() => setWarPanelOpen(false)} className="text-outline hover:text-on-surface p-1 rounded hover:bg-surface-container-high">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
            </div>

            {/* War Score Summary Banner */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="text-center flex-1">
                <div className="text-[10px] font-mono opacity-70 mb-1">{warData.clanName || "Our Clan"}</div>
                <div className="font-mono font-black text-3xl text-yellow-300">⭐ {warData.clanStars}</div>
                <div className="text-[11px] font-mono opacity-80">{warData.clanDestruction?.toFixed(1)}% destruction</div>
              </div>
              <div className="text-center px-4">
                <div className="text-[10px] font-mono opacity-60 mb-1">VS</div>
                <div className="font-mono text-lg font-bold opacity-60">⚔️</div>
              </div>
              <div className="text-center flex-1">
                <div className="text-[10px] font-mono opacity-70 mb-1">{warData.opponentName || "Opponent"}</div>
                <div className="font-mono font-black text-3xl text-red-300">⭐ {warData.opponentStars}</div>
                <div className="text-[11px] font-mono opacity-80">{warData.opponentDestruction?.toFixed(1)}% destruction</div>
              </div>
            </div>

            {/* Member Attack Breakdown Table */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 pt-4 pb-2">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-mono font-bold text-xs text-on-surface">MEMBER ATTACK BREAKDOWN</h3>
                  <span className="text-[10px] font-mono text-on-surface-variant">
                    {warData.warMembers?.filter(m => m.attacksMade > 0).length ?? 0} / {warData.warMembers?.length ?? 0} attacked
                  </span>
                </div>

                {(!warData.warMembers || warData.warMembers.length === 0) ? (
                  <div className="text-center py-8 text-on-surface-variant text-xs font-mono">
                    No member attack data available.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {warData.warMembers.map((m, i) => (
                      <div
                        key={m.tag}
                        className={`p-3 rounded-xl border flex items-center gap-3 ${
                          m.attacksMissed > 0
                            ? "border-red-200 bg-red-50"
                            : m.attacksMade === 0
                            ? "border-outline-variant bg-surface-container-low"
                            : "border-emerald-200 bg-emerald-50"
                        }`}
                      >
                        {/* Rank */}
                        <span className="w-6 text-center font-mono text-xs font-bold text-on-surface-variant shrink-0">
                          {i + 1}
                        </span>

                        {/* TH Badge */}
                        <div className="w-8 h-8 rounded-lg bg-slate-900 text-white font-mono font-bold text-[11px] flex items-center justify-center shrink-0">
                          TH{m.townhallLevel || "?"}
                        </div>

                        {/* Name + Tag */}
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-xs text-on-surface truncate">{m.name}</div>
                          <div className="font-mono text-[10px] text-on-surface-variant">{m.tag}</div>
                        </div>

                        {/* Stars */}
                        <div className="text-center shrink-0">
                          <div className="font-mono font-black text-sm text-yellow-500">
                            {"★".repeat(m.totalStars)}{"☆".repeat(Math.max(0, (warData.attacksPerMember * 3) - m.totalStars)).slice(0, 3)}
                          </div>
                          <div className="text-[10px] font-mono text-on-surface-variant">{m.totalStars} stars</div>
                        </div>

                        {/* Destruction */}
                        <div className="text-center w-14 shrink-0">
                          <div className="font-mono font-bold text-sm text-on-surface">{m.avgDestruction}%</div>
                          <div className="text-[10px] font-mono text-on-surface-variant">dest.</div>
                        </div>

                        {/* Attacks Used */}
                        <div className="text-center w-16 shrink-0">
                          <div className={`font-mono text-xs font-bold ${m.attacksMissed > 0 ? "text-red-600" : "text-emerald-700"}`}>
                            {m.attacksMade}/{warData.attacksPerMember}
                          </div>
                          {m.attacksMissed > 0 && (
                            <div className="text-[10px] font-mono text-red-500">
                              -{m.attacksMissed} missed
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* War Log Section */}
              {warData.warLog && warData.warLog.length > 0 && (
                <div className="px-4 pt-4 pb-6">
                  <h3 className="font-mono font-bold text-xs text-on-surface mb-3">RECENT WAR LOG (Last {warData.warLog.length} Wars)</h3>
                  <div className="space-y-2">
                    {warData.warLog.map((entry, i) => (
                      <div key={i} className={`p-2.5 rounded-lg border flex items-center gap-3 text-xs ${
                        entry.result === "win" ? "bg-emerald-50 border-emerald-200"
                        : entry.result === "lose" ? "bg-red-50 border-red-200"
                        : "bg-amber-50 border-amber-200"
                      }`}>
                        <span className={`w-10 text-center font-mono font-black text-[11px] shrink-0 ${
                          entry.result === "win" ? "text-emerald-700"
                          : entry.result === "lose" ? "text-red-700"
                          : "text-amber-700"
                        }`}>
                          {entry.result?.toUpperCase()}
                        </span>
                        <div className="flex-1 font-mono text-[11px] text-on-surface truncate">
                          vs <strong>{entry.opponentName}</strong>
                        </div>
                        <div className="font-mono text-[11px] text-on-surface-variant shrink-0">
                          ⭐{entry.clanStars} vs ⭐{entry.opponentStars}
                        </div>
                        {entry.endTime && (
                          <div className="font-mono text-[10px] text-on-surface-variant shrink-0">
                            {new Date(
                              entry.endTime.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, "$1-$2-$3T$4:$5:$6")
                            ).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: RULES CONFIG (PROTECTED BY PIN 9449) ================= */}
      {rulesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl w-full max-w-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="p-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-low">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">tune</span>
                <div>
                  <h2 className="text-sm font-bold text-on-surface">Master Score Engine Configuration</h2>
                  <p className="text-[11px] text-on-surface-variant font-mono">Adjust weights, multipliers, and penalty rules</p>
                </div>
              </div>
              <button
                onClick={() => setRulesModalOpen(false)}
                className="text-outline hover:text-on-surface p-1 rounded hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Config Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              
              {/* Admin Authorization / Password Gate (PIN 9449) */}
              <div
                className={`p-3.5 rounded-xl border transition-all duration-200 ${
                  isRulesUnlocked
                    ? "bg-emerald-50 border-emerald-300"
                    : "bg-amber-50 border-amber-200"
                }`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`material-symbols-outlined text-lg ${
                        isRulesUnlocked ? "text-emerald-700" : "text-amber-700"
                      }`}
                    >
                      {isRulesUnlocked ? "lock_open" : "lock"}
                    </span>
                    <div>
                      <div
                        className={`font-mono font-bold text-xs ${
                          isRulesUnlocked ? "text-emerald-900" : "text-amber-900"
                        }`}
                      >
                        {isRulesUnlocked ? "Admin Control Panel Active" : "Protected Admin Controls (View-Only)"}
                      </div>
                      <div
                        className={`text-[11px] ${
                          isRulesUnlocked ? "text-emerald-700" : "text-amber-700"
                        }`}
                      >
                        {isRulesUnlocked
                          ? "Controls are unlocked. You are authorized to adjust scoring dials and update API credentials."
                          : "Dials and API settings are locked. Enter admin password to edit."}
                      </div>
                    </div>
                  </div>

                  {!isRulesUnlocked ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="password"
                        placeholder="Enter Password"
                        value={rulesPasswordInput}
                        onChange={(e) => setRulesPasswordInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleUnlockRules()}
                        className="w-32 h-7 px-2 bg-white border border-amber-300 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      <button
                        onClick={handleUnlockRules}
                        className="h-7 px-3 bg-amber-700 hover:bg-amber-800 text-white rounded text-xs font-mono font-semibold transition-colors flex items-center gap-1 shadow-xs"
                      >
                        <span className="material-symbols-outlined text-sm">key</span>
                        <span>Unlock</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-md font-mono text-[11px] font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">verified</span>
                        <span>Admin Editing Authorized</span>
                      </span>
                      <button
                        onClick={handleLockRules}
                        className="text-[11px] font-mono text-slate-600 hover:text-on-surface underline"
                      >
                        Lock
                      </button>
                    </div>
                  )}
                </div>

                {rulesAuthError && (
                  <div className="text-rose-700 font-mono text-[10px] mt-1.5 font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">error</span>
                    <span>Incorrect password. Access denied.</span>
                  </div>
                )}
              </div>

              {/* Supercell API & Dynamic IP Whitelist Manager */}
              <div className="border border-outline-variant rounded-xl p-4 bg-surface-container-low space-y-3">
                <div className="flex items-center justify-between font-mono font-bold text-on-surface">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-base">wifi_tethering</span>
                    <span>SUPERCELL API & DYNAMIC IP MANAGER</span>
                  </div>
                  <span className="text-[10px] text-primary font-mono bg-surface-container-high px-1.5 py-0.2 rounded">
                    Mobile Hotspot / Wi-Fi Support
                  </span>
                </div>

                <p className="text-[11px] text-on-surface-variant font-mono">
                  When switching Wi-Fi or mobile hotspots, your public IP changes and Supercell blocks requests. Copy your detected IP below to whitelist on developer.clashofclans.com, or paste a newly generated token here.
                </p>

                {/* Detected Outgoing IP with 1-click Copy */}
                <div className="p-3 bg-white border border-outline-variant rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-base">router</span>
                    <div>
                      <span className="text-[10px] font-mono text-on-surface-variant block">Your Current Public IP:</span>
                      <span className="font-mono font-bold text-sm text-on-surface">{detectedPublicIp}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(detectedPublicIp);
                      addToast(`Copied IP ${detectedPublicIp} to clipboard!`, "success");
                    }}
                    className="px-2.5 py-1.5 bg-surface-container-low hover:bg-surface-container-high border border-outline-variant rounded-md text-xs font-mono font-semibold flex items-center gap-1 transition-colors"
                  >
                    <span className="material-symbols-outlined text-xs">content_copy</span>
                    <span>Copy IP</span>
                  </button>
                </div>

                {/* Token & Clan Tag Inputs */}
                <div className="space-y-2">
                  <div>
                    <label className="block font-mono text-[10px] text-on-surface-variant mb-1">
                      Update Supercell API Bearer Token:
                    </label>
                    <textarea
                      disabled={!isRulesUnlocked}
                      rows={2}
                      placeholder={
                        isRulesUnlocked
                          ? "Paste newly generated Supercell JWT token here..."
                          : "•••••••••••••••••••••••••••••••••••••••••••••••• (Unlock with admin password to change)"
                      }
                      value={cocApiTokenInput}
                      onChange={(e) => setCocApiTokenInput(e.target.value)}
                      className={`w-full p-2 border border-outline-variant rounded text-xs font-mono resize-none ${
                        isRulesUnlocked
                          ? "bg-white text-on-surface focus:ring-1 focus:ring-primary"
                          : "bg-slate-100 text-slate-500 cursor-not-allowed"
                      }`}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="block font-mono text-[10px] text-on-surface-variant mb-1">
                        Clan Tag:
                      </label>
                      <input
                        type="text"
                        disabled={!isRulesUnlocked}
                        value={clanTagInput}
                        onChange={(e) => setClanTagInput(e.target.value)}
                        className={`w-full h-8 px-2 border border-outline-variant rounded text-xs font-mono font-semibold ${
                          isRulesUnlocked
                            ? "bg-white text-on-surface"
                            : "bg-slate-100 text-slate-500 cursor-not-allowed"
                        }`}
                      />
                    </div>

                    <div className="self-end">
                      <button
                        type="button"
                        disabled={!isRulesUnlocked || apiSaving}
                        onClick={handleSaveCocApi}
                        className="h-8 px-4 bg-primary hover:bg-slate-700 text-on-primary rounded text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-40"
                      >
                        <span className={`material-symbols-outlined text-sm ${apiSaving ? "animate-spin" : ""}`}>
                          {apiSaving ? "sync" : "save"}
                        </span>
                        <span>{apiSaving ? "Verifying..." : "Save & Test Key"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Verification Status Banner */}
                  {apiSaveResult.status !== "idle" && (
                    <div
                      className={`p-2.5 rounded-lg border text-xs font-mono flex items-start gap-2 ${
                        apiSaveResult.status === "connected"
                          ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                          : apiSaveResult.status === "ip_mismatch"
                          ? "bg-amber-50 border-amber-300 text-amber-900"
                          : "bg-rose-50 border-rose-300 text-rose-800"
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm shrink-0 mt-0.5">
                        {apiSaveResult.status === "connected" ? "check_circle" : "warning"}
                      </span>
                      <div className="flex-1">
                        <span className="block font-bold">
                          {apiSaveResult.status === "connected"
                            ? "Supercell Connection Verified"
                            : apiSaveResult.status === "ip_mismatch"
                            ? "IP Whitelist Needed on Supercell Portal"
                            : "Connection Test Failed"}
                        </span>
                        <span className="block text-[11px] mt-0.5">{apiSaveResult.message}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Regular Clan Wars */}
              <div className="border border-outline-variant rounded-xl p-4 bg-surface-container-low space-y-3">
                <div className="flex items-center justify-between font-mono font-bold text-on-surface">
                  <span>REGULAR CLAN WARS</span>
                  <span className="text-[10px] text-primary">Standard Wars</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-mono text-[10px] text-on-surface-variant mb-1">Points per Star</label>
                    <input
                      type="number"
                      disabled={!isRulesUnlocked}
                      value={tempRules.warStar}
                      onChange={(e) => setTempRules({ ...tempRules, warStar: Number(e.target.value) || 0 })}
                      className={`w-full h-8 px-2 border border-outline-variant rounded text-xs font-mono font-semibold ${
                        isRulesUnlocked ? "bg-white text-on-surface" : "bg-slate-100 text-slate-500 cursor-not-allowed"
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-on-surface-variant mb-1">Pts / 10% Destruction</label>
                    <input
                      type="number"
                      disabled={!isRulesUnlocked}
                      value={tempRules.warDestruction}
                      onChange={(e) => setTempRules({ ...tempRules, warDestruction: Number(e.target.value) || 0 })}
                      className={`w-full h-8 px-2 border border-outline-variant rounded text-xs font-mono font-semibold ${
                        isRulesUnlocked ? "bg-white text-on-surface" : "bg-slate-100 text-slate-500 cursor-not-allowed"
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-rose-700 mb-1">Missed Attack Penalty</label>
                    <input
                      type="number"
                      disabled={!isRulesUnlocked}
                      value={tempRules.warPenalty}
                      onChange={(e) => setTempRules({ ...tempRules, warPenalty: Number(e.target.value) || 0 })}
                      className={`w-full h-8 px-2 border border-rose-300 text-rose-700 rounded text-xs font-mono font-semibold ${
                        isRulesUnlocked ? "bg-white" : "bg-slate-100 cursor-not-allowed"
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Clan War League */}
              <div className="border border-outline-variant rounded-xl p-4 bg-surface-container-low space-y-3">
                <div className="flex items-center justify-between font-mono font-bold text-on-surface">
                  <span>CLAN WAR LEAGUE (CWL)</span>
                  <span className="text-[10px] text-amber-800 font-semibold bg-amber-100 px-1.5 py-0.2 rounded">High Stakes</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-mono text-[10px] text-on-surface-variant mb-1">Points per Star</label>
                    <input
                      type="number"
                      disabled={!isRulesUnlocked}
                      value={tempRules.cwlStar}
                      onChange={(e) => setTempRules({ ...tempRules, cwlStar: Number(e.target.value) || 0 })}
                      className={`w-full h-8 px-2 border border-outline-variant rounded text-xs font-mono font-semibold ${
                        isRulesUnlocked ? "bg-white text-on-surface" : "bg-slate-100 text-slate-500 cursor-not-allowed"
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-on-surface-variant mb-1">Pts / 10% Destruction</label>
                    <input
                      type="number"
                      disabled={!isRulesUnlocked}
                      value={tempRules.cwlDestruction}
                      onChange={(e) => setTempRules({ ...tempRules, cwlDestruction: Number(e.target.value) || 0 })}
                      className={`w-full h-8 px-2 border border-outline-variant rounded text-xs font-mono font-semibold ${
                        isRulesUnlocked ? "bg-white text-on-surface" : "bg-slate-100 text-slate-500 cursor-not-allowed"
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-rose-700 mb-1">Missed CWL Penalty</label>
                    <input
                      type="number"
                      disabled={!isRulesUnlocked}
                      value={tempRules.cwlPenalty}
                      onChange={(e) => setTempRules({ ...tempRules, cwlPenalty: Number(e.target.value) || 0 })}
                      className={`w-full h-8 px-2 border border-rose-300 text-rose-700 rounded text-xs font-mono font-semibold ${
                        isRulesUnlocked ? "bg-white" : "bg-slate-100 cursor-not-allowed"
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Raid & Clan Games */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border border-outline-variant rounded-xl p-4 bg-surface-container-low space-y-2">
                  <span className="font-mono font-bold text-on-surface block">RAID WEEKENDS</span>
                  <div>
                    <label className="block font-mono text-[10px] text-on-surface-variant mb-1">Points per Attack (0-6)</label>
                    <input
                      type="number"
                      disabled={!isRulesUnlocked}
                      value={tempRules.raidAttack}
                      onChange={(e) => setTempRules({ ...tempRules, raidAttack: Number(e.target.value) || 0 })}
                      className={`w-full h-8 px-2 border border-outline-variant rounded text-xs font-mono font-semibold ${
                        isRulesUnlocked ? "bg-white text-on-surface" : "bg-slate-100 text-slate-500 cursor-not-allowed"
                      }`}
                    />
                  </div>
                </div>

                <div className="border border-outline-variant rounded-xl p-4 bg-surface-container-low space-y-2">
                  <span className="font-mono font-bold text-on-surface block">CLAN GAMES</span>
                  <div>
                    <label className="block font-mono text-[10px] text-on-surface-variant mb-1">Ratio (Points ÷ X)</label>
                    <input
                      type="number"
                      disabled={!isRulesUnlocked}
                      value={tempRules.cgRatio}
                      onChange={(e) => setTempRules({ ...tempRules, cgRatio: Number(e.target.value) || 0 })}
                      className={`w-full h-8 px-2 border border-outline-variant rounded text-xs font-mono font-semibold ${
                        isRulesUnlocked ? "bg-white text-on-surface" : "bg-slate-100 text-slate-500 cursor-not-allowed"
                      }`}
                    />
                  </div>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-outline-variant flex items-center justify-between bg-surface-container-low font-mono text-xs">
              <button
                onClick={handleResetRules}
                disabled={!isRulesUnlocked}
                className="px-3 py-1.5 text-on-surface-variant hover:text-on-surface disabled:opacity-40"
              >
                Reset to Defaults
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRulesModalOpen(false)}
                  className="px-3 py-1.5 text-on-surface-variant hover:text-on-surface"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRules}
                  disabled={!isRulesUnlocked}
                  className="px-4 py-2 bg-primary text-on-primary hover:bg-slate-700 rounded-lg font-semibold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-sm">calculate</span>
                  <span>Apply & Recalculate All Scores</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ================= MODAL 3: PLAYER DOSSIER DRAWER ================= */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-surface-container-lowest border-l border-outline-variant w-full max-w-lg h-full shadow-2xl flex flex-col justify-between">
            
            {/* Header */}
            <div className="p-5 border-b border-outline-variant bg-surface-container-low flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl border border-dashed border-outline bg-white flex items-center justify-center font-mono font-bold text-base text-primary">
                  {selectedPlayer.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-on-surface">{selectedPlayer.name}</h3>
                    {selectedPlayer.th && (
                      <span className="px-1.5 py-0.2 bg-surface-container-high rounded text-[10px] font-mono font-bold">
                        TH{selectedPlayer.th}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-on-surface-variant mt-0.5">
                    <span>{selectedPlayer.tag}</span>
                    <span>•</span>
                    <span>{selectedPlayer.role}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedPlayer(null)}
                className="p-1 rounded text-outline hover:text-on-surface hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              
              {/* Score Header Pill */}
              <div className="p-4 bg-surface-container-low border border-outline-variant rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-on-surface-variant block">Cumulative Master Score</span>
                  <span className="font-mono text-2xl font-bold text-on-surface">
                    {selectedPlayer.masterScore !== null ? selectedPlayer.masterScore.toLocaleString() : "--"} pts
                  </span>
                </div>
                <span className="font-mono text-xs px-2.5 py-1 bg-white border border-outline-variant rounded-lg font-bold">
                  Rank #{selectedPlayer.rank ?? "--"}
                </span>
              </div>

              {/* Mathematical Breakdown */}
              <div className="space-y-2">
                <span className="font-mono font-bold text-xs text-on-surface block">Formula Points Breakdown</span>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-3 bg-surface-container-low border border-outline-variant rounded-xl">
                    <span className="text-[10px] text-on-surface-variant block">Clan Wars & CWL</span>
                    <strong className="text-on-surface text-sm">
                      {selectedPlayer.warStars !== null ? `+${selectedPlayer.warStars * rules.warStar} pts` : "--"}
                    </strong>
                  </div>
                  <div className="p-3 bg-surface-container-low border border-outline-variant rounded-xl">
                    <span className="text-[10px] text-on-surface-variant block">Raid Weekends</span>
                    <strong className="text-on-surface text-sm">
                      {selectedPlayer.raidAtks !== null ? `+${selectedPlayer.raidAtks * rules.raidAttack} pts` : "--"}
                    </strong>
                  </div>
                  <div className="p-3 bg-surface-container-low border border-outline-variant rounded-xl">
                    <span className="text-[10px] text-on-surface-variant block">Clan Games (OCR)</span>
                    <strong className="text-on-surface text-sm">
                      {selectedPlayer.cgPoints !== null ? `+${Math.min(400, Math.floor(selectedPlayer.cgPoints / rules.cgRatio))} pts` : "--"}
                    </strong>
                  </div>
                  <div className="p-3 bg-surface-container-low border border-outline-variant rounded-xl">
                    <span className="text-[10px] text-rose-700 block">Penalties</span>
                    <strong className="text-rose-700 text-sm">
                      {selectedPlayer.missed && selectedPlayer.missed > 0 ? `-${selectedPlayer.missed * 30} pts` : "0 pts"}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Admin Penalty Controls */}
              <div className="p-4 bg-surface-container-low border border-outline-variant rounded-xl space-y-3 font-mono">
                <span className="font-bold text-xs text-on-surface block">Admin Penalty Actions</span>
                <p className="text-[11px] text-on-surface-variant">
                  Apply point deductions for missed war attacks or pardon existing infractions.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAdjustPenalty(1)}
                    className="flex-1 py-2 px-3 bg-rose-50 text-rose-800 border border-rose-300 rounded-lg text-xs font-semibold hover:bg-rose-100 flex items-center justify-center gap-1"
                  >
                    <span>⚠️ Missed Attack (-30)</span>
                  </button>
                  <button
                    onClick={() => handleAdjustPenalty(-(selectedPlayer.missed ?? 0))}
                    disabled={!selectedPlayer.missed || selectedPlayer.missed === 0}
                    className="flex-1 py-2 px-3 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-semibold hover:bg-emerald-100 flex items-center justify-center gap-1 disabled:opacity-40"
                  >
                    <span>✓ Pardon / Clear</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-outline-variant bg-surface-container-low flex justify-end font-mono">
              <button
                onClick={() => setSelectedPlayer(null)}
                className="px-4 py-2 bg-white border border-outline-variant rounded-lg text-xs font-semibold hover:bg-surface-container-high"
              >
                Close Dossier
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
