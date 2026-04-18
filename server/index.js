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

app.listen(5000, () => {
  console.log("Server running on port 5000");
});