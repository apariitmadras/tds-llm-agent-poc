# LLM Agent (POC)

A tiny **browser-based agent** that chats with you and can call tools to get stuff done.  
Tools included: **Web Search (Google CSE)**, **JavaScript Sandbox (`js_exec`)**, and **AI Pipe proxy**.  
Built with a minimal Express server + vanilla JS UI. Deployed easily on **Railway**.

**Live demo:** https://tds-llm-agent-poc-production.up.railway.app/

---

## Features

- **Agent loop with OpenAI tool-calling**  
  Assistant ↔ tool_calls ↔ tool results (linked via `tool_call_id`) until a final answer.
- **Search tool (Google Programmable Search / CSE)**  
  Returns top snippets to ground answers; falls back to `stub` if not configured.
- **JavaScript execution tool (`js_exec`)**  
  Executes code in an isolated iframe sandbox; previews output and surfaces errors.
- **AI Pipe tool**  
  Server-side proxy to any HTTP JSON endpoint (works out-of-the-box with Postman Echo).
- **Clean UI**  
  Model dropdown, chat window, Bootstrap alerts for errors, large-output trimming.

---

## Project Structure

