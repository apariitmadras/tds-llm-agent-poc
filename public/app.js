// public/app.js
const elMsgs = document.getElementById("messages");
const elInput = document.getElementById("input");
const elSend = document.getElementById("send");
const elModel = document.getElementById("model");
const elAlerts = document.getElementById("alerts");

let messages = [{
  role: "system",
  content: "You are a concise assistant. Use tools when needed. Prefer factual answers."
}];

// OpenAI tool/function schemas
const tools = [
  {
    type: "function",
    function: {
      name: "search",
      description: "Return Google search snippets for a query",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "aipipe",
      description: "Call an AI Pipe proxy with a path and payload. Always send a JSON object in 'payload'.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative API path (default /run). For Postman Echo use /post." },
          payload: {
            type: "object",
            description: "Arbitrary JSON object to send to the pipe",
            additionalProperties: true
          }
        },
        required: ["payload"] // ensure the model includes a payload
      }
    }
  },
  {
    type: "function",
    function: {
      name: "js_exec",
      description: "Run JavaScript in a sandbox; return stdout/result as text",
      parameters: {
        type: "object",
        properties: { code: { type: "string", description: "JavaScript code to run" } },
        required: ["code"]
      }
    }
  }
];

function alertError(msg) {
  elAlerts.innerHTML = `<div class="alert alert-danger alert-dismissible fade show" role="alert">
    ${msg}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  </div>`;
}

function add(role, text) {
  const who = role === "user" ? "🧑 You" : role === "assistant" ? "🤖 Agent" : "🔧 Tool";
  const line = document.createElement("div");
  line.textContent = `${who}: ${text}`;
  elMsgs.appendChild(line);
  elMsgs.scrollTop = elMsgs.scrollHeight;
}

async function callOpenAI() {
  const model = elModel.value;
  const r = await fetch("/api/openai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, model, tools })
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`OpenAI call failed: ${text}`);
  }
  const data = await r.json();
  return data.choices?.[0]?.message || {};
}

function runInSandbox(code) {
  return new Promise((resolve) => {
    const frame = document.getElementById("sandbox").contentWindow;
    const id = Math.random().toString(36).slice(2);
    function handler(ev) {
      if (ev.data?.id === id) {
        window.removeEventListener("message", handler);
        resolve(ev.data.result);
      }
    }
    window.addEventListener("message", handler);
    frame.postMessage({ id, code }, "*");
  });
}

async function handleToolCall(tc) {
  try {
    const name = tc.function?.name;
    const args = JSON.parse(tc.function?.arguments || "{}");

    if (name === "search") {
      const r = await fetch(`/api/search?q=${encodeURIComponent(args.query || "")}`);
      const data = await r.json();
      return JSON.stringify(data);
    }

    if (name === "aipipe") {
      // Normalize args for robust calls (e.g., Postman Echo via /post)
      let p = args.path || "/run";
      let payload = args.payload;

      // If payload is a JSON string, parse it
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { /* ignore and treat as empty */ }
      }
      // Ensure payload is a plain object
      if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
        payload = {};
      }

      const r = await fetch(`/api/aipipe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: p, payload })
      });
      const data = await r.json();
      return JSON.stringify(data);
    }

    if (name === "js_exec") {
      const out = await runInSandbox(args.code || "");
      return typeof out === "string" ? out : JSON.stringify(out);
    }

    return "ERROR: Unknown tool";
  } catch (e) {
    alertError(e.message);
    return `ERROR: ${e.message}`;
  }
}

// Core loop: ask model → if assistant returns tool_calls, send tool results back → repeat
async function agentTurn() {
  const assistantMsg = await callOpenAI();

  // Push the assistant message (with tool_calls) BEFORE sending any tool results
  const envelope = {
    role: "assistant",
    content: assistantMsg.content ?? null
  };
  if (Array.isArray(assistantMsg.tool_calls) && assistantMsg.tool_calls.length) {
    envelope.tool_calls = assistantMsg.tool_calls;
  }
  messages.push(envelope);

  if (assistantMsg.content?.trim()) add("assistant", assistantMsg.content);

  if (Array.isArray(assistantMsg.tool_calls) && assistantMsg.tool_calls.length) {
    const MAX_TOOL_CHARS = 12000; // keep context safe
    for (const tc of assistantMsg.tool_calls) {
      const toolResult = await handleToolCall(tc);

      // Send back tool result linked to the tool_call_id
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: String(toolResult).slice(0, MAX_TOOL_CHARS)
      });

      // UI preview
      add("tool", String(toolResult).slice(0, 800));
    }
    // Ask the model again with the tool outputs included
    return agentTurn();
  }

  // No tool calls; turn ends here.
}

elSend.onclick = async () => {
  const text = elInput.value.trim();
  if (!text) return;
  elInput.value = "";
  messages.push({ role: "user", content: text });
  add("user", text);
  try {
    await agentTurn();
  } catch (e) {
    alertError(e.message);
  }
};

// (optional) press Enter to send
elInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    elSend.click();
  }
});
