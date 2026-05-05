import { parseModelJsonObject } from "@/lib/parse-model-json"

/**
 * OpenAI-compatible Chat Completions with JSON object output.
 */
export async function callOpenAiJsonObject(messages: {
  role: string
  content: string
}[]): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY")
  }
  const baseUrl = process.env.AI_BASE_URL ?? "https://api.openai.com/v1"
  const model = process.env.AI_MODEL ?? "gpt-4o-mini"

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages,
    }),
  })

  const raw = (await res.json()) as {
    error?: { message?: string }
    choices?: { message?: { content?: string } }[]
  }

  if (!res.ok) {
    const msg = raw.error?.message ?? res.statusText
    throw new Error(`AI request failed: ${msg}`)
  }

  const content = raw.choices?.[0]?.message?.content
  if (!content) {
    throw new Error("Empty AI response")
  }

  return parseModelJsonObject(content)
}
