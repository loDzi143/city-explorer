import { afterEach, describe, expect, it, vi } from "vitest"

import { clientIp, readJson } from "@/app/api/_lib/handler"

function post(body: BodyInit, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/test", { method: "POST", body, headers, duplex: "half" } as RequestInit)
}

/** A body sent in chunks, without Content-Length, like a client that streams its upload. */
function chunked(chunks: string[]) {
  const encoder = new TextEncoder()
  let sent = 0
  return {
    stream: new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[sent]
        if (chunk === undefined) controller.close()
        else controller.enqueue(encoder.encode(chunk))
        sent += 1
      },
    }),
    sent: () => sent,
  }
}

describe("readJson", () => {
  it("parses JSON and treats an empty body as an empty object", async () => {
    expect(await readJson(post('{"a":1}'), {})).toEqual({ ok: true, data: { a: 1 } })
    expect(await readJson(post(""), {})).toEqual({ ok: true, data: {} })
  })

  it("rejects invalid JSON with 400", async () => {
    const result = await readJson(post("{not json"), {})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(400)
  })

  it("rejects a declared size over the limit without reading the body", async () => {
    const result = await readJson(post("{}", { "content-length": "5000" }), {}, 1_000)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(413)
  })

  it("stops reading a chunked body once it exceeds the limit", async () => {
    const body = chunked(Array.from({ length: 50 }, () => "x".repeat(100)))
    const result = await readJson(post(body.stream), {}, 1_000)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(413)
    // 11 chunks cross the 1000-byte limit; the remaining ones were never pulled.
    expect(body.sent()).toBeLessThan(20)
  })

  it("counts bytes, not characters", async () => {
    // Cyrillic letters take two bytes each: 600 of them are under 1000 characters but over 1000 bytes.
    expect((await readJson(post(JSON.stringify("я".repeat(400))), {}, 1_000)).ok).toBe(true)
    expect((await readJson(post(JSON.stringify("я".repeat(600))), {}, 1_000)).ok).toBe(false)
  })
})

describe("clientIp", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function from(forwarded: string | null) {
    return new Request("http://localhost:3000/api/test", { headers: forwarded === null ? {} : { "x-forwarded-for": forwarded } })
  }

  it("uses the entry appended by the nearest hop, not what the client claims", () => {
    // The client sent "1.1.1.1"; the proxy appended the address it actually saw.
    vi.stubEnv("TRUST_PROXY", "true")
    expect(clientIp(from("1.1.1.1, 203.0.113.7"))).toBe("203.0.113.7")
  })

  it("skips the addresses of further trusted proxies", () => {
    vi.stubEnv("TRUST_PROXY", "2")
    expect(clientIp(from("1.1.1.1, 203.0.113.7, 10.0.0.2"))).toBe("203.0.113.7")
    // Fewer entries than proxies: take what is there instead of nothing.
    expect(clientIp(from("203.0.113.7"))).toBe("203.0.113.7")
  })

  it("falls back to the last entry without a proxy and to a constant without the header", () => {
    vi.stubEnv("TRUST_PROXY", "false")
    expect(clientIp(from("1.1.1.1, 203.0.113.7"))).toBe("203.0.113.7")
    expect(clientIp(from(null))).toBe("unknown")
  })
})
