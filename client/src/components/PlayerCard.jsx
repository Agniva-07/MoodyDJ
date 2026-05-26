import { useEffect, useMemo, useRef, useState } from "react";
import { getColor } from "colorthief";
import YouTubePlayer from "./YouTubePlayer";
import ProgressBar from "./ProgressBar";
import VisualizerCard from "./VisualizerCard";
import AddToPlaylistModal from "./playlist/AddToPlaylistModal";
import "./PlayerCard.css";

const FALLBACK_ACCENT = "#7c3aed";
const FALLBACK_GLOW = "rgba(124, 58, 237, 0.6)";

// ─── BACKGROUND PLAY JUGAAD ──────────────────────────────────────────────────
// How it works:
// 1. A silent <audio loop> element tricks Android Chrome into keeping the
//    tab's audio context alive when the screen locks or tab is backgrounded.
// 2. A visibilitychange listener detects screen-off and re-nudges the YouTube
//    player to resume (Chrome sometimes pauses the iframe on visibility change).
// 3. silentAudio.play() MUST be called from a user gesture (play button click)
//    — browsers block autoplay. After that first gesture it loops silently forever.
// Limitations: Android Chrome only. iOS Safari hard-blocks this. Does NOT work
// if user explicitly pauses before locking screen.
// ─────────────────────────────────────────────────────────────────────────────

