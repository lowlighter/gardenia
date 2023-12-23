// Imports
import { Status } from "std/http/status.ts"
import { settings } from "./app.ts"
import { system } from "./system.ts"
import { isAllowedTo } from "./users.ts"
import { lang } from "./lang.ts"

// Headers
const headers = new Headers({ "Content-Type": "application/json" })

/** Get stream */
export async function getStream(_: Request, session: string | undefined, index: number) {
  if ((!system.public.video) && (!await isAllowedTo(session, []))) {
    return new Response(JSON.stringify({ error: lang.forbidden }), { status: Status.Forbidden, headers })
  }
  if (!settings.stream_port[index]) {
    return new Response(JSON.stringify({ error: lang.stream_not_found }), { status: Status.NotFound, headers })
  }
  return fetch(`http://0.0.0.0:${settings.stream_port[index]}`)
}
