import YouTubePlayer from "./YouTubePlayer";

function formatCount(value) {
  if (!value) return "0";
  const numeric = Number(value);
  if (numeric >= 1000000) return `${(numeric / 1000000).toFixed(1)}M`;
  if (numeric >= 1000) return `${(numeric / 1000).toFixed(1)}K`;
  return numeric.toString();
}

function Player({
  song,
  isPlaying,
  stats,
  shuffle,
  onPlayPause,
  onPrev,
  onNext,
  onShuffle,
  onLike,
}) {
  return (
    <section className="player-core glass fade-in">
      <div className="radio-device">
        <div className="youtube-shell">
          {song?.videoId && <YouTubePlayer videoId={song.videoId} />}
        </div>
      </div>

      <div className="track-meta">
        <h3>{song?.title || "Choose a mood to begin"}</h3>
        <p>{song?.channelTitle || "Futuristic sound chamber ready"}</p>
      </div>

      <div className="spectrum">
        {Array.from({ length: 20 }).map((_, index) => (
          <span
            key={`bar-${index}`}
            className="spectrum-bar"
            style={{ animationDelay: `${index * 0.06}s` }}
          />
        ))}
      </div>

      <div className="controls-row">
        <button type="button" onClick={onPrev}>⏮</button>
        <button type="button" onClick={onPlayPause}>{isPlaying ? "⏸" : "▶"}</button>
        <button type="button" onClick={onNext}>⏭</button>
        <button type="button" className={shuffle ? "active" : ""} onClick={onShuffle}>🔀</button>
        <button type="button" onClick={onLike}>♥</button>
      </div>

      <div className="stats-row">
        <span>Views: {formatCount(stats?.viewCount)}</span>
        <span>Likes: {formatCount(stats?.likeCount)}</span>
      </div>
    </section>
  );
}

export default Player;
