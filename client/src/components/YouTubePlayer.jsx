import { useEffect, useRef, useState } from "react";

function YouTubePlayer({
  videoId,
  onStateChange,
  onTimeUpdate,
  playerRef,
  onPlayerReady, // ✅ ADD THIS
}) {
  const containerRef = useRef(null);
  const playerInstanceRef = useRef(null);
  const pollingRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const lastVideoIdRef = useRef(null);

  // 🔥 LOAD YT API
  useEffect(() => {
    if (window.YT && window.YT.Player) return;

    const existing = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (existing) return;

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
  }, []);

  // 🔥 CREATE PLAYER (ONLY ONCE)
  useEffect(() => {
    if (playerInstanceRef.current) return;

    const createPlayer = () => {
      if (!containerRef.current) return;

      const player = new window.YT.Player(containerRef.current, {
        width: 300,
        height: 170,
        videoId: "",
        playerVars: {
          autoplay: 0,
          controls: 0,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: (e) => {
            playerInstanceRef.current = e.target;

            if (playerRef) {
              playerRef.current = e.target;
            }

            setIsReady(true);

            // ✅ THIS WAS MISSING
            onPlayerReady?.();

            console.log("✅ Player Ready");
          },

          onStateChange: (e) => {
            console.log("🎮 State:", e.data);
            onStateChange?.(e.data);
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      window.onYouTubeIframeAPIReady = createPlayer;
    }
  }, []);

  // 🔥 LOAD VIDEO
  useEffect(() => {
    if (!isReady || !videoId) return;

    if (lastVideoIdRef.current === videoId) return;
    lastVideoIdRef.current = videoId;

    console.log("📹 Load:", videoId);

    playerInstanceRef.current.loadVideoById(videoId);
  }, [videoId, isReady]);

  // 🔥 POLLING
  useEffect(() => {
    if (!isReady) return;
    if (pollingRef.current) return;

    console.log("📊 Start polling");

    pollingRef.current = setInterval(() => {
      const player = playerInstanceRef.current;
      if (!player) return;

      const current = player.getCurrentTime();
      const duration = player.getDuration();

      if (duration > 0) {
        onTimeUpdate?.(current, duration);
      }
    }, 500);

    return () => {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
      console.log("⏹️ Stop polling");
    };
  }, [isReady]);

  // 🔥 CLEANUP
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);

      if (playerInstanceRef.current) {
        playerInstanceRef.current.destroy();
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "300px",
        height: "170px",
        opacity: 0.01,
        pointerEvents: "none",
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: -1,
      }}
    />
  );
}

export default YouTubePlayer;