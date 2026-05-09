require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const songsRoute = require("./routes/songs");

app.use(cors());
app.use(express.json());
app.use("/api", songsRoute);

app.get("/", (req, res) => {
  res.send("Server running 🚀");
});

// ============================================================
// PHASE 2: PART D - Quota Status Endpoint
// ============================================================
app.get("/api/quota-status", (req, res) => {
  const { quotaTracker, getNextMidnightPT } = songsRoute;
  if (!quotaTracker) {
    return res.status(500).json({ error: "Quota tracker not initialized" });
  }
  res.json({
    unitsUsed: quotaTracker.unitsUsed,
    remaining: 10000 - quotaTracker.unitsUsed,
    isQuotaSafe: quotaTracker.unitsUsed + 100 <= 8500,
    resetTime: quotaTracker.resetTime,
  });
});

// ============================================================
// PHASE 2: PART E - Midnight Reset Interval
// ============================================================
setInterval(() => {
  const { quotaTracker, getNextMidnightPT } = songsRoute;
  if (quotaTracker && Date.now() >= quotaTracker.resetTime) {
    console.log("🕛 Midnight PT reached! Resetting YouTube quota.");
    quotaTracker.unitsUsed = 0;
    quotaTracker.resetTime = getNextMidnightPT();
  }
}, 60 * 1000);

const { initFirebaseAdmin } = require("./firebaseAdmin");

app.get("/test-firebase", async (req, res) => {
  const db = initFirebaseAdmin();

  if (!db) {
    return res.status(500).send("Firebase not initialized");
  }

  try {
    await db.collection("test").doc("check").set({
      status: "working",
      time: Date.now()
    });

    res.send("✅ Firebase working");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Firebase failed");
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});