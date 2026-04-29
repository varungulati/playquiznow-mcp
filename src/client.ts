/**
 * HTTP client for the PlayQuizNow API.
 */

import { randomUUID } from "node:crypto"

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }
export type JsonObject = { [k: string]: JsonValue | undefined }

export interface ParsedResponse {
  status?: boolean
  errors?: unknown
  data?: unknown
  results?: unknown
  [k: string]: unknown
}

// Per-request timeout. Server-side quiz create with 100 questions and
// many round-trips can take ~30s on a slow link; 90s gives generous headroom
// while still failing fast if the server is wedged.
const DEFAULT_TIMEOUT_MS = 90_000

export class PlayQuizNowClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "")
    this.apiKey = apiKey
  }

  private async parseResponse(resp: Response): Promise<ParsedResponse> {
    if (!resp.ok) {
      try {
        const body = (await resp.json()) as ParsedResponse
        const errorMsg =
          (body as any).errors ??
          (body as any).error ??
          (body as any).detail ??
          body
        return { status: false, errors: errorMsg }
      } catch {
        return { status: false, errors: `HTTP ${resp.status}: ${resp.statusText}` }
      }
    }
    try {
      return (await resp.json()) as ParsedResponse
    } catch {
      return { status: false, errors: `Unexpected non-JSON response (HTTP ${resp.status})` }
    }
  }

  private async request(
    path: string,
    init: RequestInit & { timeoutMs?: number } = {},
  ): Promise<ParsedResponse> {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init
    try {
      const resp = await fetch(`${this.baseUrl}${path}`, {
        ...rest,
        signal: AbortSignal.timeout(timeoutMs),
      })
      return this.parseResponse(resp)
    } catch (e: any) {
      if (e?.name === "TimeoutError" || e?.name === "AbortError") {
        return {
          status: false,
          errors: `Request timed out after ${timeoutMs}ms. The server may still be processing — retry with the same Idempotency-Key to avoid duplicates.`,
        }
      }
      return { status: false, errors: `Network error: ${e?.message ?? String(e)}` }
    }
  }

  async createQuiz(data: Record<string, any>): Promise<ParsedResponse> {
    const form = new FormData()
    form.append("title", String(data.title))
    form.append("description", String(data.description ?? ""))
    form.append("quiz_mode", String(data.quiz_mode ?? "single_player"))
    form.append("access_type", String(data.access_type ?? "public"))
    form.append("questionset", JSON.stringify(data.questionset))
    form.append("negative_marking", data.negative_marking ? "true" : "false")
    form.append("auto_start_quiz", data.auto_start_quiz ? "true" : "false")
    form.append("ads_enabled", "false")

    for (const field of ["marketing_text", "marketing_link", "start_datetime", "end_datetime"]) {
      const value = data[field]
      if (value) form.append(field, String(value))
    }
    if (data.max_plays_per_participant != null) {
      form.append("max_plays_per_participant", String(data.max_plays_per_participant))
    }

    // Idempotency-Key: the server caches the response for this key for 24h,
    // so a network-level retry of the SAME logical call won't create a duplicate quiz.
    return this.request("/api/quiz/create/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Idempotency-Key": randomUUID(),
      },
      body: form,
    })
  }

  async listMyQuizzes(): Promise<ParsedResponse | unknown[]> {
    return this.request("/api/quiz/my-quizzes/", {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
  }

  async getQuiz(joinCode: string): Promise<ParsedResponse> {
    return this.request(`/api/quiz/${encodeURIComponent(joinCode)}/`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
  }

  async deleteQuiz(quizId: number): Promise<ParsedResponse> {
    return this.request(`/api/quiz/delete/${quizId}/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
  }
}
