// Imports
import { kv } from "./app.ts"
import { lang } from "./lang.ts"
import { isAllowedTo } from "./users.ts"
import { Status } from "std/http/status.ts"
import { system } from "./system.ts"

// Headers
const headers = new Headers({
  "Content-Type": "application/json",
  "Cache-Control": "max-age=0, no-cache, must-revalidate, proxy-revalidate",
})

// Specs
const specs = {
  temperature: { min: -40, max: 65, unit: "°C" },
  humidity: { min: 0, max: 100, unit: "%" },
  co2: { min: 0, max: 5000, unit: "ppm" },
  pressure: { min: 260, max: 1160, unit: "mbar" },
  noise: { min: 35, max: 120, unit: "dB" },
  rain: { min: 0, max: 150, unit: "mm/h" },
  windstrength: { min: 0, max: 45, unit: "m/s" },
  guststrength: { min: 0, max: 45, unit: "m/s" },
  illuminance: { min: 1, max: 65535, unit: "lux" },
}

/** Get stats */
export async function getStats(request: Request, session?: string) {
  if ((!system.public.stats) && (!await isAllowedTo(session, []))) {
    return new Response(JSON.stringify({ error: lang.forbidden }), {
      status: Status.Forbidden,
      headers,
    })
  }
  let from = new Date()
  let to = new Date()
  const params = new URL(request.url).searchParams
  if (params.has("from")) {
    from = new Date(params.get("from")!)
  }
  if (params.has("to")) {
    to = new Date(params.get("to")!)
  }
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return new Response(JSON.stringify({ error: lang.bad_dates }), {
      status: 400,
      headers,
    })
  }
  from.setHours(0, 0, 0, 0)
  to.setHours(23, 59, 59, 999)
  const entries = kv.list<{ [key: string]: number | null }>({
    start: ["stats", from.getTime()],
    end: ["stats", to.getTime()],
  })
  const data = await Array.fromAsync(entries)
  const values = data.map(({ value }) => value)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  // deno-lint-ignore no-explicit-any
  const result = {
    time: Date.now(),
    range: { timezone, from: from.toISOString(), to: to.toISOString() },
  } as any

  for (
    const key of [
      "temperature",
      "temperature_out",
      "humidity",
      "humidity_out",
      "co2",
      "pressure",
      "noise",
      "rain",
      "windstrength",
      "windangle",
      "guststrength",
      "gustangle",
      "illuminance",
    ]
  ) {
    const previous = values.at(0)?.[key] ?? NaN
    const current = values.at(-1)?.[key] ?? NaN
    const min = values.reduce(
      (min, value) => Math.min(min, value[key] ?? NaN),
      Infinity,
    )
    const max = values.reduce(
      (max, value) => Math.max(max, value[key] ?? NaN),
      -Infinity,
    )
    const trend = key.endsWith("angle") ? null : current > previous ? "up" : current < previous ? "down" : "stable"
    const summary = { current, min, max, trend, graph: null }
    if (!key.endsWith("angle")) {
      const [borderColor, backgroundColor] = {
        temperature: ["#da3633", "#301a1f"],
        temperature_out: ["#e09b13", "#2a2111"],
        humidity: ["#1f6feb", "#121d2f"],
        humidity_out: ["#b87fff", "#1c1828"],
        co2: ["#6e7681", "#161b22"],
        pressure: ["#bf4b8a", "#221926"],
        noise: ["#ef6eb1", "#211620"],
        rain: ["#8957e5", "#1d1b2e"],
        windstrength: ["#238636", "#12261e"],
        guststrength: ["#09b43a", "#0a2517"],
        illuminance: ["#9e6a03", "#272115"],
      }[key]!
      const entries = data.map((
        { key: [_, date], value },
      ) => [date, value[key]]).filter(([, value]) => Number.isFinite(value))
      const labels = entries.map(([date]) => new Date(date as string).toISOString())
      const datasets = [{
        label: (lang as { [key: string]: string })[key],
        data: entries.map(([, value]) => value),
        borderColor,
        backgroundColor: `${backgroundColor}40`,
        fill: true,
      }]
      if (entries.length) {
        if (key.endsWith("_out")) {
          const { graph } = result[key.replace("_out", "")]
          graph.datasets.push(...datasets)
        } else if (key === "guststrength") {
          const { graph } = result.windstrength
          graph.datasets.push(...datasets)
        } else {
          Object.assign(summary, {
            graph: {
              labels,
              datasets,
              ...(specs as { [key: string]: Record<string, unknown> })[key],
            },
          })
        }
      }
    } else {
      const [borderColor, backgroundColor] = {
        windangle: ["#238636", "#12261e"],
        gustangle: ["#09b43a", "#0a2517"],
      }[key]!
      const datasets = [{
        label: [(lang as { [key: string]: string })[key]],
        data: new Array(360).fill(0).map((_) => Math.random()),
        borderColor,
        backgroundColor: `${backgroundColor}40`,
        fill: true,
      }]
      if (key === "gustangle") {
        const { graph } = result.windangle
        graph.datasets.push(...datasets)
      } else {
        Object.assign(summary, {
          graph: {
            datasets,
            ...(specs as { [key: string]: Record<string, unknown> })[key],
          },
        })
      }
    }
    result[key] = summary
  }
  return new Response(JSON.stringify(result), { headers })
}
