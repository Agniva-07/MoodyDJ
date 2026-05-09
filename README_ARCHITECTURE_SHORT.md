# MoodyDJ Architecture, Features, and Workflow

## What MoodyDJ is
MoodyDJ is a React + Express music discovery app that builds YouTube-based listening sessions from mood selections or artist selections. It combines a modern player UI with a lightweight recommendation engine, session queueing, and simple learning from likes/dislikes.

## High-level architecture
- `client/`: React + Vite frontend
- `server/`: Express backend that talks to the YouTube Data API
- `Firebase`: auth, profile data, selected artists, and listening history
- `YouTube IFrame Player`: actual playback inside the custom player UI

## Frontend structure
- `App.jsx`: app shell, routes, session state, mood flow, player flow
- `pages/LandingPage.jsx`: mood selection and blended mood entry point
- `pages/ModeSelection.jsx`: choose personalized mode or solo mode
- `pages/SoloPage.jsx`: artist-only listening mode
- `pages/PlayerPage.jsx`: main player experience
- `components/Navbar.jsx`: top navigation and mood switching
- `components/PlayerCard.jsx`: playback UI, progress, volume, stats, visualizer
- `components/QueuePanel.jsx`: queue + recently played
- `context/ArtistContext.jsx`: shared selected-artist state

## Backend structure
- `server/index.js`: bootstraps Express and mounts routes
- `server/routes/songs.js`: recommendation engine, session queueing, scoring, prefetch, like/dislike logic, solo mode fetch logic

## Main product features
- Mood-based music discovery: `chill`, `sad`, `focus`, `hype`
- Blended mood mode using weighted mood mixing
- Personalized mode using selected favorite artists
- Solo artist mode using only selected artists
- Custom music player with queue, stats, progress bar, and visualizer
- Session queue and prefetch system for Auto-DJ-like playback
- Like/dislike learning to bias future songs
- Recent listening history and profile persistence
- Responsive premium UI with album-art-based accent theming

## User workflow
1. User logs in and optionally selects favorite artists.
2. User chooses a mode:
   - Mood mode
   - Blended mood mode
   - Personalized mode
   - Solo artist mode
3. Frontend sends the request to the backend with mood, artist, and session info.
4. Backend searches YouTube, filters results, scores them, and returns a starting set of songs.
5. Frontend loads the songs into the custom player and queue.
6. During playback, the app:
   - saves history
   - fetches stats
   - prefetches upcoming songs
   - updates queue state
   - learns from likes/dislikes

## Current strengths
- Clear split between UI and recommendation backend
- Reusable player component system
- Session-aware queue logic in normal mood mode
- Personalization hooks already exist
- Good base for smarter recommendation upgrades

## Good next features
- Variety rotation so the same artist or mood does not repeat the same top songs every day
- Recency memory per user or artist to avoid replaying tracks too soon
- Pagination/token-based search expansion beyond top YouTube results
- “Refresh mix” button for a new batch without changing mood
- Stronger ranking using artist match confidence, recency, and skip behavior
- Saved playlists/favorites tab
- Explicit “discover more / deeper cuts / trending / classics” filters
- Better analytics: skips, completion rate, repeat rate, boredom score
