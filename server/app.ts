// Imports
import * as JSONC from "std/jsonc/parse.ts"

/** Settings */
export const settings = JSONC.parse(
  await Deno.readTextFile("settings.jsonc"),
) as Record<string, string>

/** Key value-store */
export const kv = await Deno.openKv(".kv")
