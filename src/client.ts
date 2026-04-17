/**
 * HTTP client for the PlayQuizNow API.
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }
export type JsonObject = { [k: string]: JsonValue | undefined }

export interface ParsedResponse {
  status?: boolean
  errors?: unknown
  data?: unknown
  results?: unknown
  [k: string]: unknown
}

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

    const resp = await fetch(`${this.baseUrl}/api/quiz/create/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    })
    return this.parseResponse(resp)
  }

  async listMyQuizzes(): Promise<ParsedResponse | unknown[]> {
    const resp = await fetch(`${this.baseUrl}/api/quiz/my-quizzes/`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    return this.parseResponse(resp)
  }

  async getQuiz(joinCode: string): Promise<ParsedResponse> {
    const resp = await fetch(`${this.baseUrl}/api/quiz/${encodeURIComponent(joinCode)}/`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    return this.parseResponse(resp)
  }

  async deleteQuiz(quizId: number): Promise<ParsedResponse> {
    const resp = await fetch(`${this.baseUrl}/api/quiz/delete/${quizId}/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    return this.parseResponse(resp)
  }
}
