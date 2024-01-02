// Imports
import { updateHistory } from "./history.ts"
import { kv } from "./app.ts"
import { Status } from "std/http/status.ts"
import { lang } from "./lang.ts"
import { isAllowedTo } from "./users.ts"
import { system } from "./system.ts"
import { settings } from "./app.ts"

// Register actions
for (
  const action of ["light", "heat", "aeration", "water", "video", "camera"]
) {
  const { value: exists } = await kv.get(["actions", action])
  if (exists) {
    continue
  }
  await kv.set(["actions", action], {
    enabled: true,
    on: false,
    conditions: [],
  })
}

// Sync actions states
for (
  const { action } of settings.tp_modules as unknown as { action: string }[]
) {
  try {
    const { state } = await getState(action)
    const { value } = await kv.get(["actions", action])
    await kv.set(["actions", action], { ...value!, on: state })
  } catch (error) {
    console.log(`failed to get state of ${action}: ${error}`)
  }
}

// Start video streams
for (
  const { picamera, port } of settings.videos as unknown as {
    picamera?: boolean
    port: number
  }[]
) {
  if (!picamera) {
    continue
  }
  if (Number.isNaN(port)) {
    continue
  }
  startVideo(port)
}

// Headers
const headers = new Headers({
  "Content-Type": "application/json",
  "Cache-Control": "max-age=0, no-cache, must-revalidate, proxy-revalidate",
})

/** Get actions */
export async function getActions(_: Request, session?: string) {
  if ((!system.public.actions) && (!await isAllowedTo(session, []))) {
    return new Response(JSON.stringify({ error: lang.forbidden }), {
      status: Status.Forbidden,
      headers,
    })
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
  if (!await isAllowedTo(session, ["actions"])) {
    return new Response(JSON.stringify({ error: lang.forbidden }), {
      status: Status.Forbidden,
      headers,
    })
  }
  const { value: actor } = await kv.get<string>(["sessions", session!])
  const { target: name, action, duration } = await request.json()
  const { value: target } = await kv.get<Record<string, unknown>>([
    "actions",
    name,
  ])
  if (!target) {
    return new Response(JSON.stringify({ error: lang.action_does_not_exist }), {
      status: Status.NotFound,
      headers,
    })
  }
  switch (action) {
    case "enable": {
      target.enabled = true
      updateHistory(
        actor,
        lang.action_enabled.replaceAll(
          "${target}",
          (lang as { [key: string]: string })[name],
        ),
        ["actions"],
      )
      break
    }
    case "disable": {
      target.enabled = false
      target.on = false
      await setState(name, target.on as boolean)
      updateHistory(
        actor,
        lang.action_disabled.replaceAll(
          "${target}",
          (lang as { [key: string]: string })[name],
        ),
        ["actions"],
      )
      break
    }
    case "on": {
      if (!target.enabled) {
        return new Response(
          JSON.stringify({ error: lang.action_is_disabled }),
          { status: Status.NotImplemented, headers },
        )
      }
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
        return new Response(JSON.stringify({ error: lang.bad_duration }), {
          status: Status.BadRequest,
          headers,
        })
      }
      target.on = true
      target.until = Date.now() + dt
      await setState(name, target.on as boolean)
      updateHistory(
        actor,
        lang.action_on.replaceAll(
          "${target}",
          (lang as { [key: string]: string })[name],
        ).replaceAll("${duration}", duration),
      )
      setTimeout(async () => {
        target.on = false
        delete target.until
        await setState(name, target.on as boolean)
        await kv.set(["actions", name], target)
        updateHistory(
          null,
          lang.action_off_auto.replaceAll(
            "${target}",
            (lang as { [key: string]: string })[name],
          ).replaceAll("${duration}", duration).replaceAll("${actor}", actor!),
        )
      }, dt)
      break
    }
    case "off": {
      if (!target.enabled) {
        return new Response(
          JSON.stringify({ error: lang.action_is_disabled }),
          { status: Status.NotImplemented, headers },
        )
      }
      target.on = false
      await setState(name, target.on as boolean)
      updateHistory(
        actor,
        lang.action_off.replaceAll(
          "${target}",
          (lang as { [key: string]: string })[name],
        ),
      )
      break
    }
  }
  await kv.set(["actions", name], target)
  return new Response(JSON.stringify({ success: true }), { headers })
}

