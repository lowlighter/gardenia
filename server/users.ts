// Imports
import { updateHistory } from "./history.ts"
import { kv, settings } from "./app.ts"
import { Status } from "std/http/status.ts"
import { encodeHex } from "std/encoding/hex.ts"
import { lang } from "./lang.ts"
import { system } from "./system.ts"

// Clear sessions
const entries = kv.list({ prefix: ["sessions"] })
for await (const { key } of entries) {
  await kv.delete(key)
}

// Register admin user
{
  const username = "admin"
  const { value } = await kv.get(["users", username])
  if (!value) {
    await kv.set(["users", username], {
      username,
      password: encodeHex(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(settings.admin_password),
        ),
      ),
      logged: null,
      role: {
        admin: true,
      },
      system: true,
    })
    updateHistory(username, lang.user_created, ["users"])
  }
}

// Headers
const headers = new Headers({
  "Content-Type": "application/json",
  "Cache-Control": "max-age=0, no-cache, must-revalidate, proxy-revalidate",
})

/** Login */
export async function login(request: Request, session?: string) {
  // Recover existing session
  if (session) {
    const { value: username } = await kv.get<string>(["sessions", session])
    if (username) {
      const { value } = await kv.get<
        { password: string; [key: PropertyKey]: unknown }
      >(["users", username])
      if (!value) {
        return new Response(JSON.stringify({ error: lang.bad_request }), {
          status: Status.BadRequest,
          headers,
        })
      }
      const { password, ...user } = value
      await kv.set(["users", username], {
        ...user,
        password,
        logged: Date.now(),
      })
      return new Response(JSON.stringify({ success: true, session, user }), {
        headers,
      })
    }
  }
  // New session
  {
    const { username, password } = await request.json()
    if ((!username) || (!password)) {
      return new Response(JSON.stringify({ error: lang.bad_request }), {
        status: Status.BadRequest,
        headers,
      })
    }
    const { value } = await kv.get<
      { password: string; [key: PropertyKey]: unknown }
    >(["users", username])
    if (!value) {
      return new Response(JSON.stringify({ error: lang.login_failed }), {
        status: Status.Unauthorized,
        headers,
      })
    }
    const { password: hashed, ...user } = value
    const hash = encodeHex(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password)),
    )
    if ((!user) || (hash !== hashed)) {
      return new Response(JSON.stringify({ error: lang.login_failed }), {
        status: Status.Unauthorized,
        headers,
      })
    }
    const session = crypto.randomUUID()
    await kv.set(["sessions", session], username)
    await kv.set(["users", username], {
      ...user,
      password: hashed,
      logged: Date.now(),
    })
    if (system.autologout) {
      setTimeout(
        () => kv.delete(["sessions", session]),
        Number(system.autologout) * 24 * 60 * 1000,
      )
    }
    return new Response(JSON.stringify({ success: true, session, user }), {
      headers,
    })
  }
}

/** Logout */
export async function logout(_: Request, session?: string) {
  if (!session) {
    return new Response(JSON.stringify({ error: lang.bad_request }), {
      status: Status.BadRequest,
      headers,
    })
  }
  const { value: username } = await kv.get(["sessions", session])
  if (!username) {
    return new Response(JSON.stringify({ success: true }), { headers })
  }
  await kv.delete(["sessions", session])
  return new Response(JSON.stringify({ success: true }), { headers })
}

/** List users */
export async function getUsers(_: Request, session?: string) {
  if (!await isAllowedTo(session, ["users"])) {
    return new Response(JSON.stringify({ error: lang.forbidden }), {
      status: Status.Forbidden,
      headers,
    })
  }
  const entries = kv.list<{ password: string; [key: PropertyKey]: unknown }>({
    prefix: ["users"],
  })
  const users = [...await Array.fromAsync(entries)].map((
    { value },
  ) => (delete (value as { password?: string }).password, value))
  return new Response(JSON.stringify(users), { headers })
}

/** Add new user */
export async function addUser(request: Request, session: string) {
  if (!await isAllowedTo(session, ["users"])) {
    return new Response(JSON.stringify({ error: lang.forbidden }), {
      status: Status.Forbidden,
      headers,
    })
  }
  const { username, password, role = {} } = await request.json()
  const { value: exists } = await kv.get(["users", username])
  if (exists) {
    return new Response(JSON.stringify({ error: lang.user_already_exists }), {
      status: Status.Conflict,
      headers,
    })
  }
  if (["system", "buttons"].includes(username)) {
    return new Response(JSON.stringify({ error: lang.user_reserved }), {
      status: Status.Conflict,
      headers,
    })
  }
  await kv.set(["users", username], {
    username,
    logged: null,
    password: encodeHex(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password)),
    ),
    role,
  })
  updateHistory(username, lang.user_created, ["users"])
  return new Response(JSON.stringify({ success: true }), { headers })
}

/** Delete user */
export async function deleteUser(request: Request, session: string) {
  if (!await isAllowedTo(session, ["users"])) {
    return new Response(JSON.stringify({ error: lang.forbidden }), {
      status: Status.Forbidden,
      headers,
    })
  }
  const { username } = await request.json()
  const { value: exists } = await kv.get(["users", username])
  if (!exists) {
    return new Response(JSON.stringify({ error: lang.user_does_not_exist }), {
      status: Status.NotFound,
      headers,
    })
  }
  await kv.delete(["users", username])
  updateHistory(username, lang.user_deleted, ["users"])
  return new Response(JSON.stringify({ success: true }), { headers })
}

/** Update user */
export async function updateUser(request: Request, session: string) {
  const { value: actor } = await kv.get<string>(["sessions", session])
  const { username, password, role = {} } = await request.json()
  if (!username) {
    return new Response(JSON.stringify({ error: lang.bad_request }), {
      status: Status.BadRequest,
      headers,
    })
  }
  const { value: user } = await kv.get<
    { password: string; role: { [role: PropertyKey]: boolean } }
  >(["users", username])
  if (!user) {
    return new Response(JSON.stringify({ error: lang.user_does_not_exist }), {
      status: Status.NotFound,
      headers,
    })
  }
  if (password) {
    user.password = encodeHex(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password)),
    )
    if (actor !== username) {
      updateHistory(
        username,
        lang.user_password_updated.replaceAll("${actor}", actor!),
        ["users"],
      )
    }
  }
  if (Object.keys(role).length) {
    if (!await isAllowedTo(session, ["users"])) {
      return new Response(JSON.stringify({ error: lang.forbidden }), {
        status: Status.Forbidden,
        headers,
      })
    }
    user.role = role
    updateHistory(
      username,
      lang.user_roles_updated.replaceAll("${actor}", actor!).replaceAll(
        "${roles}",
        Object.entries(role).filter(([_, v]) => v).map(([k]) => k).join(", "),
      ),
      ["users"],
    )
  }
  await kv.set(["users", username], user)
  return new Response(JSON.stringify({ success: true }), { headers })
}

/** Check if user associated to sessions has all required roles to perform given action */
export async function isAllowedTo(
  session: string | void,
  roles = [] as string[],
) {
  if (!session) {
    return false
  }
  try {
    const { value: username } = await kv.get<string>(["sessions", session])
    if (!username) {
      return false
    }
    const { value: user } = await kv.get<
      { role: { [key: PropertyKey]: boolean } }
    >(["users", username])
    if (!user) {
      return false
    }
    if (user.role.admin) {
      return true
    }
    if ((roles.length) && (!roles.every((role) => user.role[role]))) {
      return false
    }
    return true
  } catch {
    return false
  }
}
