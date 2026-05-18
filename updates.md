# MoodyDJ — Implementation Updates

## What Changed and Why

---

### 1. Fixed Critical Crash: `serverTimestamp` Import
**File:** `client/src/services/userService.js`

`syncUserToFirestore()` called `serverTimestamp()` on line 15 but the function was never imported. Every new user signup crashed with `ReferenceError`. Added `serverTimestamp` to the `firebase/firestore` import.

---

### 2. Unified Artist State: `ArtistContext.jsx` Rewrite
**File:** `client/src/context/ArtistContext.jsx`

**Problem:** Three separate, disconnected artist states existed:
- `prewarmedArtists` in localStorage (from DailyArtistPrompt)
- `selectedArtists` in ArtistContext (from ArtistSelection)
- Gameplay artist lists derived independently in each page

**Solution:** ArtistContext now:
- Listens to `onAuthStateChanged` directly (no more relying on stale localStorage `user` key)
- Reads `lastOnboardedDate` from Firestore on mount to determine if onboarding was completed today
- Exposes `onboardingCompletedToday` and `onboardingChecked` flags
- Provides `completeOnboarding(artistIds)` which atomically writes both `selectedArtists` and `lastOnboardedDate` to Firestore
- `selectedArtists` is now the **single source of truth** used everywhere

---

### 3. Daily Onboarding: `DailyArtistPrompt.jsx` Rewrite
**File:** `client/src/components/DailyArtistPrompt.jsx`

**Problems fixed:**
- Only showed 24 of 104 artists (`.slice(0, 24)`)
- Used 12-hour sliding localStorage window instead of calendar-day check
- Did NOT update `selectedArtists` context — prewarm and gameplay used different artist pools
- Auth check used fragile `firebase:authUser` localStorage key sniffing

**Solution:**
- Shows ALL 104 artists grouped by category with search
- Renders only when `onboardingChecked && !onboardingCompletedToday`
- Calls `completeOnboarding()` which writes both `selectedArtists` + `lastOnboardedDate` to Firestore
- Enforces 3–10 artist selection
- "Skip" button only available when user has ≥3 existing artists (reuses yesterday's)
- Prewarm call uses the same artist names that are saved to context

---

### 4. Selection Deadlock Fix: `ArtistSelection.jsx`
**File:** `client/src/components/ArtistSelection.jsx`

**Problem:** A 12-hour session lock greyed out any artist whose name wasn't in `prewarmedArtists` localStorage. If a user prewarmed 1–2 artists, they couldn't reach the 3-artist minimum, permanently locking them out.

**Solution:** Removed all `prewarmedNames`, `isWindowActive`, and `hoursRemaining` state entirely. All 104 artists are always selectable. Enforced strict minimum 3 with disabled Continue button.

---

### 5. Recency Penalty Fix (Already Applied)
**File:** `server/routes/songs.js` (lines 356–367)

The recency filter already contains the fix from the previous session: reads `entry.ts || entry.playedAt || 0` with Firestore Timestamp object handling. The backend `recentSongs.js` stores entries as `{ videoId, ts }`, and the filter now correctly resolves both field names.

---

### 6. Queue Refill: `SoloPage.jsx`
**File:** `client/src/pages/SoloPage.jsx`

**Problem:** Solo Mode loaded up to 50 songs on mount with no refill mechanism. When the user reached the end, the queue looped or stopped.

**Solution:** Added a `useEffect` that monitors `currentIndex` and triggers a refill request to `/api/solo-songs` when fewer than 5 songs remain. New songs are deduplicated against existing queue entries. A `refilling` flag prevents duplicate concurrent requests.

---

### 7. Server Auth Middleware
**File:** `server/authMiddleware.js` (NEW)

**Problem:** All backend endpoints blindly trusted `userId` from the request body. Any client could impersonate another user.

**Solution:** Created `verifyFirebaseToken` middleware that:
- Checks `Authorization: Bearer <token>` header
- Verifies token via `admin.auth().verifyIdToken()`
- Sets `req.authenticatedUid` from the verified token
- Falls back to `req.body.userId` for backward compatibility (non-breaking migration)

---

### 8. Onboarding Endpoints: `server/index.js`
**File:** `server/index.js`

Added two new endpoints:
- `GET /api/onboarding-status` — Returns `completedToday` boolean and current `selectedArtists` from Firestore
- `POST /api/complete-onboarding` — Writes `lastOnboardedDate` (YYYY-MM-DD) and `selectedArtistIds` to Firestore

The auth middleware is applied globally but non-blocking.

---

### 9. Firebase Admin Export
**File:** `server/firebaseAdmin.js`

Exported `admin` alongside `initFirebaseAdmin` so the auth middleware can call `admin.auth().verifyIdToken()`.

---

### 10. Onboarding CSS Refresh
**File:** `client/src/components/DailyArtistPrompt.css`

Redesigned for the full artist catalog with category sections, search input, scrollable grid, glassmorphism theme, and responsive layout.

---

## Architecture After Fixes

```
Launch App
  → ProtectedRoute checks Firebase Auth (onAuthStateChanged)
  → ArtistContext loads selectedArtists + lastOnboardedDate from Firestore
  → If not onboarded today → DailyArtistPrompt shows ALL artists
  → User selects 3-10 → completeOnboarding() writes to Firestore
  → Prewarm call caches songs in backend memory
  → Mode selection page
  → Gameplay uses selectedArtists from context (same list that was prewarmed)
  → Queue refills from cache when running low
  → Recently played timestamps correctly penalize via ts field
```
