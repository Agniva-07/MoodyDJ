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