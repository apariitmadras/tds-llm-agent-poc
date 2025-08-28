const elMsgs = document.getElementById("messages");
const elInput = document.getElementById("input");
const elSend = document.getElementById("send");
const elModel = document.getElementById("model");
const elAlerts = document.getElementById("alerts");

let messages = [{ role: "system", content:
  "You are a helpful agent. Use tools when needed. Keep answers brief."
}];

// Tool schemas (OpenAI function-calling interface)
const tools = [
  {
    type: "function",
    function: {
      name: "search",
      description: "Google Search snippets",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
    }
  },
  {
    type: "function",
    function: {
      name: "aipipe",
      description: "Call AI Pipe proxy with a payload",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, payload: { type: "object" } }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "js_exec",
      description: "Run JavaScript code in a sandbox and return its stdout/result",
      parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] }
    }
  }
];

function alertError(msg) {
  elAlerts.innerHTML = `<div class="alert alert-danger alert-dismissible fade show" role="alert">
    ${msg}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  </div>`;
}

function add(role, text) {
  const who = role === "user" ? "🧑 You" : role === "assistant" ? "🤖 Agent" : "🔧 Tool";
  elMsgs.innerHTML += `\n${who}: ${text}`;
  elMsgs.scrollTop = elMsgs.scrollHeight;
}

async function callOpenAI() {
  const model = elModel.value;
  const r = await fetch("/api/openai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, model, tools })
  });
  if (!r.ok) throw new Error("OpenAI call failed");
  const data = await r.json();
  const msg = data.choices?.[0]?.message || {};
  return msg;
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
    if (tc.function?.name === "search") {
      const { query } = JSON.parse(tc.function.arguments || "{}");
      const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await r.json();
      return JSON.stringify(data);
    }
    if (tc.function?.name === "aipipe") {
      const args = JSON.parse(tc.function.arguments || "{}");
      const r = await fetch(`/api/aipipe`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(args)
      });
      const data = await r.json();
      return JSON.stringify(data);
    }
    if (tc.function?.name === "js_exec") {
      const { code } = JSON.parse(tc.function.arguments || "{}");
      const out = await runInSandbox(code);
      return typeof out === "string" ? out : JSON.stringify(out);
    }
    return "Tool not implemented.";
  } catch (e) {
    alertError(e.message);
    return `ERROR: ${e.message}`;
  }
}

// Core loop: ask model → run any tool calls → feed results back → stop when no tools needed
async function agentTurn() {
  const assistantMsg = await callOpenAI();
  if (assistantMsg.content) add("assistant", assistantMsg.content);
  if (assistantMsg.tool_calls?.length) {
    for (const tc of assistantMsg.tool_calls) {
      const toolResult = await handleToolCall(tc);
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: toolResult
      });
      add("tool", toolResult.slice(0, 800)); // preview
    }
    // After tool results, ask model again
    await agentTurn();
  } else {
    // Done with tools; wait for next user message.
  }
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
