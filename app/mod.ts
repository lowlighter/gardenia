// Imports
import { parseArgs } from "jsr:@std/cli/parse-args"
import { Server } from "./server/server.ts"
import { z as is } from "https://deno.land/x/zod@v3.21.4/mod.ts"

// Entry point
if (import.meta.main) {
  const args = is.object({
    ports: is.object({
      server: is.number().default(8080),
      picamera: is.number().default(8081),
    }).default(() => ({})),
    mode: is.enum(["all", "app", "ctl"]),
    kv: is.string().optional(),
    loglevel: is.union([is.number(), is.string()]).optional(),
  }).parse(parseArgs(Deno.args, {}))
  const server = await new Server(args).ready
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    try {
      Deno.addSignalListener(signal, () => server.close())
    } catch (error) {
      console.warn(error)
    }
  }
}
