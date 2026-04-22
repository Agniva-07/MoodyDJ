import { useRef, useEffect, useState } from "react";
import YouTubePlayer from "./YouTubePlayer";
import ProgressBar from "./ProgressBar";
import VisualizerCard from "./VisualizerCard";

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

  // 🔊 Volume
  const handleVolumeChange = (e) => {
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
    if (playerRef?.current && typeof playerRef.current.setVolume === "function") {
      playerRef.current.setVolume(newVolume);
    }
  };

  // ⏱ Time update
  const handleTimeUpdate = (current, dur) => {
    setCurrentTime(current);
    setDuration(dur);
  };

  // ⏩ Seek
  const handleSeek = (time) => {
    if (!playerRef?.current || !playerReady) return;
    playerRef.current.seekTo(time, true);
  };

  // 🎮 Player state
  const handlePlayerStateChange = (state) => {
    if (state === 1) setLocalPlaying(true);
    if (state === 2) setLocalPlaying(false);

    if (state === 0) {
      onNext?.();
    }
  };

  // ▶️ Play / Pause
  const handlePlayPause = () => {
    if (!playerRef?.current || !playerReady) return;

    const state = playerRef.current.getPlayerState();

    if (state === 1) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  return (
    <section className="player-card">

      {/* 🎬 PLAYER */}
      {song?.videoId && (
        <YouTubePlayer
          videoId={song.videoId}
          onStateChange={handlePlayerStateChange}
          onTimeUpdate={handleTimeUpdate}
          playerRef={playerRef}
          onPlayerReady={() => setPlayerReady(true)}
        />
      )}

      {/* 🎨 VISUALIZER */}
      <div className="visualizer-section">
        <VisualizerCard
          thumbnail={song?.thumbnail}
          title={song?.title}
          artist={song?.channelTitle}
          isPlaying={localPlaying && playerReady}
        />
      </div>

      {/* 🎵 META */}
      <div className="track-meta">
        <h2>{song?.title}</h2>
        <p>{song?.channelTitle}</p>
      </div>

      {/* ⏱ PROGRESS */}
      <ProgressBar
        currentTime={currentTime}
        duration={duration}
        onSeek={handleSeek}
        isPlaying={localPlaying && playerReady}
      />

      {/* 🎛 CONTROLS (FIXED) */}
      <div className="controls-row">
        <button className="control-btn shuffle-btn" onClick={onShuffle}>
          🔀
        </button>

        <button
          className="control-btn"
          onClick={onPrev}
          disabled={!playerReady}
        >
          ⏮
        </button>

        <button
          className={`control-btn play-btn ${localPlaying ? "is-playing" : ""}`}
          onClick={handlePlayPause}
          disabled={!playerReady}
        >
          {localPlaying ? "⏸" : "▶"}
        </button>

        <button
          className="control-btn"
          onClick={onNext}
          disabled={!playerReady}
        >
          ⏭
        </button>

        <button
          className="control-btn like-btn"
          onClick={onLike}
          disabled={!playerReady}
        >
          ♥
        </button>
      </div>

      {/* 🔊 VOLUME */}
      <div className="volume-control">
        <span>🔊</span>
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={handleVolumeChange}
        />
      </div>

      {/* 📊 STATS */}
      <div className="stats-row">
        <span>👁 {stats?.viewCount || 0}</span>
        <span>❤️ {stats?.likeCount || 0}</span>
      </div>

      {/* 👍👎 */}
      <div className="feedback-row">
        <span>👍 {likedKeywords?.join(", ") || "none"}</span>
        <span>👎 {dislikedKeywords?.join(", ") || "none"}</span>
      </div>

    </section>
  );
}

export default PlayerCard;