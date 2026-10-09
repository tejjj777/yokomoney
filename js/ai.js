/* YOKO! Student · AI helper.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md). */
'use strict';

/** URL of the Supabase Edge Function that handles AI requests (Session 2 requirement). */
const AI_URL = 'https://qmcwczyqhymyoesfsrzh.supabase.co/functions/v1/ai';

/**
 * Calls the AI edge function for a specific task.
 * Falls back to a local rejection/fallback if the network fails or times out.
 * 
 * @param {string} task - e.g. "import", "command", "budget"
 * @param {string|object} input - Text or JSON payload for the task
 * @returns {Promise<any>} The AI response object or null on failure (handled by caller fallback)
 */
async function aiCall(task, input, timeoutMs = 5000) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;   // offline: go straight to the on-device fallback
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);   // a slow network never leaves the user waiting long

  try {
    const res = await fetch(AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, input }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (res.status === 429) {   // daily limit reached: say so instead of pretending the AI is down
      const d = await res.json().catch(() => null);
      return { intent: 'chat', reply: (d && d.reply) || 'You’ve asked a lot today. Try again in a bit.' };
    }
    if (!res.ok) {
      console.warn(`AI edge function failed with status ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data;
  } catch (err) {
    clearTimeout(timeout);
    // e.g. network error, abort, CORS, etc.
    if (err.name === 'AbortError') {
      console.warn(`AI call timed out after ${timeoutMs / 1000} seconds.`);
    } else {
      console.warn('AI call failed:', err.message);
    }
    return null;
  }
}
