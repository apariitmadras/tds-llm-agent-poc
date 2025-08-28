# LLM Agent (POC)

A tiny **browser-based AI agent** that chats with you and can call tools to get work done.  
It demonstrates the **OpenAI tool-calling loop** (functions), a live **Google Search** integration (CSE),
a **JavaScript sandbox** for quick computations, and a flexible **AI Pipe** proxy to call any HTTP JSON API.

**Live app:** https://tds-llm-agent-poc-production.up.railway.app/

---

## What this app is about

This project is a minimal, inspectable reference for building an **LLM-driven agent** that:
- **Decides** when to use tools (search / js / HTTP) based on your prompt,
- **Calls** those tools safely,
- **Loops** the results back into the model for a grounded final answer,
- Shows **clear, simple UI** with a model picker and error alerts,
- Is **easy to host** (Railway) and **easy to modify** (vanilla JS + Express).

It’s intentionally small so students can read the code in one sitting and extend it in class or assignments.

---

## What the user does (and what you get)

### What you do
1. Open the live app and choose a model (e.g., `gpt-4o-mini`).
2. Type a question/request (e.g., “Find IBM’s founding year and summarize in one line.”).
3. (Optionally) direct the agent to use a tool (e.g., “Use the search tool to…”).
4. Watch tool previews as they run (🔧 Tool lines), then read the agent’s final answer.

### What you get
- A **grounded answer** that may cite facts discovered via **Google CSE** snippets.
- **Computed results** from the **JavaScript sandbox** (e.g., Fibonacci numbers, sums).
- **HTTP JSON output** proxied via **AI Pipe** (e.g., Postman Echo or your own service).
- Clean UI: model switcher, streaming-style message feed, Bootstrap error alerts.

> The agent will **keep calling tools** until it has enough information, then stop and answer concisely.

---

## Features

- **Agent loop with OpenAI tool-calling**
  - Sends `messages + tools` → receives `tool_calls` → runs tools → appends `role:"tool"` messages → repeats.
- **Search tool (Google Programmable Search / CSE)**
  - Returns top snippets for grounding (requires your CSE key & CX).
- **JavaScript execution tool (`js_exec`)**
  - Runs code in an isolated iframe; previews stdout and surfaces errors.
- **AI Pipe tool**
  - Server-to-server proxy; call any HTTP JSON endpoint with `{ path, payload }`.
- **Clean, minimal UI**
  - Model picker, chat window, tool previews, Bootstrap alerts.
- **Safe defaults**
  - Output trimming for previews/context, `textContent` (no HTML injection), error guards.

---

## Project structure

