// Imports
import { parseArgs } from "jsr:@std/cli/parse-args"
import { Server } from "./server/server.ts"
import { z as is } from "https://deno.land/x/zod@v3.21.4/mod.ts";

// Entry point
if (import.meta.main) {
  const args = is.object({
    ports:is.object({
      server:is.number().default(8080),
      picamera:is.number().default(8081),
    }).default(() => ({})),
    mode:is.enum(["all", "app", "ctl"]),
  }).parse(parseArgs(Deno.args, {}))
  await new Server(args).ready
}
