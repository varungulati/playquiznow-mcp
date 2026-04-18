/**
 * Quiz management tools for the PlayQuizNow MCP server.
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from "@modelcontextprotocol/sdk/types.js"
import { PlayQuizNowClient } from "../client.js"

export const MAX_QUESTION_SETS = 10
export const MAX_QUESTIONS_PER_SET = 50
export const MAX_TOTAL_QUESTIONS = 100
export const MAX_ANSWERS_PER_QUESTION = 8

const CREATE_QUIZ_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Quiz title (max 200 chars)",
      maxLength: 200,
    },
    question_sets: {
      type: "array",
      description: `Array of question sets (max ${MAX_QUESTION_SETS}). Each set groups related questions.`,
      maxItems: MAX_QUESTION_SETS,
      items: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Question set title (e.g. 'General Knowledge')",
          },
          description: {
            type: "string",
            description: "Optional description for the question set",
            default: "",
          },
          passage: {
            type: "string",
            description: "Optional reading passage for comprehension questions. Plain text or HTML.",
            default: "",
          },
          questions: {
            type: "array",
            description: `Questions in this set (max ${MAX_QUESTIONS_PER_SET}). Total across all sets must not exceed ${MAX_TOTAL_QUESTIONS}.`,
            maxItems: MAX_QUESTIONS_PER_SET,
            items: {
              type: "object",
              properties: {
                text: {
                  type: "string",
                  description: "Question text. Use plain text (not HTML). Example: 'What is the capital of France?'",
                },
                question_type: {
                  type: "string",
                  enum: ["mcq_text", "poll", "text_answer"],
                  description:
                    "mcq_text = multiple choice (must have at least 1 correct answer), poll = poll (no correct answer needed), text_answer = free text response",
                  default: "mcq_text",
                },
                answers: {
                  type: "array",
                  description:
                    "Answer options (2-8 per question). For mcq_text, at least one must have is_correct=true. For poll, none need is_correct. For text_answer, provide one answer with the expected text.",
                  minItems: 1,
                  maxItems: MAX_ANSWERS_PER_QUESTION,
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string", description: "Answer text" },
                      is_correct: {
                        type: "boolean",
                        description: "Whether this is a correct answer. Required for mcq_text questions.",
                        default: false,
                      },
                    },
                    required: ["text"],
                  },
                },
                positive_points: {
                  type: "number",
                  description: "Points awarded for correct answer",
                  default: 1,
                },
                negative_points: {
                  type: "number",
                  description: "Points deducted for wrong answer (only if quiz has negative_marking=true)",
                  default: 0,
                },
                time_for_question: {
                  type: "integer",
                  description: "Seconds to answer the question",
                  default: 30,
                  minimum: 5,
                  maximum: 300,
                },
                time_for_answer: {
                  type: "integer",
                  description: "Seconds to display the answer/explanation after answering",
                  default: 10,
                  minimum: 3,
                  maximum: 60,
                },
                correct_answer_explanation: {
                  type: "string",
                  description: "Explanation shown after answering. Plain text.",
                  default: "",
                },
              },
              required: ["text", "answers"],
            },
          },
        },
        required: ["title", "questions"],
      },
    },
    description: {
      type: "string",
      description: "Quiz description shown to players before starting. Plain text.",
      default: "",
    },
    quiz_mode: {
      type: "string",
      enum: ["single_player", "multi_player"],
      description: "single_player = players take quiz individually, multi_player = live multiplayer session",
      default: "single_player",
    },
    access_type: {
      type: "string",
      enum: ["public", "private", "unlisted"],
      description:
        "public = anyone can find and play, private = only via direct link, unlisted = not listed but accessible via link",
      default: "public",
    },
    negative_marking: {
      type: "boolean",
      description: "Deduct points for wrong answers (uses each question's negative_points value)",
      default: false,
    },
    auto_start_quiz: {
      type: "boolean",
      description: "Automatically start the quiz for participants (no waiting room)",
      default: false,
    },
    start_datetime: {
      type: "string",
      description:
        "ISO 8601 datetime when quiz becomes available (e.g. '2026-04-20T10:00:00Z'). Defaults to now.",
    },
    end_datetime: {
      type: "string",
      description: "ISO 8601 datetime when quiz closes. No default (quiz stays open indefinitely).",
    },
    max_plays_per_participant: {
      type: "integer",
      description:
        "Maximum number of times each player can take this quiz. Subject to the user's subscription plan limit.",
      minimum: 1,
    },
    marketing_text: {
      type: "string",
      description: "Custom text shown on the quiz results page (e.g. a call-to-action).",
    },
    marketing_link: {
      type: "string",
      description: "URL linked from the marketing text on the results page.",
    },
  },
  required: ["title", "question_sets"],
} as const

const LIST_QUIZZES_SCHEMA = {
  type: "object",
  properties: {},
} as const

const GET_QUIZ_SCHEMA = {
  type: "object",
  properties: {
    join_code: {
      type: "string",
      description: "The 6-character quiz join code",
    },
  },
  required: ["join_code"],
} as const

const DELETE_QUIZ_SCHEMA = {
  type: "object",
  properties: {
    quiz_id: {
      type: "integer",
      description: "The quiz ID to delete",
    },
  },
  required: ["quiz_id"],
} as const

const TOOLS: Tool[] = [
  {
    name: "create_quiz",
    description:
      "Create a new quiz on PlayQuizNow. Provide a title and one or more question sets, each containing questions with answer options. " +
      "For multiple-choice questions (mcq_text), mark at least one answer as correct. Use plain text for question/answer text (not HTML). " +
      `Returns the quiz join code and URL. Limits: max ${MAX_TOTAL_QUESTIONS} questions total, max ${MAX_QUESTION_SETS} question sets.`,
    inputSchema: CREATE_QUIZ_SCHEMA as unknown as Tool["inputSchema"],
  },
  {
    name: "list_my_quizzes",
    description: "List all quizzes created by the authenticated user on PlayQuizNow.",
    inputSchema: LIST_QUIZZES_SCHEMA as unknown as Tool["inputSchema"],
  },
  {
    name: "get_quiz",
    description: "Get full details of a quiz by its join code, including all questions and answers.",
    inputSchema: GET_QUIZ_SCHEMA as unknown as Tool["inputSchema"],
  },
  {
    name: "delete_quiz",
    description: "Delete a quiz by its ID. Only the quiz owner can delete it.",
    inputSchema: DELETE_QUIZ_SCHEMA as unknown as Tool["inputSchema"],
  },
]

function validateQuizData(args: Record<string, any>): string | null {
  const questionSets: any[] = args.question_sets ?? []
  if (questionSets.length === 0) {
    return "At least one question set is required."
  }
  if (questionSets.length > MAX_QUESTION_SETS) {
    return `Maximum ${MAX_QUESTION_SETS} question sets allowed.`
  }

  let totalQuestions = 0
  for (let qsIdx = 0; qsIdx < questionSets.length; qsIdx++) {
    const qs = questionSets[qsIdx]
    const questions: any[] = qs.questions ?? []
    if (questions.length === 0) {
      return `Question set ${qsIdx + 1} ('${qs.title ?? ""}') has no questions.`
    }
    if (questions.length > MAX_QUESTIONS_PER_SET) {
      return `Question set ${qsIdx + 1} has ${questions.length} questions (max ${MAX_QUESTIONS_PER_SET}).`
    }
    totalQuestions += questions.length

    for (let qIdx = 0; qIdx < questions.length; qIdx++) {
      const q = questions[qIdx]
      const qType = q.question_type ?? "mcq_text"
      const answers: any[] = q.answers ?? []
      if (answers.length === 0) {
        return `Question ${qIdx + 1} in set ${qsIdx + 1} has no answers.`
      }
      if (answers.length > MAX_ANSWERS_PER_QUESTION) {
        return `Question ${qIdx + 1} in set ${qsIdx + 1} has ${answers.length} answers (max ${MAX_ANSWERS_PER_QUESTION}).`
      }
      if (qType === "mcq_text") {
        const hasCorrect = answers.some((a) => a.is_correct === true)
        if (!hasCorrect) {
          return `Question ${qIdx + 1} in set ${qsIdx + 1} is multiple-choice but has no correct answer. Mark at least one answer as is_correct=true.`
        }
      }
    }
  }

  if (totalQuestions > MAX_TOTAL_QUESTIONS) {
    return `Total questions (${totalQuestions}) exceeds maximum of ${MAX_TOTAL_QUESTIONS}.`
  }
  return null
}

function transformQuestionSets(questionSets: any[]): any[] {
  return questionSets.map((qs) => ({
    title: qs.title,
    description: qs.description ?? "",
    passage: qs.passage ?? "",
    questions: (qs.questions ?? []).map((q: any) => ({
      text: q.text,
      question_type: q.question_type ?? "mcq_text",
      positive_points: q.positive_points ?? 1,
      negative_points: q.negative_points ?? 0,
      time_for_question: q.time_for_question ?? 30,
      time_for_answer: q.time_for_answer ?? 10,
      correct_answer_explanation: q.correct_answer_explanation ?? "",
      attachment: null,
      answer: (q.answers ?? []).map((a: any) => ({
        text: a.text,
        is_correct: a.is_correct ?? false,
        attachment: null,
      })),
    })),
  }))
}

type TextContent = { type: "text"; text: string }

async function handleCreateQuiz(client: PlayQuizNowClient, args: Record<string, any>): Promise<TextContent[]> {
  const error = validateQuizData(args)
  if (error) {
    return [{ type: "text", text: `Validation error: ${error}` }]
  }

  const questionSets = transformQuestionSets(args.question_sets)

  const data: Record<string, any> = {
    title: args.title,
    description: args.description ?? "",
    quiz_mode: args.quiz_mode ?? "single_player",
    access_type: args.access_type ?? "public",
    negative_marking: args.negative_marking ?? false,
    auto_start_quiz: args.auto_start_quiz ?? false,
    questionset: questionSets,
  }

  for (const field of ["start_datetime", "end_datetime", "marketing_text", "marketing_link", "max_plays_per_participant"]) {
    if (args[field] != null) data[field] = args[field]
  }

  const result = await client.createQuiz(data)

  if (result.status) {
    const quizData = (result.data ?? {}) as Record<string, any>
    const joinCode = quizData.join_code ?? "unknown"
    const title = quizData.title ?? args.title
    const totalQuestions = (args.question_sets as any[]).reduce(
      (sum, qs) => sum + (qs.questions?.length ?? 0),
      0,
    )

    const quizMode = args.quiz_mode ?? "single_player"
    const playPath = quizMode === "multi_player" ? "play-multiplayer" : "play-quiz"

    const lines = [
      "Quiz created successfully!\n",
      `- **Title:** ${title}`,
      `- **Join Code:** ${joinCode}`,
      `- **Questions:** ${totalQuestions}`,
      `- **Mode:** ${quizMode}`,
      `- **Access:** ${args.access_type ?? "public"}`,
    ]
    if (args.negative_marking) lines.push("- **Negative Marking:** enabled")
    lines.push(`\nPlayers can join at: https://playquiznow.com/${playPath}/${joinCode}`)

    return [{ type: "text", text: lines.join("\n") }]
  }

  let errors: unknown = result.errors ?? "Unknown error"
  if (errors && typeof errors === "object") {
    errors = JSON.stringify(errors, null, 2)
  }
  return [{ type: "text", text: `Failed to create quiz: ${errors}` }]
}

async function handleListMyQuizzes(client: PlayQuizNowClient): Promise<TextContent[]> {
  const result = await client.listMyQuizzes()

  let quizzes: any[] = []
  if (Array.isArray(result)) {
    quizzes = result
  } else if (result && typeof result === "object") {
    const r = result as Record<string, any>
    quizzes = (r.results ?? r.data ?? []) as any[]
  }

  if (quizzes.length === 0) {
    return [{ type: "text", text: "No quizzes found." }]
  }

  const lines = [`Found ${quizzes.length} quiz(es):\n`]
  for (const q of quizzes) {
    const title = q.title ?? "Untitled"
    const joinCode = q.join_code ?? "—"
    const mode = q.quiz_mode ?? "—"
    const quizId = q.id ?? "—"
    lines.push(`- **${title}** (ID: ${quizId}, Code: ${joinCode}, Mode: ${mode})`)
  }
  return [{ type: "text", text: lines.join("\n") }]
}

async function handleGetQuiz(client: PlayQuizNowClient, args: Record<string, any>): Promise<TextContent[]> {
  const joinCode = String(args.join_code)
  const result = await client.getQuiz(joinCode)

  let quiz: unknown
  if (Array.isArray(result) && result.length > 0) {
    quiz = result[0]
  } else if (result && typeof result === "object") {
    quiz = result
  } else {
    return [{ type: "text", text: `No quiz found with code '${joinCode}'.` }]
  }

  const text = JSON.stringify(quiz, null, 2)
  return [{ type: "text", text: `Quiz details for ${joinCode}:\n\n\`\`\`json\n${text}\n\`\`\`` }]
}

async function handleDeleteQuiz(client: PlayQuizNowClient, args: Record<string, any>): Promise<TextContent[]> {
  const quizId = Number(args.quiz_id)
  const result = await client.deleteQuiz(quizId)

  if (result.status) {
    return [{ type: "text", text: `Quiz ${quizId} deleted successfully.` }]
  }
  const errors = result.errors ?? "Unknown error"
  return [{ type: "text", text: `Failed to delete quiz: ${typeof errors === "object" ? JSON.stringify(errors) : errors}` }]
}

export function registerQuizTools(server: Server, client: PlayQuizNowClient): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params
    const args = (rawArgs ?? {}) as Record<string, any>

    try {
      switch (name) {
        case "create_quiz":
          return { content: await handleCreateQuiz(client, args) }
        case "list_my_quizzes":
          return { content: await handleListMyQuizzes(client) }
        case "get_quiz":
          return { content: await handleGetQuiz(client, args) }
        case "delete_quiz":
          return { content: await handleDeleteQuiz(client, args) }
        default:
          return { content: [{ type: "text", text: `Unknown tool: ${name}` }] }
      }
    } catch (e: any) {
      const errorType = e?.constructor?.name ?? "Error"
      const message = e?.message ?? String(e)
      return { content: [{ type: "text", text: `Error (${errorType}): ${message}` }] }
    }
  })
}
