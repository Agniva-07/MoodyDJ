import { useRef, useState, useEffect } from "react";
import "./ProgressBar.css";

function ProgressBar({ currentTime = 0, duration = 0, onSeek, isPlaying = false }) {
  const progressRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPosition, setHoverPosition] = useState(0);

  const percentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // 🔥 SINGLE SEEK FUNCTION (NO DUPLICATION)
  const calculateSeek = (clientX) => {
    if (!progressRef.current || !duration) return null;

    const rect = progressRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    return (percent / 100) * duration;
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    const seekTime = calculateSeek(e.clientX);
    if (seekTime !== null) onSeek(seekTime);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const seekTime = calculateSeek(e.clientX);
    if (seekTime !== null) onSeek(seekTime);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleHover = (e) => {
    if (!progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setHoverPosition(percent);
  };

  useEffect(() => {
    if (!isDragging) return;

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="progress-container">
      <div className="time-display">{formatTime(currentTime)}</div>

      <div
        ref={progressRef}
        className={`progress-bar ${isDragging ? "dragging" : ""} ${isPlaying ? "playing" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleHover}
        onMouseLeave={() => setHoverPosition(0)}
      >
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${percentage}%` }} />

          {hoverPosition > 0 && (
            <div
              className="progress-hover"
              style={{ left: `${hoverPosition}%` }}
            />
          )}
        </div>

        <div
          className="progress-thumb"
          style={{
            left: `${percentage}%`,
            opacity: isDragging || percentage > 0 ? 1 : 0,
          }}
        />

        {hoverPosition > 0 && (
          <div
            className="progress-tooltip"
            style={{ left: `${hoverPosition}%` }}
          >
            {formatTime((hoverPosition / 100) * duration)}
          </div>
        )}
      </div>

      <div className="time-display">{formatTime(duration)}</div>
    </div>
  );
}

export default ProgressBar;