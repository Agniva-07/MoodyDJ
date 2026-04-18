function formatCount(value) {
  if (!value) return "0";
  const numeric = Number(value);
  if (numeric >= 1000000) return `${(numeric / 1000000).toFixed(1)}M`;
  if (numeric >= 1000) return `${(numeric / 1000).toFixed(1)}K`;
  return numeric.toString();
}

function PlayerCard({
  song,
  isPlaying,
  stats,
  shuffle,
  onPlayPause,
  onPrev,
  onNext,
  onShuffle,
  onLike,
  onDislike,
  likedKeywords,
  dislikedKeywords,
  liked,
}) {
  return (
    <section className="player-card fade-in">
      <div className="album-orb-wrap">
        <div className="album-orb">
          {song?.thumbnail ? (
            <img src={song.thumbnail} alt={song.title} />
          ) : (
            <span>▶♫</span>
          )}
        </div>
      </div>

      <div className="track-meta">
        <h2>{song?.title || "Choose a mood to begin"}</h2>
        <p>{song?.channelTitle || "Now streaming..."}</p>
      </div>

      <div className="radio-device glass">
        <div className="youtube-shell">
          <div id="player" className="youtube-frame" />
        </div>
      </div>

      <div className="spectrum">
        {Array.from({ length: 24 }).map((_, index) => (
          <span
            key={`bar-${index}`}
            className="spectrum-bar"
            style={{
              animationDuration: `${0.7 + ((index % 6) * 0.12)}s`,
              animationDelay: `${index * 0.04}s`,
            }}
          />
        ))}
      </div>

      <div className="controls-row">
        <button type="button" className="control-btn" onClick={onPrev} aria-label="Previous song">
          ⏮
        </button>
        <button type="button" className="control-btn play-btn" onClick={onPlayPause} aria-label="Play or pause">
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button type="button" className="control-btn" onClick={onNext} aria-label="Next song">
          ⏭
        </button>
        <button
          type="button"
          className={`control-btn ${shuffle ? "active" : ""}`}
          onClick={onShuffle}
          aria-label="Toggle shuffle"
        >
          🔀
        </button>
        <button 
          type="button" 
          className={`control-btn like-btn ${liked ? "active" : ""}`} 
          onClick={onLike} 
          aria-label="Like song"
          style={{ color: liked ? "#ff4444" : "white" }}
        >
          ♥
        </button>
        <button type="button" className="control-btn" onClick={onDislike} aria-label="Dislike song">
          👎
        </button>
      </div>

      <div className="feedback-row">
        <span>👍 {likedKeywords?.slice(-2).join(", ") || "none"}</span>
        <span>👎 {dislikedKeywords?.slice(-2).join(", ") || "none"}</span>
      </div>

      <div className="stats-row">
        <span>👁 Views {formatCount(stats?.viewCount)}</span>
        <span>❤️ Likes {formatCount(stats?.likeCount)}</span>
      </div>
    </section>
  );
}

export default PlayerCard;
