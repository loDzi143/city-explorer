import { beforeEach, describe, expect, it, vi } from "vitest"

import { buildTripMessages, START_PLANNING } from "@/modules/ai/agents/trip-conversation"
import { createTripAgent } from "@/modules/ai/agents/trip.agent"
import { createChatService } from "@/modules/ai/llm/chat.service"
import { LlmError } from "@/modules/ai/llm/llm-error"
import { createFakeChatProvider } from "@/modules/ai/llm/providers/fake.provider"
import { AppError } from "@/shared/errors/app-error"

// The geocoder is not under test here: every place resolves unless a test scripts a failure.
const geocoder = vi.hoisted(() => ({
  failure: null as Error | null,
  coordinates: { latitude: 41.4, longitude: 2.17 },
}))

vi.mock("@/modules/geocoding/geocoding.service", () => ({
  geocodingService: {
    geocodePlaces: async ({ places }: { places: { name: string }[] }) => {
      if (geocoder.failure) throw geocoder.failure
      return places.map((place, index) => ({ status: "found", id: `poi.${index}`, matchedName: place.name, coordinates: geocoder.coordinates }))
    },
  },
}))

const destination = { city: "Barcelona", country: "Spain", latitude: 41.3874, longitude: 2.1686 }
const reply = { message: "Hola!", days: [{ date: "2026-12-10", places: [] }], hints: ["a", "b", "c"] }
// What DeepSeek emits when an upstream provider fails to convert its tool call.
const garbled = "</｜DSML｜ parameter>\n</｜DSML｜ invoke>\n</｜DSML｜ calls>"

function toolCall(id: string) {
  return { content: null, toolCalls: [{ id, name: "geocode_places", arguments: JSON.stringify({ places: [{ dayIndex: 0, name: "Sagrada Família" }] }) }] }
}

let fake: ReturnType<typeof createFakeChatProvider>
let agent: ReturnType<typeof createTripAgent>

beforeEach(() => {
  fake = createFakeChatProvider()
  agent = createTripAgent(createChatService(fake.provider, { retryDelayMs: 0 }))
  geocoder.failure = null
  geocoder.coordinates = { latitude: 41.4, longitude: 2.17 }
})

function place(id: string, latitude: number, longitude: number) {
  return { id, name: id, description: "", coordinates: { latitude, longitude } }
}

function toolResult(request: number) {
  const message = fake.requests[request]?.messages.findLast((item) => item.role === "tool")
  return JSON.parse(message?.content ?? "null") as unknown
}

function input() {
  return { destination, messages: [{ role: "system" as const, content: "prompt" }, { role: "user" as const, content: START_PLANNING }] }
}

describe("trip agent with an unreliable upstream", () => {
  it("never sends a request without a user message, even for the first itinerary", () => {
    const messages = buildTripMessages({
      language: "en",
      state: { destination, details: { start: "2026-12-10", end: "2026-12-11", hotel: "", prefs: "" }, plan: null, conversationContext: null, initial: true },
      turns: [],
    })
    expect(messages.map((message) => message.role)).toEqual(["system", "user"])
    expect(messages[1]?.content).toBe(START_PLANNING)
  })

  it("retries a reply that is raw tool-call markup", async () => {
    fake.push({ content: garbled, toolCalls: [] })
    fake.replyWith(reply)
    expect(await agent.reply(input())).toMatchObject({ message: "Hola!" })
    expect(fake.requests).toHaveLength(2)
  })

  it("retries an empty or failed upstream response", async () => {
    fake.push(new LlmError("OpenRouter response is empty", { retryable: true }))
    fake.push(new LlmError("OpenRouter request failed with status 503", { retryable: true }))
    fake.replyWith(reply)
    expect(await agent.reply(input())).toMatchObject({ message: "Hola!" })
    expect(fake.requests).toHaveLength(3)
  })

  it("gives up after three garbled attempts and does not retry non-transient errors", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) fake.push({ content: garbled, toolCalls: [] })
    await expect(agent.reply(input())).rejects.toThrow("unparsed tool call")
    expect(fake.requests).toHaveLength(3)

    fake.reset()
    fake.push(new LlmError("OpenRouter request failed with status 402", { retryable: false }))
    await expect(agent.reply(input())).rejects.toThrow("402")
    expect(fake.requests).toHaveLength(1)
  })

  it("keeps the tool declared and makes the model finish after the geocoding limit", async () => {
    for (let round = 0; round < 6; round += 1) fake.push(toolCall(`call_${round}`))
    fake.replyWith(reply)

    expect(await agent.reply(input())).toMatchObject({ message: "Hola!" })
    expect(fake.requests).toHaveLength(7)
    // Every request describes the tool; only the first five may use it.
    expect(fake.requests.every((request) => request.tools?.[0]?.name === "geocode_places")).toBe(true)

    const last = fake.requests[6]?.messages ?? []
    const results = last.filter((message) => message.role === "tool")
    expect(results).toHaveLength(6)
    expect(results.slice(0, 5).every((message) => !message.content.includes("limit reached"))).toBe(true)
    expect(results[5]?.content).toContain("Geocoding limit reached")
    expect(last.some((message) => message.role === "user" && message.content.startsWith("Geocoding limit reached"))).toBe(true)
  })

  it("answers a tool call written as text after the limit with the instruction to finish", async () => {
    for (let round = 0; round < 5; round += 1) fake.push(toolCall(`call_${round}`))
    fake.push({ content: `<｜DSML｜ calls>\n<｜DSML｜ invoke name="geocode_places">`, toolCalls: [] })
    fake.replyWith(reply)

    expect(await agent.reply(input())).toMatchObject({ message: "Hola!" })
    expect(fake.requests).toHaveLength(7)
    expect(fake.requests[6]?.messages.at(-1)).toMatchObject({ role: "user", content: expect.stringContaining("Geocoding limit reached") })
  })
})

