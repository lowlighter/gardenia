// Imports
import { kv } from "./app.ts"
import { isAllowedTo } from "./users.ts"
import { lang } from "./lang.ts"
import { Status } from "std/http/status.ts"
import { system } from "./system.ts"

// Headers
const headers = new Headers({
  "Content-Type": "application/json",
  "Cache-Control": "max-age=0, no-cache, must-revalidate, proxy-revalidate",
})

/** Update history */
export async function updateHistory(
  username: string | null,
  message: string,
  roles = [] as string[],
) {
  const { value } = await kv.get<unknown[]>(["history"])
  const history = value ?? []
  history.push({ time: Date.now(), username, message, roles })
  console.log(`${username ?? lang.system}: ${message}`)
  await kv.set(["history"], history)
}

/** Get history */
export async function getHistory(request: Request, session?: string) {
  if ((!system.public.history) && (!await isAllowedTo(session))) {
    return new Response(JSON.stringify({ error: lang.forbidden }), {
      status: Status.Forbidden,
      headers,
    })
  }
  const params = new URL(request.url).searchParams
  let page = 0
  if (params.has("page")) {
    page = Number(params.get("page")!)
  }
  if (Number.isNaN(page)) {
    return new Response(JSON.stringify({ error: lang.bad_request }), {
      status: Status.BadRequest,
      headers,
    })
  }
  const { value: _history } = await kv.get<{ [key: PropertyKey]: string }[]>([
    "history",
  ])
  const history = [
    ...await Promise.all((_history ?? [])
      .map(async ({ time, username, message, roles }) =>
        (!roles.length ||
            await isAllowedTo(session, roles as unknown as string[]))
          ? {
            time,
            username: username === null ? lang.system : await isAllowedTo(session) ? username : lang.history_hidden_username,
            message,
          }
          : null
      )),
  ].filter(Boolean).reverse()
  return new Response(
    JSON.stringify({
      length: history.length,
      page,
      entries: history.slice(page * 10, (page * 10) + 10),
    }),
    { headers },
  )
}
