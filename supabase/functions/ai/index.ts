// YOKO! Student · AI helper (Supabase Edge Function "ai").
// The app sends { task: "command", input: { text, context, today } }. This asks an AI model to
// understand the message and answers with JSON the app can act on, plus a short reply to show.
// Secrets (Edge Functions → Secrets):
//   GEMINI_API_KEY (needed for Gemini), GEMINI_MODEL (optional, tried first)
//   GROQ_API_KEY (recommended: fast, free at console.groq.com), GROQ_MODEL (optional)
// Order: Groq (if GROQ_API_KEY is set), then GEMINI_MODEL, then other Gemini Flash models on this key
// (each has its own free quota). A busy (503) or out-of-quota (429) model is skipped, so one bad model can't take the AI down.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = (today: string) => `You are YOKO!, a friendly money buddy inside a budgeting app for college students in India.
Today is ${today}. Money is in Indian rupees (₹).
Read the student's message and the CONTEXT (their real numbers), then reply with ONLY one JSON object:
{"intent":"add|afford|ask|budget|whatif|chat","amount":number,"note":string,"categoryName":string,"withPerson":string,"split":boolean,"item":string,"dayOffset":number,"period":"today|this week|this month","reductionAmount":number,"reply":string}
Pick the intent:
- add: they spent or paid something ("spent 120 on chai"). note = what it was, 1 to 4 words. split=true and withPerson when they split it with someone.
- afford: "can I afford ...". amount, item, dayOffset = days from today until it happens (0 = today).
- ask: "how much did I spend on ...". categoryName and period.
- budget: set a limit for a category. amount and categoryName.
- whatif: "what if I stop/cut ...". categoryName and reductionAmount = rupees saved per day.
- chat: anything else (advice, why questions, greetings, explaining their numbers).
Leave out fields that don't apply.
"reply" is ALWAYS required: 1 to 3 short, warm, plain sentences, in the same language and script the student wrote in (Hinglish typed in English letters gets a Hinglish reply in English letters, not Devanagari).
Use only numbers from CONTEXT; never invent balances or spending. No em dashes. At most one emoji.
Don't give investment or loan advice beyond simple saving tips.`;

const DEADLINE_MS = 14000;   // total time for all attempts; the app waits a little longer than this

// Gemini models this key can use, found once per warm instance (no guessing model names).
let geminiModels: string[] | null = null;
async function listGeminiModels(key: string): Promise<string[]> {
  if (geminiModels) return geminiModels;
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return [];
    const d = await r.json();
    const names: string[] = (d.models || [])
      .filter((m: any) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m: any) => String(m.name || "").replace(/^models\//, ""))
      .filter((n: string) => /^gemini-[\d.]+-flash/.test(n) && !/image|tts|audio|live|thinking|exp/.test(n));
    // newest first, full Flash before Flash-Lite
    names.sort((a, b) => {
      const va = parseFloat(a.slice(7)), vb = parseFloat(b.slice(7));
      if (vb !== va) return vb - va;
      return Number(/lite/.test(a)) - Number(/lite/.test(b)) || a.length - b.length;
    });
    geminiModels = names;
    return names;
  } catch {
    return [];
  }
}

type Attempt = { provider: string; model: string; status: number | string; detail?: string };

// Remembered while this instance stays warm: models to skip for now, and the last one that worked.
const skipUntil = new Map<string, number>();
let lastGood = "";
function rest(model: string, status: number | string, detail = "") {
  let ms = 60_000;
  if (status === 429) {
    const m = detail.match(/retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/);
    if (m) ms = ((+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + Math.ceil(+(m[3] || 0))) * 1000 || ms;
  } else if (status === 400 || status === 403 || status === 404) ms = 6 * 3600_000;   // model not usable on this key
  else if (status === "timeout") ms = 3 * 60_000;
  skipUntil.set(model, Date.now() + Math.min(ms, 24 * 3600_000));
}

async function askGemini(key: string, model: string, system: string, user: string, ms: number) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(ms),
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 600 },
    }),
  });
  if (!r.ok) return { ok: false as const, status: r.status, detail: (await r.text()).slice(0, 500) };
  const g = await r.json();
  const out = g?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  return out ? { ok: true as const, out } : { ok: false as const, status: "empty", detail: JSON.stringify(g).slice(0, 300) };
}