/** Update action via buttons (toggle) */
export async function updateActionViaButtons(request: Request, _?: string) {
  const authorization = request.headers.get("authorization")
  if (!authorization) {
    return new Response(JSON.stringify({ error: lang.forbidden }), {
      status: Status.Forbidden,
      headers,
    })
  }
  const match = authorization.match(/^Basic\s+(.*)$/)
  if (!match) {
    return new Response(JSON.stringify({ error: lang.bad_request }), {
      status: Status.BadRequest,
      headers,
    })
  }
  const [user, password] = atob(match[1]).split(":")
  const { pin } = await request.json()
  const buttons = settings.buttons as unknown as {
    token: string
    list: { pin: number; action: string }[]
  }
  if ((user !== "buttons") && (password !== buttons.token)) {
    return new Response(JSON.stringify({ error: lang.login_failed }), {
      status: Status.Unauthorized,
      headers,
    })
  }
  const button = buttons.list.find((button) => button.pin === pin)
  if (!button) {
    return new Response(JSON.stringify({ error: lang.bad_request }), {
      status: Status.BadRequest,
      headers,
    })
  }
  const state = await getState(button.action)
  await setState(button.action, !state)
  return new Response(JSON.stringify({ success: true }), { headers })
}

/** Update action conditions */
export async function updateActionCondition(
  request: Request,
  session?: string,
) {
  if (!await isAllowedTo(session, ["actions"])) {
    return new Response(JSON.stringify({ error: lang.forbidden }), {
      status: Status.Forbidden,
      headers,
    })
  }
  const { value: actor } = await kv.get<string>(["sessions", session!])
  const { target: name, conditions } = await request.json()
  const { value: target } = await kv.get<Record<string, unknown>>([
    "actions",
    name,
  ])
  if (!target) {
    return new Response(JSON.stringify({ error: lang.action_does_not_exist }), {
      status: Status.NotFound,
      headers,
    })
  }
  if (!Array.isArray(conditions)) {
    return new Response(JSON.stringify({ error: lang.bad_request }), {
      status: Status.BadRequest,
      headers,
    })
  }
  for (const { list, duration } of conditions) {
    if (
      (name !== "camera") &&
      (!["1m", "5m", "10m", "15m", "30m"].includes(duration))
    ) {
      return new Response(
        JSON.stringify({
          error: `${lang.bad_request}: ${lang.bad_duration} (${duration})`,
        }),
        { status: Status.BadRequest, headers },
      )
    }
    for (const condition of list) {
      condition.value = Number(condition.value)
      const { stat, op, value } = condition
      if (!stat) {
        return new Response(
          JSON.stringify({
            error: `${lang.bad_request}: ${lang.bad_stat} (${stat})`,
          }),
          { status: Status.BadRequest, headers },
        )
      }
      if (!["eq", "le", "ge"].includes(op)) {
        return new Response(
          JSON.stringify({
            error: `${lang.bad_request}: ${lang.bad_op} (${op})`,
          }),
          { status: Status.BadRequest, headers },
        )
      }
      if (!Number.isFinite(value)) {
        return new Response(
          JSON.stringify({
            error: `${lang.bad_request}: ${lang.bad_value} (${value})`,
          }),
          { status: Status.BadRequest, headers },
        )
      }
    }
  }
  target.conditions = conditions
  await kv.set(["actions", name], target)
  updateHistory(
    actor,
    lang.action_conditions_updated.replaceAll(
      "${target}",
      (lang as { [key: string]: string })[name],
    ),
  )
  return new Response(JSON.stringify({ success: true }), { headers })
}

