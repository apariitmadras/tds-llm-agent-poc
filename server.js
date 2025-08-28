// server.js
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

// --- static files ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// --- health check ---
app.get("/healthz", (req, res) => res.json({ status: "ok", build: "poc-v1" }));

// --- OpenAI proxy (tool-calling) ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function handleOpenAI(req, res) {
  try {
    const { messages, model, tools } = req.body || {};
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ error: "OPENAI_API_KEY missing" });
    }
    const resp = await openai.chat.completions.create({
      model: model || process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.2
    });
    res.json(resp);
  } catch (e) {
    console.error("OpenAI error:", e?.response?.data || e.message);
    res.status(500).json({ error: e.message || "OpenAI error" });
  }
}

// Accept both /api/openai and /api (alias)
app.post("/api/openai", handleOpenAI);
app.post("/api", handleOpenAI);

// --- Search proxy (Google CSE by default; SerpAPI optional) ---
app.get("/api/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const provider = (process.env.SEARCH_PROVIDER || "google_cse").toLowerCase();

    if (!q) return res.json({ provider, q, snippets: [] });

    // Google Custom Search (Programmable Search) JSON API
    if (provider === "google_cse") {
      const key = process.env.GOOGLE_CSE_KEY;
      const cx = process.env.GOOGLE_CSE_CX;
      if (!key || !cx) {
        return res.json({
          provider: "stub",
          q,
          snippets: [
            {
              title: "Enable Google CSE",
              link: "#",
              snippet:
                "Set GOOGLE_CSE_KEY and GOOGLE_CSE_CX (and SEARCH_PROVIDER=google_cse) in Railway → Variables."
            }
          ]
        });
      }
      const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(
        q
      )}&key=${key}&cx=${cx}`;
      const r = await fetch(url);
      if (!r.ok) {
        const text = await r.text();
        return res.status(r.status).json({ error: "Google CSE error", details: text });
      }
      const data = await r.json();
      const snippets = (data.items || []).slice(0, 5).map((item) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet
      }));
      return res.json({ provider: "google_cse", q, snippets });
    }

    // SerpAPI (optional)
    if (provider === "serpapi") {
      const key = process.env.SERPAPI_API_KEY;
      if (!key) {
        return res.json({
          provider: "stub",
          q,
          snippets: [
            {
              title: "Enable SerpAPI",
              link: "#",
              snippet: "Set SERPAPI_API_KEY (and SEARCH_PROVIDER=serpapi) in Railway → Variables."
            }
          ]
        });
      }
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(
        q
      )}&api_key=${key}`;
      const r = await fetch(url);
      if (!r.ok) {
        const text = await r.text();
        return res.status(r.status).json({ error: "SerpAPI error", details: text });
      }
      const data = await r.json();
      const snippets = (data.organic_results || []).slice(0, 5).map((it) => ({
        title: it.title,
        link: it.link,
        snippet: it.snippet
      }));
      return res.json({ provider: "serpapi", q, snippets });
    }

    // Unknown provider
    return res.json({
      provider: "stub",
      q,
      snippets: [
        {
          title: "Unknown SEARCH_PROVIDER",
          link: "#",
          snippet: "Use google_cse (recommended) or serpapi."
        }
      ]
    });
  } catch (e) {
    console.error("Search error:", e);
    res.status(500).json({ error: e.message || "Search error" });
  }
});

// --- AI Pipe proxy (optional) ---
app.post("/api/aipipe", async (req, res) => {
  try {
    const base = process.env.AIPIPE_BASE_URL;
    const key = process.env.AIPIPE_API_KEY;
    const { path: subpath = "/run", payload = {} } = req.body || {};
    if (!base) return res.status(400).json({ error: "AIPIPE_BASE_URL missing" });

    const url = base.replace(/\/$/, "") + subpath;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { authorization: `Bearer ${key}` } : {})
      },
      body: JSON.stringify(payload)
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: "AI Pipe error", details: text });
    }
    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error("AI Pipe error:", e);
    res.status(500).json({ error: e.message || "AI Pipe error" });
  }
});

// --- start server ---
const port = process.env.PORT || 8080;
app.listen(port, () => {
  const provider = (process.env.SEARCH_PROVIDER || "google_cse").toLowerCase();
  console.log(`listening on ${port}`);
  console.log(`Search provider: ${provider}`);
  console.log(`OpenAI model: ${process.env.OPENAI_MODEL || "gpt-4o-mini"}`);
});
