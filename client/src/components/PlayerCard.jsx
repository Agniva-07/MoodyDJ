import { useEffect, useMemo, useState } from "react";
import { getColor } from "colorthief";
import YouTubePlayer from "./YouTubePlayer";
import ProgressBar from "./ProgressBar";
import VisualizerCard from "./VisualizerCard";
import "./PlayerCard.css";

const FALLBACK_ACCENT = "#7c3aed";
const FALLBACK_GLOW = "rgba(124, 58, 237, 0.6)";

function PlayerCard({
  song,
  stats,
  onPrev,
  onNext,
  onShuffle,
  onLike,
  likedKeywords,
  dislikedKeywords,
  playerRef,
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [localPlaying, setLocalPlaying] = useState(false);
  const [volume, setVolume] = useState(50);
  const [themeAccent, setThemeAccent] = useState(FALLBACK_ACCENT);
  const [themeGlow, setThemeGlow] = useState(FALLBACK_GLOW);

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

          <button className="control-btn like-btn" onClick={onLike} disabled={!playerReady} {...sharedButtonProps}>
            ♥
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
          <span>👎 {dislikedKeywords?.join(", ") || "none"}</span>
        </div>
      </div>
    </section>
  );
}

export default PlayerCard;
