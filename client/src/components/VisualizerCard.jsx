import "./VisualizerCard.css";

function VisualizerCard({ thumbnail, title, artist, isPlaying = false }) {
  return (
    <div className={`visualizer-card ${isPlaying ? "playing" : ""}`}>
      
      <div className="vis-bg-glow" />
      <div className="vis-bg-glow vis-bg-glow-2" />

      <div className="visualizer-content">
        
        <div className="disc-container">

          <div className={`disc-glow-ring ${isPlaying ? "active" : ""}`} />

          {/* 🔥 NO JS CONTROL — PURE CSS */}
          <div className={`vinyl-disc ${isPlaying ? "spin" : ""}`}>

            <div className="vinyl-grooves" />

            <div className="vinyl-art-mask">
              {thumbnail ? (
                <img
                  src={thumbnail}
                  alt={title}
                  className="album-art"
                  draggable="false"
                />
              ) : (
                <div className="album-placeholder">♪</div>
              )}
            </div>

            <div className="vinyl-shine" />
            <div className="vinyl-reflection" />
          </div>

          {/* center hole */}
          <div className="vinyl-center-hole">
            <div className="vinyl-center-dot" />
          </div>
        </div>

        <div className="spectrum-wrapper">
          <div className="spectrum-side">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`vis-bar ${isPlaying ? "bouncing" : ""}`}
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default VisualizerCard;