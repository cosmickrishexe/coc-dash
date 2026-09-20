# Clash of Clans Tactical Intelligence & Performance Dashboard

An enterprise-grade, real-time analytics command center and roster intelligence dashboard built for Clash of Clans clans.

Live production URL: [https://coc-fullstack.vercel.app](https://coc-fullstack.vercel.app) (or alternative Vercel alias)

---

## 🌟 Core Features

- **Automated Roster Synchronization**: Deep telemetry ingestion from Supercell's official API (`/clans/{tag}`, `/currentwar`, `/warlog`, `/capitalraidseasons`).
- **War & Attack-by-Attack Breakdown**: Real-time war tracking, member attack execution, stars earned, destruction %, and missed attack penalties.
- **AI Vision OCR (Google Gemini Flash)**: Upload Clan Games screenshots directly to automatically extract player scores with zero manual data entry.
- **Objective Master Score Formula**: Weighted calculations across Regular Wars, CWL, Raid Weekends, and Clan Games with Town Hall multipliers.
- **Admin Password Gate**: Password-protected scoring weights, penalty adjustments, and live API credentials.
- **Dynamic IP Whitelist Manager**: Live detection of outgoing server IP with 1-click copy to manage mobile hotspot and changing Wi-Fi networks easily.
- **Dual-Layer Persistence**: Cloud Supabase (PostgreSQL 16) with resilient local JSON fallback.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack, TypeScript)
- **Styling**: Tailwind CSS, Material Symbols Icons, JetBrains Mono
- **AI / Multimodal**: Google Gemini 3.8 Flash (`gemini-flash-latest`)
- **Database**: Supabase PostgreSQL 16
- **Deployment**: Vercel Serverless Platform

---

## 📁 Repository File Structure

```text
coc-fullstack/
├── .env.example                     # Environment variable template
├── .gitignore                       # Standard git ignore rules (protects credentials)
├── next.config.ts                   # Next.js configuration
├── package.json                     # Dependencies and scripts
├── postcss.config.mjs               # PostCSS styling config
├── tailwind.config.ts               # Slate schematic design system
├── tsconfig.json                    # TypeScript compiler options
├── vercel.json                      # Vercel deployment configuration
├── public/                          # Static assets and icons
├── supabase/
│   └── migrations/
│       └── 20260919000000_init_coc_schema.sql  # Database schema definition
└── src/
    ├── app/
    │   ├── api/
    │   │   └── clan/
    │   │       ├── config/route.ts            # Public IP detection & Supercell token update
    │   │       ├── leaderboard/route.ts       # Full clan leaderboard data
    │   │       ├── penalties/route.ts         # Player missed attack penalty management
    │   │       ├── rules/route.ts             # Master score formula config (PIN protected)
    │   │       ├── sync/route.ts              # Live Supercell clan synchronization
    │   │       ├── upload-clan-games/route.ts # Gemini Vision OCR extraction
    │   │       └── war/route.ts               # War details & attack breakdown
    │   ├── globals.css      # Base styling and design tokens
    │   ├── layout.tsx       # Root layout & font definitions
    │   └── page.tsx         # Unified dashboard UI and slide-overs
    └── lib/
        ├── coc-api.ts       # Supercell API HTTP client
        ├── gemini.ts        # Google Gemini Vision OCR service
        ├── scoring.ts       # Master Score calculation engine
        ├── storage.ts       # Dual storage layer (Supabase + Local fallback)
        └── types.ts         # Global TypeScript interfaces
```

---

## 🚀 Quickstart & Local Setup

### 1. Clone & Install
```bash
git clone <your-github-repo-url>
cd coc-fullstack
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local` and add your keys:
```bash
cp .env.example .env.local
```

Required keys:
```env
COC_API_TOKEN=your_supercell_jwt_token
CLAN_TAG=#2QVJ990GL
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-flash-latest
SCORING_ADMIN_PIN=9449
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
```

### 3. Run Locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the dashboard.
