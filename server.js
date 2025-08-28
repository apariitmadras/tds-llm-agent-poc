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

// OpenAI proxy (protects your API key). The frontend sends messages+tools here.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.post("/api/openai", async (req, res) => {
  try {
    const { messages, model, tools } = req.body;
    const resp = await openai.chat.completions.create({
      model: model || process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.2
    });
    res.json(resp);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "OpenAI error" });
  }
});

// Google Search proxy (SerpAPI or Google CSE)
app.get("/api/search", async (req, res) => {
  try {
    const q = String(req.query.q || "");
    const provider = process.env.SEARCH_PROVIDER || "serpapi";
    if (provider === "serpapi") {
      const key = process.env.SERPAPI_API_KEY;
      if (!key) throw new Error("SERPAPI_API_KEY missing");
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&api_key=${key}`;
      const r = await fetch(url);
      const data = await r.json();
      const snippets = (data.organic_results || []).slice(0, 5).map(r => ({
        title: r.title, link: r.link, snippet: r.snippet
      }));
      return res.json({ provider, q, snippets });
    } else if (provider === "google_cse") {
      const key = process.env.GOOGLE_CSE_KEY, cx = process.env.GOOGLE_CSE_CX;
      if (!key || !cx) throw new Error("GOOGLE_CSE_KEY/CX missing");
      const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(q)}&key=${key}&cx=${cx}`;
      const r = await fetch(url);
      const data = await r.json();
      const snippets = (data.items || []).slice(0, 5).map(item => ({
        title: item.title, link: item.link, snippet: item.snippet
      }));
      return res.json({ provider, q, snippets });
    }
    throw new Error("Unknown SEARCH_PROVIDER");
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// AI Pipe proxy (optional)
app.post("/api/aipipe", async (req, res) => {
  try {
    const base = process.env.AIPIPE_BASE_URL;
    const key = process.env.AIPIPE_API_KEY;
    const { path: p = "/run", payload = {} } = req.body || {};
    if (!base) throw new Error("AIPIPE_BASE_URL missing");
    const url = base.replace(/\/$/, "") + p;
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { "authorization": `Bearer ${key}` } : {}) },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`listening on ${port}`));
