// Server-only — never import this file from client-side code.
// It reads GROQ_API_KEY from process.env and calls the Groq API directly.

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1_000;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class GroqError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "GroqError";
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface GroqMessage { content: string }
interface GroqChoice  { message: GroqMessage }
interface GroqCompletion { choices: GroqChoice[] }
interface GroqErrorBody  { error?: { message?: string } }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as GroqErrorBody;
    return body?.error?.message ?? "";
  } catch {
    return await response.text().catch(() => "");
  }
}

// ---------------------------------------------------------------------------
// Single attempt
// ---------------------------------------------------------------------------

async function attempt(
  apiKey: string,
  systemPrompt: string,
  userMessage: string
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userMessage   },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new GroqError(
        `Groq API request timed out after ${TIMEOUT_MS / 1_000} seconds.`,
        true
      );
    }
    throw new GroqError(
      `Network error reaching Groq API: ${err instanceof Error ? err.message : String(err)}`,
      true
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const msg    = await readErrorMessage(response);
    const detail = msg ? `: ${msg}` : "";

    if (response.status === 401 || response.status === 403) {
      throw new GroqError(
        `Groq API authentication failed (HTTP ${response.status})${detail}. ` +
          "Verify GROQ_API_KEY in .env.local.",
        false,
        response.status
      );
    }
    if (response.status === 400 || response.status === 422) {
      throw new GroqError(
        `Groq API rejected the request (HTTP ${response.status})${detail}.`,
        false,
        response.status
      );
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const hint = retryAfter ? ` Retry-After: ${retryAfter}s.` : "";
      throw new GroqError(
        `Groq API rate limit exceeded (HTTP 429)${detail}.${hint}`,
        true,
        429
      );
    }
    if (response.status >= 500) {
      throw new GroqError(
        `Groq API server error (HTTP ${response.status})${detail}.`,
        true,
        response.status
      );
    }
    throw new GroqError(
      `Groq API returned unexpected status ${response.status}${detail}.`,
      false,
      response.status
    );
  }

  let body: GroqCompletion;
  try {
    body = (await response.json()) as GroqCompletion;
  } catch {
    throw new GroqError(
      "Groq API returned a response that could not be parsed as JSON.",
      false
    );
  }

  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new GroqError(
      "Unexpected Groq response structure: choices[0].message.content is missing. " +
        `Got: ${JSON.stringify(body).slice(0, 300)}`,
      false
    );
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new GroqError(
      `Groq returned content that is not valid JSON despite json_object mode. ` +
        `Content snippet: ${content.slice(0, 300)}`,
      false
    );
  }
}

// ---------------------------------------------------------------------------
// Public API — retry loop with exponential back-off
// ---------------------------------------------------------------------------

export async function callGroq(
  systemPrompt: string,
  userMessage: string
): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey?.trim()) {
    throw new GroqError(
      "GROQ_API_KEY environment variable is not set. Add it to .env.local.",
      false
    );
  }

  let lastError: Error = new Error("Unknown error");

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (i > 0) {
      await sleep(BACKOFF_BASE_MS * 2 ** (i - 1)); // 1 s → 2 s
    }
    try {
      return await attempt(apiKey, systemPrompt, userMessage);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (err instanceof GroqError && !err.retryable) throw err;
      if (i === MAX_ATTEMPTS - 1) break;
    }
  }

  throw lastError;
}