describe("places in the reply", () => {
  it("uses the geocoder's coordinates for a place it resolved, whatever the model wrote", async () => {
    fake.push(toolCall("call_0"))
    fake.replyWith({ ...reply, days: [{ date: "2026-12-10", places: [place("poi.0", 48.85, 2.35)] }] })

    const result = await agent.reply(input())
    expect(result.days[0]?.places).toEqual([place("poi.0", 41.4, 2.17)])
  })

  it("keeps the stored coordinates of a place from the saved plan", async () => {
    const saved = place("poi.saved", 41.39, 2.16)
    fake.replyWith({ ...reply, days: [{ date: "2026-12-10", places: [place("poi.saved", 41.5, 2.5)] }] })

    const result = await agent.reply({ ...input(), knownPlaces: [saved] })
    expect(result.days[0]?.places).toEqual([saved])
  })

  it("drops a place with an unknown id far from the destination and keeps a plausible one", async () => {
    fake.replyWith({ ...reply, days: [{ date: "2026-12-10", places: [place("poi.far", 35.68, 139.69), place("poi.near", 41.38, 2.18)] }] })

    const result = await agent.reply(input())
    expect(result.days[0]?.places.map((item) => item.id)).toEqual(["poi.near"])
  })

  it("tells the model a match in another part of the world was not found", async () => {
    geocoder.coordinates = { latitude: 40.71, longitude: -74.0 }
    fake.push(toolCall("call_0"))
    fake.replyWith(reply)

    await agent.reply(input())
    expect(toolResult(1)).toEqual([{ dayIndex: 0, requestedName: "Sagrada Família", status: "not_found" }])
  })
})

describe("geocoder failures", () => {
  it("returns a rejected query to the model as a tool error", async () => {
    geocoder.failure = new AppError("MapTiler geocoding request failed", 400, "Geocoding is unavailable", "geocoding_unavailable")
    fake.push(toolCall("call_0"))
    fake.replyWith(reply)

    expect(await agent.reply(input())).toMatchObject({ message: "Hola!" })
    expect(toolResult(1)).toEqual({ error: "Invalid geocode_places arguments" })
  })

  it("fails the reply when the geocoder is down, so no itinerary is saved without places", async () => {
    geocoder.failure = new AppError("MapTiler geocoding request failed", 502, "Geocoding is unavailable", "geocoding_unavailable")
    fake.push(toolCall("call_0"))
    fake.replyWith(reply)

    await expect(agent.reply(input())).rejects.toMatchObject({ status: 502 })
    expect(fake.requests).toHaveLength(1)
  })
})

describe("reply time budget", () => {
  it("stops asking the model once the budget is spent", async () => {
    const slow = createTripAgent(createChatService(fake.provider, { retryDelayMs: 0 }), { replyBudgetMs: 20 })
    fake.push(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
      return toolCall("call_0")
    })
    fake.replyWith(reply)

    await expect(slow.reply(input())).rejects.toThrow("timed out")
    expect(fake.requests).toHaveLength(1)
  })

  it("does not retry a failed request past the budget", async () => {
    const slow = createTripAgent(createChatService(fake.provider, { retryDelayMs: 30 }), { replyBudgetMs: 20 })
    fake.push(new LlmError("OpenRouter request failed with status 503", { retryable: true }))
    fake.replyWith(reply)

    await expect(slow.reply(input())).rejects.toThrow("timed out")
    expect(fake.requests).toHaveLength(1)
  })
})
