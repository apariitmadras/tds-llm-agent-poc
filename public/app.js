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
        properties: { query: { type: "string", description: "Search query" } },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "aipipe",
      description: "Call an AI Pipe proxy with a path and payload",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative API path, e.g. /run" },
          payload: { type: "object", description: "Arbitrary JSON payload" }
        }
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
      const r = await fetch(`/api/aipipe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: args.path, payload: args.payload })
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

// Core loop: ask model → execute tool_calls (if any) → feed results back → stop when none
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
      add("tool", toolResult.slice(0, 800));
    }
    // Ask model again with tool results
    await agentTurn();
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
