// Imports
import { updateHistory } from "./history.ts"
import { kv, settings } from "./app.ts"
import { lang } from "./lang.ts"
import { deepMerge } from "std/collections/deep_merge.ts"

/** Stats */
const stats = {
  indoor: [
    "temperature",
    "humidity",
    "co2",
    "pressure",
    "noise",
    "rain",
    "windstrength",
    "windangle",
    "guststrength",
    "gustangle",
  ],
  outdoor: ["temperature", "humidity"],
  rain: ["rain"],
}

/** Modules */
const modules = settings.netatmo_modules as unknown as {
  mac: string
  type: keyof typeof stats
}[]

/** Fetch data from netatmo modules */
export async function fetchNetatmoData(
  t = new Date(),
  { authrefresh = true } = {},
) {
  const today = new Date(t)
  today.setMinutes(today.getMinutes() - 30)
  const { value: token } = await kv.get<string>(["netatmo_token"])
  if (!token) {
    throw Object.assign(new ReferenceError("Netatmo token not found"), {
      stack: "",
    })
  }
  if (modules[0].type !== "indoor") {
    throw Object.assign(
      new ReferenceError("First Netatmo module must be the indoor station"),
      { stack: "" },
    )
  }
  const { mac: station } = modules[0]
  for (const module of modules) {
    const { mac, type } = module
    const search = new URLSearchParams({
      device_id: station,
      ...(type === "indoor" ? {} : { module_id: mac }),
      scale: "30min",
      type: stats[type].join(","),
      date_begin: `${Math.floor(today.getTime() / 1000)}`,
      optimize: "false",
    })
    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    })
    const url = new URL(`https://api.netatmo.com/api/getmeasure?${search}`)
    const { status, body, error } = await fetch(url, { headers }).then((
      response,
    ) => response.json())
    if ((error?.code === 3) && authrefresh) {
      await refreshNetatmoToken()
      return fetchNetatmoData(t, { authrefresh: false })
    }
    if (status !== "ok") {
      throw Object.assign(
        new Error(`Netatmo API error: ${error?.message ?? ""}`),
        { stack: "" },
      )
    }
    for (
      const [t, values] of Object.entries(body) as Array<
        [string, Array<number | null>]
      >
    ) {
      const date = new Date(Number(t) * 1000)
      // deno-lint-ignore no-explicit-any
      let { value: data } = await kv.get<any>(["stats", date.getTime()])
      data ??= {}
      data = deepMerge(
        data,
        Object.fromEntries(
          stats[type].map((
            stat,
            i,
          ) => [`${stat}${type === "outdoor" ? "_out" : ""}`, values[i]]),
        ),
      )
      await kv.set(["stats", date.getTime()], data)
    }
  }
  updateHistory(null, lang.fetched_netatmo_data)
}

/** Refresh netatmo token */
export async function refreshNetatmoToken() {
  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
  })
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: settings.netatmo_refresh_token,
    client_id: settings.netatmo_client_id,
    client_secret: settings.netatmo_client_secret,
  }).toString()
  const { access_token, expires_in } = await fetch(
    "https://api.netatmo.com/oauth2/token",
    { method: "POST", headers, body },
  ).then((response) => response.json())
  await kv.set(["netatmo_token"], access_token)
  setTimeout(refreshNetatmoToken, expires_in * 1000)
  updateHistory(null, lang.refreshed_netatmo_token)
}
