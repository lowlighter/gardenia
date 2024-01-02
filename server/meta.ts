// Imports
import { settings } from "./app.ts"

// Headers
const headers = new Headers({
  "Content-Type": "application/json",
  "Cache-Control": "max-age=0, no-cache, must-revalidate, proxy-revalidate",
})

/** Get metadata */
export function getMeta(_: Request, __?: string) {
  const meta = { name: settings.name, version: "1.0.0" }
  return new Response(JSON.stringify(meta), { headers })
}
