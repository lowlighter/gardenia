// Imports
import { kv } from "./app.ts"
import { isAllowedTo } from "./users.ts"
import { lang } from "./lang.ts"
import { Status } from "std/http/status.ts"
import { updateHistory } from "./history.ts"
import { deepMerge } from "std/collections/deep_merge.ts"
import { settings } from "./app.ts"
import { delay } from "std/async/delay.ts"

// Register default values
const system = {
  autologout: 3,
  public: {
    stats: true,
    actions: true,
    history: true,
    images: true,
    video: true,
  },
}
{
  let { value } = await kv.get<typeof system>(["system"])
  if (!value) {
    await kv.set(["system"], system)
    updateHistory(null, lang.system_default_values_set, ["system"])
    const { value: update } = await kv.get<typeof system>(["system"])
    value = update
  }
  if (!value) {
    throw Object.assign(new ReferenceError("System default values not found"), {
      stack: "",
    })
  }
  Object.assign(system, deepMerge(system, value))
}
export { system }

// Headers
const headers = new Headers({
  "Content-Type": "application/json",
  "Cache-Control": "max-age=0, no-cache, must-revalidate, proxy-revalidate",
})

/** Update system */
export async function updateSystem(request: Request, session?: string) {
  if (!await isAllowedTo(session, ["system"])) {
    return new Response(JSON.stringify({ error: lang.forbidden }), {
      status: Status.Forbidden,
      headers,
    })
  }
  const { value } = await kv.get<{ [key: PropertyKey]: unknown }>(["system"])
  if (!value) {
    return new Response(JSON.stringify({ error: lang.unknown_error }), {
      status: Status.InternalServerError,
      headers,
    })
  }
  const update = deepMerge(value, await request.json())
  update.autologout = Number(update.autologout)
  await kv.set(["system"], update)
  updateHistory(null, lang.system_updated, ["system"])
  return new Response(JSON.stringify({ success: true }), { headers })
}

/** Get system configuration */
export async function getSystem(_: Request, _session?: string) {
  const { value: system } = await kv.get<{ [key: PropertyKey]: string }[]>([
    "system",
  ])
  return new Response(JSON.stringify(system), { headers })
}

/** Get modules */
export async function getModules(_: Request, session?: string) {
  if (!await isAllowedTo(session, ["system"])) {
    return new Response(JSON.stringify({ error: lang.forbidden }), {
      status: Status.Forbidden,
      headers,
    })
  }
  return new Response(
    JSON.stringify({
      netatmo_modules: settings.netatmo_modules,
      tp_modules: settings.tp_modules,
    }),
    { headers },
  )
}

/** Is exited */
let exited = false

/** Exit service */
export async function exitService(_: Request, session?: string) {
  if (!await isAllowedTo(session, ["system"])) {
    return new Response(JSON.stringify({ error: lang.forbidden }), {
      status: Status.Forbidden,
      headers,
    })
  }
  if (exited) {
    return new Response(JSON.stringify({ error: lang.already_exited }), {
      status: Status.BadRequest,
      headers,
    })
  }
  exited = true
  delay(5000).then(() => Deno.exit(1))
  return new Response(JSON.stringify({ success: true }), { headers })
}
