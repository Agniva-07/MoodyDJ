# 🎵 MoodyDJ: Playlist System & Queue Features

Here is a summary of the new features added to the MoodyDJ application, how they were architected, and the optimizations applied to protect Firebase and YouTube API quotas.

---

## 🚀 Overview of Implemented Features

### 1. 📂 Playlist System
* **Create & Organize:** Users can create custom playlists (specifying a name and optional description). 
* **Custom Deterministic Covers:** A cover gradient matching MoodyDJ's theme palette is generated deterministically from a hash of the playlist's name.
* **Pinning/Unpinning:** Playlists can be pinned to the top of the user's profile dashboard.
* **Detail Page (`/playlist/:id`):** Lists songs in the playlist, allowing inline renaming/editing, deletion, and immediate action buttons: **Play All**, **Shuffle**, and **Add Playlist to Queue**.

### 2. ➕ Add to Queue & Playlist
* **Add to Queue (`+`):** Added to all song cards and lists (such as player recommendations, queue panel, recently played, and playlist pages). Songs are added to the end of the current playback queue without breaking the current song. Consecutive duplicates are prevented.
* **Add to Playlist (`📂`):** Standard modal trigger added across the app. It lets the user select an existing playlist to add the song to (showing an "Already Added" checkmark if the song is already there) or quick-create a new playlist.

### 3. 🔄 Queue Persistence & Refresh
* **State Persistence:** The active queue (in both Mood Mode and Artist Solo Mode) is backed up to `localStorage`. Page refreshes automatically restore the queue state, current song index, and history.
* **Manual Refreshing:** Automatic queue refilling has been disabled. A `🔄 Refresh` button was added to the Queue Panel, giving users explicit control over when the playlist list regenerates.

---

## 🛠️ Architecture & Firebase Optimization ("How it was done")

### 1. Synchronous Startup Queue Restoration
* To guarantee that the active queue is restored before *any* rendering or startup fetches occur, we initialize the player state (songs list, index, mood config, and session metadata) synchronously inside the `useState(() => { ... })` initializer callback. This blocks any race conditions or flashes of empty players.

### 2. Local-First Queue Refreshes
* When the user clicks the `🔄 Refresh` button, the system first checks if songs exist in the local playback queue. If yes, it **reshuffles the queue locally** (preserving the currently playing song at index 0 to avoid audio interruption) instead of hitting the YouTube/backend API. The API is only queried as a last-resort fallback if the queue is completely empty.

### 3. Safe Cache Eviction (Self-Healing Storage)
* When caching YouTube song metadata (title, thumbnails, channels) into `localStorage`, the storage engine could theoretically run out of space on long-term usage. 
* We implemented a self-healing write loop: if a write fails due to `QuotaExceededError`, the system halves the cache limit (e.g. 500 -> 250 -> 125) and tries again. This gracefully evicts older cached songs to accommodate space constraints.

### 4. Batch Lazy Metadata Loading
* Playlist documents in Firestore only store lists of `videoId`s to keep document size ultra-low.
* To render song lists on playlist pages, we resolve metadata using a strict hierarchy:
  1. Check **in-memory cache** map.
  2. Check **localStorage cache**.
  3. Batch fetch *only* completely missing tracks using a single POST `/api/songs/metadata` request (resolving up to 50 tracks in a single YouTube API call instead of one-by-one).

### 5. Throttled LocalStorage Writes
* To prevent performance degradation during frequent playback status changes, writes to `localStorage` are debounced (throttled to a maximum of once per second).

### 6. Provider Nesting Fix (Resolved Blank Screen)
* We fixed a circular nesting issue in `main.jsx` by wrapping the `PlaylistProvider` inside the `ToastProvider`. This ensures `useToast` is fully initialized and defined when the playlist system boots up, resolving the React crash on startup.

---

## 📁 Added and Modified Files

### 🆕 New Files Added
1. **[playlistService.js](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/services/playlistService.js):** Firestore backend operations (using atomic calls like `arrayUnion` and `arrayRemove`).
2. **[PlaylistContext.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/context/PlaylistContext.jsx):** State management, optimistic updates, and song metadata caching.
3. **[ToastContext.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/context/ToastContext.jsx):** Custom context provider for showing floating toast alerts.
4. **[Toast.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/components/Toast.jsx):** UI component for rendering the stack of animated toast alerts.
5. **[Playlist.css](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/components/playlist/Playlist.css):** Glassmorphism styling, hover transitions, and keyframe slide-in animations.
6. **[CreatePlaylistModal.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/components/playlist/CreatePlaylistModal.jsx):** Modal form for creating a playlist.
7. **[AddToPlaylistModal.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/components/playlist/AddToPlaylistModal.jsx):** Selection modal to add a track to any playlist or create a new one on-the-fly.
8. **[PlaylistCard.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/components/playlist/PlaylistCard.jsx):** Interactive grid-card component representing a playlist.
9. **[PlaylistPage.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/pages/PlaylistPage.jsx):** Full routing view for a single playlist's contents and controls.

### ✏️ Existing Files Modified
1. **[main.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/main.jsx):** Registered `ToastProvider` and `PlaylistProvider` contexts in the correct order.
2. **[App.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/App.jsx):** Integrated routing for playlist pages, persistent localStorage queue management, and the `onAddToQueue` handler.
3. **[SoloPage.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/pages/SoloPage.jsx):** Added persistence and `onAddToQueue` handler to the artist search/solo player view.
4. **[PlayerCard.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/components/PlayerCard.jsx):** Integrated the playlist button (`📂`) into the core player controls.
5. **[QueuePanel.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/components/QueuePanel.jsx):** Integrated the `+` (Add to Queue) and `📂` (Add to Playlist) actions beside song items, and added the manual `🔄 Refresh` button.
6. **[ProfilePage.jsx](file:///c:/Users/haita/Desktop/MoodyDJ/client/src/pages/ProfilePage.jsx):** Updated user profile dashboard to fetch and list the user's playlists in a layout matching the existing aesthetic.
