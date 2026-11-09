import { readFileSync } from "node:fs"

import { parseAgentResponse } from "../src/modules/ai/agents/agent.schemas"
import { executeGeocodePlaces } from "../src/modules/ai/tools/geocode-places.tool"
import { geocodingService } from "../src/modules/geocoding/geocoding.service"

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
  const index = trimmed.indexOf("=")
  const key = trimmed.slice(0, index).trim()
  const value = trimmed.slice(index + 1).trim()
  if (!process.env[key]) process.env[key] = value
}

const destination = { city: "Seoul", country: "South Korea", latitude: 37.5665, longitude: 126.9779 }

async function main() {
  const single = await geocodingService.geocodePlaces({
    places: [{ name: "Gyeongbokgung Palace", searchName: "경복궁" }],
    ...destination,
  })
  const batch = await geocodingService.geocodePlaces({
    places: ["Bukchon Hanok Village", "Starbucks", "NotARealPlaceZZZQQQ", "National Museum of Korea"].map((name) => ({ name })),
    ...destination,
  })
  const tool = await executeGeocodePlaces(
    JSON.stringify({
      places: [
        { dayIndex: 0, name: "Gyeongbokgung Palace" },
        { dayIndex: "1", name: "Starbucks" },
      ],
    }),
    destination,
  )
  const agent = parseAgentResponse(`\`\`\`json
{"message":"Ready","days":[{"date":"2026-11-09","places":[{"id":"poi.1","name":"Gyeongbokgung Palace","description":"Palace","coordinates":{"latitude":37.58,"longitude":126.98}}]}]}
\`\`\``)
  console.log(JSON.stringify({ single, batch, tool, agent }, null, 2))
}

void main()
