import { useState } from "react";
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

  // 🔥 TIME UPDATE
  const handleTimeUpdate = (current, dur) => {
    setCurrentTime(current);
    setDuration(dur);
  };

  // 🔥 SEEK (NO MANUAL TIME SET)
  const handleSeek = (time) => {
    if (!playerRef?.current || !playerReady) return;
    playerRef.current.seekTo(time, true);
  };

  // 🔥 PLAYER STATE (ONLY SOURCE OF TRUTH)
  const handlePlayerStateChange = (state) => {
    console.log("🎮 Player state:", state);

    if (state === 1) setLocalPlaying(true);
    if (state === 2) setLocalPlaying(false);

    if (state === 0) {
      console.log("🔚 Next song");
      onNext?.();
    }
  };

  // 🔥 PLAY / PAUSE
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
      <VisualizerCard
        thumbnail={song?.thumbnail}
        title={song?.title}
        artist={song?.channelTitle}
        isPlaying={localPlaying && playerReady}
      />

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

      {/* 🎛 CONTROLS */}
      <div className="controls-row">
        <button onClick={onShuffle}>🔀</button>
        <button onClick={onPrev} disabled={!playerReady}>⏮</button>

        <button onClick={handlePlayPause} disabled={!playerReady}>
          {localPlaying ? "⏸" : "▶"}
        </button>

        <button onClick={onNext} disabled={!playerReady}>⏭</button>
        <button onClick={onLike} disabled={!playerReady}>♥</button>
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