# LLM Agent POC (Browser)

A tiny browser-based LLM agent that calls tools using **OpenAI tool-calling**:
- Google Search snippets (via SerpAPI or Google CSE)
- AI Pipe proxy (optional)
- Sandboxed JavaScript execution

Minimal Bootstrap UI with model picker & alerts. Designed for hackability.

## How it works
The page sends `messages` + `tools` to an Express proxy (`/api/openai`).  
The model may return `tool_calls`; the browser runs each tool (`/api/search`, `/api/aipipe`, or sandboxed JS), appends the tool results as `role: "tool"` with `tool_call_id`, and asks the model again. This loop continues until the model stops requesting tools. :contentReference[oaicite:1]{index=1}
