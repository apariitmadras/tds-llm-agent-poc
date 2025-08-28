import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";
import { OpenAI } from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

app.get("/healthz", (req, res) => res.json({ status: "ok", build: "poc-v1" }));

// --- OpenAI proxy (tool-calling) ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/api/openai", async (req, res) => {
  try {
    const { messages, model, tools } = req.body || {};
    const resp = await openai.chat.completions.create({
      model: model || process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.2
    });
    res.json(resp);
  } catch (e) {
    console.error("OpenAI error:", e);
    res.status(500).json({ error: e.message || "OpenAI error" });
  }
});

// --- Search proxy (SerpAPI or Google CSE). Falls back to stub if keys missing. ---
app.get("/api/search", async (req, res) => {
  try {
    const q = String(req.query.q || "");
    const provider = process.env.SEARCH_PROVIDER || "serpapi";

    // Prefer real providers if env keys set
    if (provider === "serpapi" && process.env.SERPAPI_API_KEY) {
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&api_key=${process.env.SERPAPI_API_KEY}`;
      const r = await fetch(url);
      const data = await r.json();
      const snippets = (data.organic_results || []).slice(0, 5).map(r => ({
        title: r.title, link: r.link, snippet: r.snippet
      }));
      return res.json({ provider, q, snippets });
    }

    if (provider === "google_cse" && process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX) {
      const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(q)}&key=${process.env.GOOGLE_CSE_KEY}&cx=${process.env.Google_CSE_CX || process.env.GOOGLE_CSE_CX}`;
      const r = await fetch(url);
      const data = await r.json();
      const snippets = (data.items || []).slice(0, 5).map(item => ({
        title: item.title, link: item.link, snippet: item.snippet
      }));
      return res.json({ provider, q, snippets });
    }

    // Graceful stub (lets the app run without search keys)
    return res.json({
      provider: "stub",
      q,
      snippets: [
        { title: "Enable real search", link: "#", snippet: "Set SERPAPI_API_KEY or GOOGLE_CSE_KEY + GOOGLE_CSE_CX on Railway." }
      ]
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- AI Pipe proxy (optional) ---
app.post("/api/aipipe", async (req, res) => {
  try {
    const base = process.env.AIPIPE_BASE_URL;
    const key = process.env.AIPIPE_API_KEY;
    const { path: p = "/run", payload = {} } = req.body || {};
    if (!base) return res.status(400).json({ error: "AIPIPE_BASE_URL missing" });

    const url = base.replace(/\/$/, "") + p;
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Start server ---
const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`listening on ${port}`));
