/// <reference lib="deno.unstable" />
// Imports
import { serveDir } from "std/http/file_server.ts"
import { fromFileUrl } from "std/path/from_file_url.ts"
import { getCookies } from "std/http/cookie.ts"
import { addUser, deleteUser, getUsers, login, logout, updateUser } from "./users.ts"
import { getHistory, updateHistory } from "./history.ts"
import { getActions, updateAction } from "./actions.ts"
import { settings } from "./app.ts"
import { getStats } from "./stats.ts"
import { getStream } from "./streams.ts"
import { lang } from "./lang.ts"
import { getMeta } from "./meta.ts"
import { getSystem, updateSystem } from "./system.ts"
import { fetchNetatmoData, refreshNetatmoToken } from "./netatmo.ts"

/** Serve files */
export async function serve({ init = true } = {}) {
  if (init) {
    await refreshNetatmoToken()
    await fetchNetatmoData(new Date(0))
  }

  Deno.serve({ port: Number(settings.port), onListen: () => void null }, (request) => {
    console.log(request.url)
    const url = new URL(request.url)
    const { gardenia_session: session } = getCookies(request.headers)
    switch (true) {
      // Language
      case (url.pathname === "/lang") && (request.method === "GET"):
        return new Response(JSON.stringify(lang), { headers: { "Content-Type": "application/json" } })

      // User login
      case (url.pathname === "/login") && (request.method === "POST"):
        return login(request, session)
      // User logout
      case (url.pathname === "/logout") && (request.method === "POST"):
        return logout(request, session)

      // Get metadata
      case (url.pathname === "/api/meta") && (request.method === "GET"):
        return getMeta(request, session)

      // Get system
      case (url.pathname === "/api/system") && (request.method === "GET"):
        return getSystem(request, session)
      // Update system
      case (url.pathname === "/api/system") && (request.method === "PATCH"):
        return updateSystem(request, session)

      // List users
      case (url.pathname === "/api/users") && (request.method === "GET"):
        return getUsers(request, session)
      // Create new user
      case (url.pathname === "/api/users") && (request.method === "POST"):
        return addUser(request, session)
      // Delete user
      case (url.pathname === "/api/users") && (request.method === "DELETE"):
        return deleteUser(request, session)
      // Update user
      case (url.pathname === "/api/users") && (request.method === "PATCH"):
        return updateUser(request, session)

      // List history
      case (url.pathname === "/api/history") && (request.method === "GET"):
        return getHistory(request, session)

      // List actions
      case (url.pathname === "/api/actions") && (request.method === "GET"):
        return getActions(request, session)
      // Update action
      case (url.pathname === "/api/actions") && (request.method === "PATCH"):
        return updateAction(request, session)

      // Camera #1
      case url.pathname === "/stream/0":
        return getStream(request, session, 0)

      // Get stats
      case (url.pathname === "/api/stats") && (request.method === "GET"):
        return getStats(request, session)

      // Serve static files
      default:
        return serveDir(request, { fsRoot: fromFileUrl(new URL("static", import.meta.url)), quiet: true })
    }
  })
  updateHistory(null, lang.server_started)
}