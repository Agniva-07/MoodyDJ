# MoodyDJ UI Structure Diagram

This diagram represents the hierarchy and connection of pages and components within the MoodyDJ client.

```mermaid
graph TD
    %% Main Entry
    App[App.jsx - Router & State] --> Routes{Routes}

    %% Auth Flow
    Routes --> Login[LoginPage.jsx]
    Routes --> Signup[SignupPage.jsx]

    %% Protected Routes
    Routes --> PR[ProtectedRoute.jsx]
    
    PR --> ModeSel[ModeSelection.jsx]
    PR --> Landing[LandingPage.jsx]
    PR --> Solo[SoloPage.jsx]
    PR --> Player[PlayerPage.jsx]
    PR --> Profile[ProfilePage.jsx]
    PR --> Artists[ArtistSelection.jsx]

    %% Player Page Detail
    Player --> Nav[Navbar.jsx]
    Player --> PlayCard[PlayerCard.jsx]
    Player --> QPanel[QueuePanel.jsx]

    PlayCard --> YT[YouTubePlayer.jsx]
    PlayCard --> Visual[VisualizerCard.jsx]
    PlayCard --> Prog[ProgressBar.jsx]

    %% Connections
    ModeSel -.-> Solo
    Solo -.-> Player
    Landing -.-> Player
    Landing -.-> Artists
    Artists -.-> ModeSel
```

## Page Descriptions

| Page | Purpose |
| :--- | :--- |
| **LoginPage / SignupPage** | User authentication and session initiation. |
| **ModeSelection** | Higher-level choice of how to experience the music (Solo/Personalized). |
| **LandingPage** | Main dashboard for selecting moods and toggling personalization. |
| **SoloPage** | Focused mood selection for immediate playback. |
| **PlayerPage** | The core streaming interface where the music plays. |
| **ProfilePage** | Displays user history, stats, and account settings. |
| **ArtistSelection** | Interactive selection of favorite artists to tune the recommendation engine. |

## Component Descriptions

| Component | Responsibility |
| :--- | :--- |
| **Navbar** | Persistent top-level navigation and quick mood switching. |
| **PlayerCard** | Central hub for playback controls, volume, and song metadata. |
| **QueuePanel** | Side/Bottom panel showing upcoming songs and recently played history. |
| **VisualizerCard** | Visual representation of the track (Vinyl animation, Glows). |
| **ProgressBar** | Interactive timeline for seeking through the current track. |
| **YouTubePlayer** | The underlying engine that handles actual media playback via IFrame API. |