async function askGroq(key: string, model: string, system: string, user: string, ms: number) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(ms),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 1500,   // GPT OSS thinks first; leave room for the answer
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    }),
  });
  if (!r.ok) return { ok: false as const, status: r.status, detail: (await r.text()).slice(0, 500) };
  const g = await r.json();
  const out = g?.choices?.[0]?.message?.content || "";
  return out ? { ok: true as const, out } : { ok: false as const, status: "empty", detail: JSON.stringify(g).slice(0, 300) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const gKey = Deno.env.get("GEMINI_API_KEY");
  const qKey = Deno.env.get("GROQ_API_KEY");
  if (!gKey && !qKey) return json({ error: "No AI key set (GEMINI_API_KEY or GROQ_API_KEY)" }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad JSON" }, 400); }
  if (body?.task !== "command") return json({ error: "unknown task" }, 400);
  const input = body.input;
  const text = String(typeof input === "string" ? input : input?.text ?? "").slice(0, 2000).trim();
  if (!text) return json({ error: "empty message" }, 400);
  const context = typeof input === "object" && input?.context ? JSON.stringify(input.context).slice(0, 6000) : "{}";
  const today = String(input?.today || new Date().toDateString()).slice(0, 40);
  const system = SYSTEM(today);
  const user = `CONTEXT: ${context}\n\nMESSAGE: ${text}`;

  const started = Date.now();
  const left = () => DEADLINE_MS - (Date.now() - started);
  const tried: Attempt[] = [];

  // Build the queue: Groq first when its key is set (fast, bigger free quota), then the chosen
  // Gemini model, then other Gemini Flash models on the key.
  const queue: { provider: "gemini" | "groq"; model: string }[] = [];
  if (qKey) {
    // Llama 3.3 70B is Enterprise-only on Groq now; GPT OSS is on every plan
    const first = Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-120b";
    for (const m of [first, "openai/gpt-oss-20b"]) if (!queue.some((q) => q.model === m)) queue.push({ provider: "groq", model: m });
  }
  if (gKey) {
    const first = Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash";
    queue.push({ provider: "gemini", model: first });
    for (const m of (await listGeminiModels(gKey)).slice(0, 4)) if (m !== first) queue.push({ provider: "gemini", model: m });
  }
  // the last model that answered goes first; models resting after a 429 / timeout are skipped
  queue.sort((a, b) => Number(b.model === lastGood) - Number(a.model === lastGood));
  const live = queue.filter((q) => (skipUntil.get(q.model) || 0) < Date.now());
  if (live.length) queue.splice(0, queue.length, ...live);
  for (let i = 0; i < queue.length; i++) {
    const { provider, model } = queue[i];
    const ms = Math.min(i === 0 ? 8000 : 5000, left());
    if (ms < 1500) break;
    try {
      const res = provider === "gemini"
        ? await askGemini(gKey!, model, system, user, ms)
        : await askGroq(qKey!, model, system, user, ms);
      if (!res.ok) {
        tried.push({ provider, model, status: res.status, detail: res.detail });
        rest(model, res.status, res.detail);
        // 404 / 400 = this model name doesn't work on this key; 429 / 503 / 5xx = busy or out of quota. Try the next one.
        continue;
      }
      let parsed: any;
      try { parsed = JSON.parse(res.out); } catch { parsed = { intent: "chat", reply: res.out.slice(0, 400) }; }
      if (!parsed || typeof parsed !== "object") parsed = { intent: "chat", reply: String(res.out).slice(0, 400) };
      if (typeof parsed.reply === "string") parsed.reply = parsed.reply.replace(/\s*—\s*/g, ", ").slice(0, 500);
      parsed.provider = `${provider}:${model}`;
      if (tried.length) parsed.skipped = tried.map((t) => `${t.model} ${t.status}`);
      lastGood = model;
      return json(parsed);
    } catch (e) {
      const status = (e as Error).name === "TimeoutError" || (e as Error).name === "AbortError" ? "timeout" : "fetch failed";
      tried.push({ provider, model, status });
      rest(model, status);
    }
  }
  const quota = tried.some((t) => t.status === 429);
  return json({ error: quota ? "quota" : "unavailable", tried }, 502);
});
