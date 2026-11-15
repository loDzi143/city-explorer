import { describe, expect, it } from "vitest"

import { parseAgentResponse } from "@/modules/ai/agents/agent.schemas"
import type { TripChatState, TripChatTurn } from "@/modules/ai/agents/agent.types"
import { applyTripReply, buildTripMessages, MAX_TURNS_CHARS, recentTurns } from "@/modules/ai/agents/trip-conversation"

const place = { id: "poi.1", name: "Belém Tower", description: "Fort", coordinates: { latitude: 38.69, longitude: -9.21 } }
const state: TripChatState = {
  destination: { city: "Lisbon", country: "Portugal", latitude: 38.7223, longitude: -9.1393 },
  details: { start: "2026-05-01", end: "2026-05-03", hotel: "", prefs: "" },
  plan: { days: [{ date: "2026-05-01", places: [place] }] },
  conversationContext: { activeTopic: "Food", pendingQuestion: null, discussedOptions: [], unresolvedReferences: [] },
  initial: false,
}

function user(text: string): TripChatTurn {
  return { type: "user", text }
}

describe("unanswered messages sent to the model", () => {
  it("sends every turn while they fit the budget", () => {
    const turns = [user("one"), { type: "settings" as const, update: { hotel: "Ritz" } }, user("two")]
    expect(recentTurns(turns)).toEqual(turns)
  })

  it("leaves out the oldest turns past the budget and keeps the order", () => {
    const turns = [user("a".repeat(50)), user("b".repeat(50)), user("c".repeat(50))]
    expect(recentTurns(turns, 120)).toEqual(turns.slice(1))
  })

  it("always sends the latest message, even when it alone exceeds the budget", () => {
    const turns = [user("old"), user("x".repeat(200))]
    expect(recentTurns(turns, 100)).toEqual(turns.slice(1))
  })

  it("bounds the request built from a long backlog", () => {
    const turns = Array.from({ length: 10 }, (_, index) => user(String(index).repeat(20_000)))
    const sent = buildTripMessages({ state, turns, language: "en" }).filter((message) => message.role === "user")

    expect(sent.reduce((size, message) => size + (message.content?.length ?? 0), 0)).toBeLessThanOrEqual(MAX_TURNS_CHARS)
    expect(sent.at(-1)?.content).toBe("9".repeat(20_000))
  })
})

describe("applying a reply to the trip", () => {
  const context = { activeTopic: null, pendingQuestion: null, discussedOptions: [], unresolvedReferences: [] }

  it("saves a new plan version only when the itinerary changed", () => {
    const same = applyTripReply(state, { message: "Ok", days: [{ date: "2026-05-01", places: [{ ...place, description: "Rewritten" }] }] })
    expect(same.plan).toBeNull()

    const changed = applyTripReply(state, { message: "Ok", days: [{ date: "2026-05-02", places: [place] }] })
    expect(changed.plan).toEqual({ start: "2026-05-01", end: "2026-05-03", days: [{ date: "2026-05-02", places: [place] }] })
  })

  it("keeps the current plan when the reply has no days", () => {
    expect(applyTripReply(state, { message: "Lisbon is sunny in May.", days: [] }).plan).toBeNull()
  })

  it("keeps the previous context when the reply has none and replaces it otherwise", () => {
    expect(applyTripReply(state, { message: "Ok", days: [] }).conversationContext).toBe(state.conversationContext)
    expect(applyTripReply(state, { message: "Ok", days: [], conversationContext: context }).conversationContext).toBe(context)
  })

  it("ignores a date change that would end the trip before it starts", () => {
    const result = applyTripReply(state, { message: "Ok", days: [], settings: { start: "2026-05-10", hotel: "Ritz" } })
    expect(result.details).toEqual({ start: "2026-05-01", end: "2026-05-03", hotel: "Ritz", prefs: "" })
  })
})

describe("reading a model reply", () => {
  function parse(reply: Record<string, unknown>) {
    return parseAgentResponse(JSON.stringify({ message: "Ok", ...reply }))
  }

  it("finds the JSON inside reasoning tags, code fences and surrounding text", () => {
    expect(parseAgentResponse('<think>{"draft": true}</think>\n```json\n{"message":"Hi","days":[]}\n```')).toMatchObject({ message: "Hi" })
    expect(parseAgentResponse('Here you go: {"message":"Hi","days":[]} Enjoy!')).toMatchObject({ message: "Hi" })
    expect(parseAgentResponse("No JSON here")).toBeNull()
    expect(parseAgentResponse('{"days":[]}')).toBeNull()
  })

  it("drops malformed days and places instead of the whole plan", () => {
    const reply = parse({
      days: [
        { date: "2026-05-01", places: [place, { id: "poi.2", name: "No coordinates" }, { ...place, id: "poi.3", coordinates: { latitude: 91, longitude: 0 } }] },
        { date: "soon", places: [place] },
        "not a day",
      ],
    })
    expect(reply?.days).toEqual([{ date: "2026-05-01", places: [place] }])
  })

  it("keeps one day per date", () => {
    const reply = parse({ days: [{ date: "2026-05-01", places: [place] }, { date: "01.05.2026", places: [] }, { date: "2026-05-02", places: [] }] })
    expect(reply?.days.map((day) => day.date)).toEqual(["2026-05-01", "2026-05-02"])
    expect(reply?.days[0]?.places).toEqual([place])
  })

  it("cuts an overlong description and overlong or extra hints instead of rejecting them", () => {
    const reply = parse({
      days: [{ date: "2026-05-01", places: [{ ...place, description: "d".repeat(5_000) }] }],
      hints: [...Array.from({ length: 12 }, (_, index) => `Hint ${index}`), "  ", 5],
    })
    expect(reply?.days[0]?.places[0]?.description).toHaveLength(4_000)
    expect(reply?.hints).toHaveLength(10)
    expect(parse({ hints: ["h".repeat(500)] })?.hints?.[0]).toHaveLength(200)
  })
})
