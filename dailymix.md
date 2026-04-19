# Artist-Based Daily Mix + Solo Mode System Overview

This document outlines the architectural changes and implementations delivered for the **Solo Mode / Daily Mix System** in the MoodyDJ application.

## 🎯 What Was Built

We introduced a secondary listening mode called **Solo Mode (Daily Mix)**. This mode bypasses the standard mood-based algorithm to act as a focused, unfiltered mix curated exclusively from the user's selected onboarding artists. 

## 🛠️ How It Was Implemented

### 1. New Backend API (`/api/solo-songs`)
- **Parallel Keyword Search**: Modded `express` routing to fetch two parallel YouTube search strings concurrently: `<Artist Name> songs` & `<Artist Name> official songs`.
- **Content Verification**: Bypassed generic keyword drops to batch load `.contentDetails` for 50 IDs simultaneously.
- **Strict Duration Filters**: Implemented rigid checks discarding track lengths below 120s (shorts, reels, skits) and above 480s (live mixes, jukeboxes, albums).
- **Quota Balancing Algorithm**: Calculated `Math.floor(20 / artists.length)`. We fetch everything, but ensure returned results equally represent every favorited artist flawlessly, drawing overflow from a pooled fallback array if one artist doesn't hit quota.
- **Mix Variety**: Shuffles the final merged payload to prevent chunked grouping by artist.

### 2. Frontend Mode Redirection (`/mode-select`)
- Built `ModeSelection.jsx` utilizing massive glassmorphism UX panels matching onboarding styles (`App.css`).
- Redirected `App.jsx` router pathways:
  - Users finishing Onboarding skip `/home` and safely arrive at `/mode-select`.
  - Node 1 routes purely to `/home` pushing `LandingPage.jsx`.
  - Node 2 routes safely to `/solo` invoking `SoloPage.jsx`.

### 3. Smart Caching (`SoloPage.jsx`)
- Leveraged `localStorage` bounds caching strictly under `dailyMix:<UID>:<YYYY-MM-DD>`. 
- Fetch pipelines check the cache dynamically before pinging `/api/solo-songs`. This prevents YouTube quota evaporation when users skip forward or refresh the client page during session use on the exact same date.

### 4. Re-usable UX State (Player Engine)
- Isolated `window.YT.Player` instance mounting behind `SoloPage.jsx` whilst natively hiding the iframe.
- Re-assigned exact prop mapping passing `songs[currentIndex]` into the universally structured `<PlayerCard />` and `<QueuePanel />` components securing styling consistencies.

## 🚀 Summary
The app now natively supports divergent paths: One dynamically bridging moods across libraries, and the other strictly filtering exact profiles providing seamless focused listening environments.
