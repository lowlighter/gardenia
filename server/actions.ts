// Imports
import { updateHistory } from "./history.ts"
import { kv } from "./app.ts"
import { Status } from "std/http/status.ts"
import { lang } from "./lang.ts"
import { isAllowedTo } from "./users.ts"
import { system } from "./system.ts"
import { settings } from "./app.ts"

// Register actions
for (const action of ["light", "heat", "aeration", "water", "video", "camera"]) {
  const { value: exists } = await kv.get(["actions", action])
  if (exists) {
    continue
  }
  await kv.set(["actions", action], { enabled: true, on: true })
}

// Sync actions states
for (const { action } of settings.tp_modules as unknown as { action: string }[]) {
  try {
    const { state } = await getState(action)
    const { value } = await kv.get(["actions", action])
    await kv.set(["actions", action], { ...value!, on: state })
  } catch (error) {
    console.log(`failed to get state of ${action}: ${error}`)
  }
}

// Start video streams
for (const ip of settings.videos as unknown as string[]) {
  if (!ip.includes("0.0.0.0")) {
    continue
  }
  const port = Number(ip.split(":")[1])
  if (!Number.isNaN(port)) {
    continue
  }
  startVideo(port)
}

// Headers
const headers = new Headers({ "Content-Type": "application/json" })

/** Get actions */
export async function getActions(_: Request, session?: string) {
  if ((!system.public.actions) && (!await isAllowedTo(session, []))) {
    return new Response(JSON.stringify({ error: lang.forbidden }), { status: Status.Forbidden, headers })
  }
  const actions = {} as Record<PropertyKey, unknown>
  const entries = kv.list({ prefix: ["actions"] })
  for await (const { key, value } of entries) {
    actions[key.at(-1)! as string] = value
  }
  return new Response(JSON.stringify(actions), { headers })
}

/** Update action */
export async function updateAction(request: Request, session?: string) {
  if ((!session) || (!await isAllowedTo(session, ["actions"]))) {
    return new Response(JSON.stringify({ error: lang.forbidden }), { status: Status.Forbidden, headers })
  }
  const { value: actor } = await kv.get<string>(["sessions", session])
  const { target: name, action, duration } = await request.json()
  const { value: target } = await kv.get<Record<string, unknown>>(["actions", name])
  if (!target) {
    return new Response(JSON.stringify({ error: lang.action_does_not_exist }), { status: Status.NotFound, headers })
  }
  switch (action) {
    case "enable": {
      target.enabled = true
      updateHistory(actor, lang.action_enabled.replaceAll("${target}", (lang as { [key: string]: string })[name]), ["actions"])
      break
    }
    case "disable": {
      target.enabled = false
      target.on = false
      await setState(name, target.on as boolean)
      updateHistory(actor, lang.action_disabled.replaceAll("${target}", (lang as { [key: string]: string })[name]), ["actions"])
      break
    }
    case "on": {
      if (name === "camera") {
        await takePicture()
        updateHistory(actor, lang.action_photo_taken)
        break
      }
      const dt = ({
        "1m": 60,
        "5m": 300,
        "10m": 600,
        "15m": 900,
        "30m": 1800,
        "1h": 3600,
        "2h": 7200,
        "3h": 10800,
        "4h": 14400,
        "5h": 18000,
        "6h": 21600,
        "7h": 25200,
        "8h": 28800,
        "9h": 32400,
        "10h": 36000,
        "11h": 39600,
        "12h": 43200,
      } as { [key: string]: number })[duration] * 1000
      if (!dt) {
        return new Response(JSON.stringify({ error: lang.bad_duration }), { status: Status.BadRequest, headers })
      }
      target.on = true
      target.until = Date.now() + dt
      await setState(name, target.on as boolean)
      updateHistory(actor, lang.action_on.replaceAll("${target}", (lang as { [key: string]: string })[name]).replaceAll("${duration}", duration))
      setTimeout(async () => {
        target.on = false
        delete target.until
        await setState(name, target.on as boolean)
        await kv.set(["actions", name], target)
        updateHistory(null, lang.action_off_auto.replaceAll("${target}", (lang as { [key: string]: string })[name]).replaceAll("${duration}", duration).replaceAll("${actor}", actor!))
      }, dt)
      break
    }
    case "off": {
      target.on = false
      await setState(name, target.on as boolean)
      updateHistory(actor, lang.action_off.replaceAll("${target}", (lang as { [key: string]: string })[name]))
      break
    }
  }
  await kv.set(["actions", name], target)
  return new Response(JSON.stringify({ success: true }), { headers })
}

/** Set action state */
async function setState(target: string, state: boolean) {
  const module = await getState(target)
  if (module.state === state) {
    return
  }
  const command = new Deno.Command("python3", {
    args: [`${Deno.cwd()}/python/tp_${state ? "on" : "off"}.py`],
    clearEnv: true,
    env: {
      TP_IP: module.ip,
      TP_USERNAME: settings.tp_username,
      TP_PASSWORD: settings.tp_password,
    },
    stdout: "null",
    stderr: "null",
    stdin: "null",
  })
  await command.output()
}

/** Get action state */
async function getState(target: string) {
  const module = (settings.tp_modules as unknown as { action: string; ip: string }[]).find((module) => module.action === target)
  if (!module) {
    throw Object.assign(new ReferenceError(`Action not found: ${target}`), { stack: "" })
  }
  const command = new Deno.Command("python3", {
    args: [`${Deno.cwd()}/python/tp_state.py`],
    clearEnv: true,
    env: {
      TP_IP: module.ip,
      TP_USERNAME: settings.tp_username,
      TP_PASSWORD: settings.tp_password,
    },
    stdout: "piped",
    stderr: "null",
    stdin: "null",
  })
  const { stdout } = await command.output()
  const { device_on } = JSON.parse(new TextDecoder().decode(stdout))
  return { ...module, state: device_on }
}

/** Take picture */
function takePicture() {
  throw new Error("Function not implemented.")
}

/** Start stream */
export function startVideo(port: number) {
  const command = new Deno.Command("python3", {
    args: [`${Deno.cwd()}/python/stream.py`],
    clearEnv: true,
    env: {
      STREAM_PORT: `${port}`,
    },
    stdout: "null",
    stderr: "null",
    stdin: "null",
  })
  console.log(`started video stream on port ${port}`)
  command.spawn()
}
