require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const songsRoute = require("./routes/songs");
const { verifyFirebaseToken } = require("./authMiddleware");
const { initFirebaseAdmin } = require("./firebaseAdmin");

app.use(cors());
app.use(express.json());

// Apply auth middleware globally — it's non-blocking (falls back gracefully)
app.use(verifyFirebaseToken);

app.use("/api", songsRoute);

app.get("/", (req, res) => {
  res.send("Server running 🚀");
});

// ============================================================
// Onboarding Status Endpoint (Firestore-backed calendar-day gate)
// ============================================================
app.get("/api/onboarding-status", async (req, res) => {
  const uid = req.authenticatedUid || req.query.userId;
  if (!uid) return res.status(401).json({ error: "Not authenticated" });

  const db = initFirebaseAdmin();
  if (!db) return res.status(500).json({ error: "DB not available" });

  try {
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return res.json({ completedToday: false, lastOnboardedDate: null });
    }
    const data = userDoc.data();
    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
    const completedToday = data.lastOnboardedDate === today;
    return res.json({
      completedToday,
      lastOnboardedDate: data.lastOnboardedDate || null,
      selectedArtists: data.selectedArtists || [],
    });
  } catch (err) {
    console.error("Onboarding status check failed:", err.message);
    return res.status(500).json({ error: "Failed to check onboarding status" });
  }
});

app.post("/api/complete-onboarding", async (req, res) => {
  const uid = req.authenticatedUid;
  if (!uid) return res.status(401).json({ error: "Not authenticated" });

  const { selectedArtistIds } = req.body;
  if (!Array.isArray(selectedArtistIds) || selectedArtistIds.length === 0) {
    return res.status(400).json({ error: "selectedArtistIds required" });
  }

  const db = initFirebaseAdmin();
  if (!db) return res.status(500).json({ error: "DB not available" });

  try {
    const today = new Date().toLocaleDateString("en-CA");
    await db.collection("users").doc(uid).set({
      lastOnboardedDate: today,
      selectedArtists: selectedArtistIds,
    }, { merge: true });

    return res.json({ ok: true, lastOnboardedDate: today });
  } catch (err) {
    console.error("Complete onboarding failed:", err.message);
    return res.status(500).json({ error: "Failed to save onboarding" });
  }
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