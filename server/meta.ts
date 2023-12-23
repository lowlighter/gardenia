// Imports
import { settings } from "./app.ts"

// Headers
const headers = new Headers({ "Content-Type": "application/json" })

/** Get metadata */
export function getMeta(_: Request, __?: string) {
  const meta = { name: settings.name }
  return new Response(JSON.stringify(meta), { headers })
}
