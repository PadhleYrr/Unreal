/**
 * UNREAL — Node.js Frontend Server
 * Serves the vision UI and provides REST API for face data persistence.
 */

require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const path     = require("path");
const { MongoClient } = require("mongodb");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname)));

// MongoDB setup
let db;
const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017");

async function connectDB() {
  try {
    await client.connect();
    db = client.db("unreal");
    console.log("MongoDB connected.");
  } catch (err) {
    console.warn("MongoDB unavailable — running without persistence.", err.message);
  }
}

// ── Routes ────────────────────────────────────────────────────────────────

// Serve the main UI
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});



// Save a face descriptor
app.post("/api/faces", async (req, res) => {
  try {
    const { name, descriptor, image } = req.body;
    if (!name || !descriptor) return res.status(400).json({ error: "name and descriptor required" });
    if (db) {
      await db.collection("faces").updateOne(
        { name },
        { $set: { name, descriptor, image, updatedAt: new Date() } },
        { upsert: true }
      );
    }
    res.json({ success: true, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all saved faces
app.get("/api/faces", async (req, res) => {
  try {
    if (!db) return res.json([]);
    const faces = await db.collection("faces").find({}).toArray();
    res.json(faces);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a face by name
app.delete("/api/faces/:name", async (req, res) => {
  try {
    if (db) await db.collection("faces").deleteOne({ name: req.params.name });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "UNREAL online", version: "1.0.0", db: db ? "connected" : "offline" });
});

// ── Start ─────────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`UNREAL frontend running at http://localhost:${PORT}`);
  });
});