function PlayerCard({
  song,
  stats,
  onPrev,
  onNext,
  onShuffle,
  onLike,
  onDislike,
  liked,
  disliked,
  likedKeywords,
  dislikedArtists,
  playerRef,
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [volume, setVolume] = useState(50);
  const [themeAccent, setThemeAccent] = useState(FALLBACK_ACCENT);
  const [themeGlow, setThemeGlow] = useState(FALLBACK_GLOW);
  const [showAddModal, setShowAddModal] = useState(false);

  // ── jugaad refs ──────────────────────────────────────────────────────────
  const silentAudioRef = useRef(null);
  const silentStartedRef = useRef(false); // tracks if user gesture has unlocked audio
  const localPlayingRef = useRef(false);  // mirror of localPlaying for use inside event listeners
  // ─────────────────────────────────────────────────────────────────────────

  // Keep localPlayingRef in sync with localPlaying state
  useEffect(() => {
    localPlayingRef.current = localPlaying;
  }, [localPlaying]);

  // ── Start silent audio (must be called from a user gesture) ──────────────
  const startSilentAudio = () => {
    const audio = silentAudioRef.current;
    if (!audio || silentStartedRef.current) return;
    audio.play()
      .then(() => {
        silentStartedRef.current = true;
        console.log("🔇 [BG_PLAY] Silent audio loop started — background playback armed");
      })
      .catch((err) => {
        // Browser blocked it — will retry on next gesture
        console.warn("🔇 [BG_PLAY] Silent audio blocked (expected on first load):", err.message);
      });
  };
  // ─────────────────────────────────────────────────────────────────────────

  // ── Visibility change handler ─────────────────────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Screen locked or tab backgrounded
        // Re-arm the silent audio in case browser suspended it
        const audio = silentAudioRef.current;
        if (audio && silentStartedRef.current) {
          audio.play().catch(() => {});
        }
      } else {
        // Screen came back — if we were playing, nudge YouTube to resume
        // (small delay because the iframe needs a moment to wake up)
        if (localPlayingRef.current && playerRef?.current) {
          setTimeout(() => {
            try {
              const state = playerRef.current?.getPlayerState?.();
              // state 2 = paused, -1 = unstarted — both need a nudge
              if (state === 2 || state === -1) {
                playerRef.current.playVideo();
                console.log("▶️ [BG_PLAY] Nudged YouTube player on screen wake");
              }
            } catch (e) {
              // Silently ignore — player may not be ready
            }
          }, 400);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [playerRef]);
  // ─────────────────────────────────────────────────────────────────────────

  const handleVolumeChange = (e) => {
    const newVolume = parseInt(e.target.value, 10);
    setVolume(newVolume);
    if (playerRef?.current && typeof playerRef.current.setVolume === "function") {
      playerRef.current.setVolume(newVolume);
    }
  };

  const handleTimeUpdate = (current, dur) => {
    setCurrentTime(current);
    setDuration(dur);
  };

  const handleSeek = (time) => {
    if (!playerRef?.current || !playerReady) return;
    playerRef.current.seekTo(time, true);
  };

  const handlePlayerStateChange = (state) => {
    if (state === 1) setLocalPlaying(true);
    if (state === 2) setLocalPlaying(false);

    if (state === 0) {
      onNext?.();
    }
  };

  const handlePlayPause = () => {
    if (!playerRef?.current || !playerReady) return;

    const state = playerRef.current.getPlayerState();

    if (state === 1) {
      playerRef.current.pauseVideo();
    } else {
      // ── User gesture: unlock silent audio here ──
      startSilentAudio();
      playerRef.current.playVideo();
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const applyAccent = (accent, glow) => {
      if (isCancelled) return;
      setThemeAccent(accent);
      setThemeGlow(glow);
      document.documentElement.style.setProperty("--accent", accent);
      document.documentElement.style.setProperty("--accent-glow", glow);
    };

    const extractAccent = async () => {
      if (!song?.thumbnail) {
        applyAccent(FALLBACK_ACCENT, FALLBACK_GLOW);
        return;
      }

      try {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.referrerPolicy = "no-referrer";

        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = song.thumbnail;
        });

        const color = await getColor(image);
        const [r, g, b] = color ? color.rgb() : [124, 58, 237];
        applyAccent(`rgb(${r}, ${g}, ${b})`, `rgba(${r}, ${g}, ${b}, 0.6)`);
      } catch {
        applyAccent(FALLBACK_ACCENT, FALLBACK_GLOW);
      }
    };

    extractAccent();

    return () => {
      isCancelled = true;
    };
  }, [song?.thumbnail]);

  const playerThemeStyle = useMemo(
    () => ({
      "--accent": themeAccent,
      "--accent-glow": themeGlow,
    }),
    [themeAccent, themeGlow]
  );

  const handleMagneticMove = (event) => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 10;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 10;
    button.style.setProperty("--magnet-x", `${x}px`);
    button.style.setProperty("--magnet-y", `${y}px`);
  };

  const resetMagneticMove = (event) => {
    event.currentTarget.style.setProperty("--magnet-x", "0px");
    event.currentTarget.style.setProperty("--magnet-y", "0px");
  };

  const sharedButtonProps = {
    onMouseMove: handleMagneticMove,
    onMouseLeave: resetMagneticMove,
  };

  return (
    <section className="player-card" style={playerThemeStyle}>

      {/* ── Silent audio loop for background playback jugaad ── */}
      {/* Place it here so it lives as long as PlayerCard is mounted */}
      <audio
        ref={silentAudioRef}
        src="/silence.mp3"
        loop
        preload="auto"
        style={{ display: "none" }}
      />

      <div key={song?.videoId} className="song-card-enter">
      <div className="player-card__noise" />
      <div className="player-card__aura" />
      <div className="player-card__aura player-card__aura--secondary" />
      <div className="player-card__inner">
        {song?.videoId && (
          <YouTubePlayer
            videoId={song.videoId}
            onStateChange={handlePlayerStateChange}
            onTimeUpdate={handleTimeUpdate}
            playerRef={playerRef}
            onPlayerReady={() => setPlayerReady(true)}
          />
        )}

        <div className="visualizer-section">
          <VisualizerCard
            thumbnail={song?.thumbnail}
            title={song?.title}
            artist={song?.channelTitle}
            isPlaying={localPlaying && playerReady}
          />
        </div>

        <div className="track-meta">
          <span className="track-meta__eyebrow">Now spinning</span>
          <h2>{song?.title || "Select a track"}</h2>
          <p>{song?.channelTitle || "MoodyDJ"}</p>
        </div>

        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          onSeek={handleSeek}
          isPlaying={localPlaying && playerReady}
        />

        <div className="controls-row">
          <button className="control-btn shuffle-btn" onClick={onShuffle} {...sharedButtonProps}>
            🔀
          </button>

          <button className="control-btn" onClick={onPrev} disabled={!playerReady} {...sharedButtonProps}>
            ⏮
          </button>

          <button
            className={`control-btn play-btn ${localPlaying ? "is-playing" : ""}`}
            onClick={handlePlayPause}
            disabled={!playerReady}
            {...sharedButtonProps}
          >
            {localPlaying ? "⏸" : "▶"}
          </button>

          <button className="control-btn" onClick={onNext} disabled={!playerReady} {...sharedButtonProps}>
            ⏭
          </button>

          <button className={`control-btn like-btn ${liked ? 'active' : ''}`} onClick={onLike} disabled={!playerReady} title="Like" {...sharedButtonProps}>
            {liked ? '❤️' : '♡'}
          </button>

          <button className={`control-btn dislike-btn ${disliked ? 'active' : ''}`} onClick={onDislike} disabled={!playerReady} title="Dislike" {...sharedButtonProps}>
            {disliked ? '👎' : '👎'}
          </button>
          
          <button className="control-btn" onClick={() => setShowAddModal(true)} disabled={!playerReady} title="Add to Playlist" {...sharedButtonProps}>
            📂
          </button>
        </div>

        <div className="volume-control">
          <span className="volume-icon">🔊</span>
          <div className="volume-slider-shell">
            <input type="range" min="0" max="100" value={volume} onChange={handleVolumeChange} />
          </div>
          <span className="volume-value">{volume}</span>
        </div>

        <div className="stats-row">
          <span>👁 {stats?.viewCount || 0}</span>
          <span>❤️ {stats?.likeCount || 0}</span>
        </div>

        <div className="feedback-row">
          <span>👍 {likedKeywords?.join(", ") || "none"}</span>
          <span>👎 {dislikedArtists?.join(", ") || "none"}</span>
        </div>
      </div>
      </div>
      
      {showAddModal && <AddToPlaylistModal song={song} onClose={() => setShowAddModal(false)} isOpen={true} />}
    </section>
  );
}

export default PlayerCard;