/** Check and evaluate conditions */
export async function checkActionsConditions() {
  const now = new Date()
  const time = now.getHours() + (now.getMinutes() / 60)
  const epsilon = Number(settings.delta_epsilon) || 0
  const entries = kv.list<{ [key: string]: number | null }>({
    start: ["stats", now.getTime() - 50000 * 60 * 1000],
    end: ["stats", now.getTime()],
  }, { limit: 1, reverse: true })
  const [{ value: current }] = await Array.fromAsync(entries)
  // deno-lint-ignore no-explicit-any
  const actions = kv.list<any>({ prefix: ["actions"] })
  for await (const { key, value: target } of actions) {
    let on = false
    let t = parseInt("1m")
    for (const condition of target.conditions) {
      const { duration, list } = condition
      let ok = target.conditions.length > 0
      for (const { stat, op, value } of list) {
        if (stat === "time") {
          switch (op) {
            case "eq":
              ok = ok &&
                ((time >= value - epsilon) && (time <= value + epsilon))
              continue
            case "ge":
              ok = ok && (time >= value)
              continue
            case "le":
              ok = ok && (time <= value)
              continue
          }
        }
        if (typeof current?.[stat] !== "number") {
          ok = false
          continue
        }
        switch (op) {
          case "eq":
            ok = ok &&
              ((current[stat]! >= value - epsilon) &&
                (current[stat]! <= value + epsilon))
            continue
          case "ge":
            ok = ok && (current[stat]! >= value)
            continue
          case "le":
            ok = ok && (current[stat]! <= value)
            continue
        }
      }
      condition.fulfilled = ok
      if (condition.fulfilled) {
        on = true
        t = Math.max(t, parseInt(duration))
      }
    }
    if (on) {
      const name = String(key.at(-1)!)
      const dt = ({
        "1m": 60,
        "5m": 300,
        "10m": 600,
        "15m": 900,
        "30m": 1800,
      } as { [key: string]: number })[`${t}m`] * 1000
      target.on = true
      target.until = Date.now() + dt
      await setState(name, target.on as boolean)
      updateHistory(
        null,
        lang.action_on.replaceAll(
          "${target}",
          (lang as { [key: string]: string })[name],
        ).replaceAll("${duration}", `${t}m`),
      )
      setTimeout(async () => {
        target.on = false
        delete target.until
        await setState(name, target.on as boolean)
        await kv.set(["actions", name], target)
        updateHistory(
          null,
          lang.action_off_auto.replaceAll(
            "${target}",
            (lang as { [key: string]: string })[name],
          ).replaceAll("${duration}", `${t}m`).replaceAll(
            "${actor}",
            lang.system,
          ),
        )
      }, dt)
    } else if ((target.until) && (target.until < Date.now())) {
      target.on = false
      delete target.until
      await setState(name, target.on as boolean)
      updateHistory(
        null,
        lang.action_off.replaceAll(
          "${target}",
          (lang as { [key: string]: string })[name],
        ),
      )
    }
    await kv.set(key, target)
  }
}

/** Set action state */
async function setState(target: string, state: boolean) {
  const module = await getState(target)
  if (module.state === state) {
    return
  }
  if (settings.simulated) {
    const { value } = await kv.get<Record<PropertyKey, unknown>>([
      "actions",
      target,
    ])
    await kv.set(["actions", target], { ...value, on: state })
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
  })
  await command.output()
}

/** Get action state */
async function getState(target: string) {
  if (settings.simulated) {
    const { value } = await kv.get<{ on: boolean }>(["actions", target])
    return { ip: "", state: value!.on }
  }
  const module = (settings.tp_modules as unknown as { action: string; ip: string }[]).find((
    module,
  ) => module.action === target)
  if (!module) {
    throw Object.assign(new ReferenceError(`Action not found: ${target}`), {
      stack: "",
    })
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
  })
  const { stdout } = await command.output()
  const { device_on } = JSON.parse(new TextDecoder().decode(stdout))
  return { ...module, state: device_on }
}

/** Take picture */
async function takePicture() {
  const camera = (settings.videos as unknown as {
    picamera?: boolean
    url: string
    port: number
  }[]).find((video) => video.picamera)
  if (!camera) {
    throw Object.assign(new ReferenceError("No camera found"), { stack: "" })
  }
  const name = Date.now()
  await fetch(`${camera.url}:${camera.port}/capture`)
    .then((response) => response.arrayBuffer())
    .then((buffer) => Deno.writeFile(`${settings.pictures}/${name}.png`, new Uint8Array(buffer)))
  console.log(`saved picture ${name}.png`)
}

/** Get pictures list */
export async function getPictures(_: Request, session?: string) {
  if ((!system.public.images) && (!await isAllowedTo(session, []))) {
    return new Response(JSON.stringify({ error: lang.forbidden }), {
      status: Status.Forbidden,
      headers,
    })
  }
  const entries = await Array.fromAsync(Deno.readDir(settings.pictures))
  let pictures = entries.filter((entry) => entry.isFile && entry.name.endsWith(".png")).map((entry) => Number(entry.name.replace(".png", ""))).sort((a, b) => b - a)
    .map((name) => `/pictures/${name}`)
  if (!await isAllowedTo(session, [])) {
    pictures = pictures.slice(-1)
  }
  return new Response(JSON.stringify(pictures), { headers })
}

/** Start stream */
export function startVideo(port: number) {
  const command = new Deno.Command("python3", {
    args: [`${Deno.cwd()}/python/video.py`],
    clearEnv: true,
    env: {
      STREAM_PORT: `${port}`,
    },
  })
  console.log(`started video stream on port ${port}`)
  command.spawn()
}
