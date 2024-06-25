// deno-lint-ignore-file no-fallthrough
// Imports
import { Logger } from "jsr:@libs/logger@1"
import {serveDir, STATUS_CODE as Status, STATUS_TEXT as StatusText } from "jsr:@std/http@0.224.4"
import { fromFileUrl } from "jsr:@std/path@0.225.2"
import type {rw, Nullable, record, Arg} from "jsr:@libs/typing@1"
import {assertEquals} from "jsr:@std/assert@0.225.2"
import { z as is } from "https://deno.land/x/zod@v3.21.4/mod.ts";
import { deepMerge } from "jsr:@std/collections/deep-merge"
import * as JSONC from "jsr:@std/jsonc"
import { Cookie, getCookies, setCookie } from "jsr:@std/http/cookie"
import { encodeHex } from "jsr:@std/encoding/hex"
import { expandGlob } from "jsr:@std/fs";
import { serveFile } from "std/http/file_server.ts"
import { resolve } from "std/path/resolve.ts"

/** User. */
type user = {
  username:string,
  password?:string,
  grant_admin:boolean,
  grant_automation:boolean,
  grant_data:boolean,
  logged:Nullable<string>
}

/** Automation target. */
type automation_target = {
  name:string,
  icon:string,
  module:string,
  disabled:boolean
}

/** Automation rule. */
type automation_rule = {
  name:string,
  target:string,
  priority:number,
  action: string,
  duration: number,
  conditions:Array<{
    data:string,
    operator:"==" | "!=" | ">" | ">=" | "<" | "<=",
    value:number
    delta:number
  }>
  hits:number
  last_hit:Nullable<string>
}

/**
 * Gardenia server.
 */
class Server {

  /** Constructor */
  constructor() {
    const {promise, resolve} = Promise.withResolvers<this>()
    this.ready = promise
    this.#log = new Logger({level:9999})
    ;(async () => {
      (this as rw).#kv = await Deno.openKv(".kv");
      (this as rw).#log.info("kv-store opened");
      (this as rw).#lang = Object.fromEntries((await Array.fromAsync(expandGlob(fromFileUrl(import.meta.resolve(`./lang/*.jsonc`)))))
        .map(({path, name}) => [name.replace(".jsonc", ""), JSONC.parse(Deno.readTextFileSync(path))]));
      (this as rw).#icons = (await Array.fromAsync(expandGlob(fromFileUrl(import.meta.resolve(`../client/svg/*.svg`)))))
        .map(({name}) => name.replace(".svg", ""));
      (this as rw).#log.info("languages loaded", Object.keys(this.#lang));
      resolve(this)
      //await this.#delete((this as rw).#log, ["status"]) //TODO to remove
    })()
  }

  /** Is ready ? */
  readonly ready

  /** Logger. */
  readonly #log

  /** Key-value store */
  readonly #kv = null as unknown as Deno.Kv

  /** Language files. */
  readonly #lang = {} as record<string>

  /** Icons. */
  readonly #icons = [] as string[]

  /** Server version. */
  readonly version = "2.0.0" as const

  // ===================================================================================================================

  /** Serve HTTP requests. */
  async serve() {
    await this.ready
    Deno.serve({port:8000, onListen:({hostname, port}) => this.#log.info(`server listening on ${hostname}:${port}`)}, async request => {
      const url = new URL(request.url)
      const { gardenia_session: session } = getCookies(request.headers)
      let log = this.#log.with({session:session?.slice(0, 8) ?? null, method:request.method, url:url.pathname}).debug("processing request")
      const user = session ? await this.#session(log, session) : null
      if (user) {
        log = log.with({username:user.username})
      }
      try {
        switch (true) {
          // Languages
          case new URLPattern("/lang", url.origin).test(url.href.replace(url.search, "")):
            switch (request.method) {
              case "GET":
                this.#authorize(user, null)
                return this.#json(Object.keys(this.#lang))
              default:
                return this.#unsupported()
            }
          case new URLPattern("/lang/:id", url.origin).test(url.href.replace(url.search, "")):{
            const id = url.pathname.split("/").at(-1) as string
            switch (request.method) {
              case "GET":{
                this.#authorize(user, null)
                return this.#json(this.#lang[id])
              }
              default:
                return this.#unsupported()
            }
          }
          // Icons
          case new URLPattern("/icons", url.origin).test(url.href.replace(url.search, "")):
            switch (request.method) {
              case "GET":
                this.#authorize(user, null)
                return this.#json(this.#icons)
              default:
                return this.#unsupported()
            }
          // Server status
          case new URLPattern("/api/status", url.origin).test(url.href.replace(url.search, "")):
            switch (request.method) {
              case "GET":
                this.#authorize(user, null)
                return this.#json(await this.#get(["status"]) ?? "unconfigured")
              default:
                return this.#unsupported()
            }
          // Meta settings
          case new URLPattern("/api/settings/meta", url.origin).test(url.href.replace(url.search, "")):
            switch (request.method) {
              case "PUT":{
                this.#authorize(user, {grant_admin:true})
                const {instance_name} = await this.#check(request, {
                  instance_name: is.string().min(1).max(255),
                  version:is.literal(this.version), // Read-only
                })
                await this.#set(log, ["settings", "meta", "instance_name"], instance_name)
              }
              case "GET":
                this.#authorize(user, null)
                return this.#json({
                  instance_name: await this.#get(["settings", "meta", "instance_name"]),
                  version: this.version,
                })
              default:
                return this.#unsupported()
            }
          // Camera settings
          case new URLPattern("/api/settings/camera", url.origin).test(url.href.replace(url.search, "")):
            switch (request.method) {
              case "PUT":{
                this.#authorize(user, {grant_admin:true})
                const {url, storage} = await this.#check(request, {
                  url: is.string().url().min(1).max(255),
                  storage: is.string().min(1).max(255),
                })
                await this.#set(log, ["settings", "camera", "url"], url)
                await this.#set(log, ["settings", "camera", "storage"], resolve(storage))
              }
              case "GET":
                this.#authorize(user, {grant_admin:true})
                return this.#json({
                  url: await this.#get(["settings", "camera", "url"]),
                  storage: await this.#get(["settings", "camera", "storage"]),
                })
              default:
                return this.#unsupported()
            }
          // Netatmo settings
          case new URLPattern("/api/settings/netatmo", url.origin).test(url.href.replace(url.search, "")):
            switch (request.method) {
              case "PUT":{
                this.#authorize(user, {grant_admin:true})
                const {client_id, client_secret, refresh_token} = await this.#check(request, {
                  client_id: is.string().min(1),
                  client_secret: is.string().min(1),
                  refresh_token: is.string().min(1),
                  access_token: is.string().nullable(), // Read-only
                  access_token_expiration: is.string().nullable(), // Read-only
                  user_mail: is.string().nullable(), // Read-only
                })
                await this.#set(log, ["settings", "netatmo", "client_id"], client_id)
                await this.#set(log, ["settings", "netatmo", "client_secret"], client_secret)
                await this.#set(log, ["settings", "netatmo", "refresh_token"], refresh_token)
                await this.#netatmo(log)
                await this.#netatmo_station(log)
              }
              case "GET":
                this.#authorize(user, {grant_admin:true})
                return this.#json({
                  client_id: await this.#get(["settings", "netatmo", "client_id"]),
                  client_secret: await this.#get(["settings", "netatmo", "client_secret"]),
                  refresh_token: await this.#get(["settings", "netatmo", "refresh_token"]),
                  access_token: await this.#get(["settings", "netatmo", "access_token"]),
                  access_token_expiration: new Date(Number(await this.#get(["settings", "netatmo", "access_token_expiration"]))).toISOString().slice(0, 16),
                  user_mail: await this.#get(["settings", "netatmo", "user_mail"]),
                })
              default:
                return this.#unsupported()
            }
          // Netatmo modules
          case new URLPattern("/api/settings/netatmo/modules", url.origin).test(url.href.replace(url.search, "")):
            switch (request.method) {
              case "PUT":
                this.#authorize(user, {grant_admin:true})
                await this.#netatmo_station(log)
              case "GET":
                this.#authorize(user, {grant_admin:true})
                return this.#json(await this.#get(["settings", "netatmo", "modules"]) ?? [])
              default:
                return this.#unsupported()
            }
          // Tapo settings
          case new URLPattern("/api/settings/tapo", url.origin).test(url.href.replace(url.search, "")):
            switch (request.method) {
              case "PUT":{
                this.#authorize(user, {grant_admin:true})
                const {username, password, api} = await this.#check(request, {
                  username: is.string().min(1),
                  password: is.string().min(1),
                  api: is.string().url().min(1),
                  uuid: is.string().nullable(), // Read-only
                  token: is.string().nullable(), // Read-only
                })
                await this.#set(log, ["settings", "tapo", "username"], username)
                await this.#set(log, ["settings", "tapo", "password"], password)
                await this.#set(log, ["settings", "tapo", "api"], api)
                if (!await this.#get(["settings", "tapo", "uuid"]))
                  await this.#set(log, ["settings", "tapo", "uuid"], crypto.randomUUID().toUpperCase())
                await this.#tapo(log)
                await this.#tapo_devices(log)
              }
              case "GET":
                this.#authorize(user, {grant_admin:true})
                return this.#json({
                  username: await this.#get(["settings", "tapo", "username"]),
                  password: await this.#get(["settings", "tapo", "password"]),
                  api: await this.#get(["settings", "tapo", "api"]),
                  uuid: await this.#get(["settings", "tapo", "uuid"]),
                  token: await this.#get(["settings", "tapo", "token"]),
                })
              default:
                return this.#unsupported()
            }
          // Tapo modules
          case new URLPattern("/api/settings/tapo/modules", url.origin).test(url.href.replace(url.search, "")):
            switch (request.method) {
              case "PUT":
                this.#authorize(user, {grant_admin:true})
                await this.#tapo_devices(log)
              case "GET":
                this.#authorize(user, {grant_admin:true})
                return this.#json(await this.#get(["settings", "tapo", "modules"]) ?? [])
              default:
                return this.#unsupported()
            }
          // Users
          case new URLPattern("/api/users", url.origin).test(url.href.replace(url.search, "")):
            switch (request.method) {
              case "POST": {
                this.#authorize(user, {grant_admin:true})
                const {username, password, grant_admin, grant_automation, grant_data} = await this.#check(request, {
                  username: is.string().min(1).max(64),
                  password: is.string().min(12).max(255),
                  grant_admin: is.boolean().default(false),
                  grant_automation: is.boolean().default(false),
                  grant_data: is.boolean().default(true),
                  logged: is.string().nullable(), // Read-only
                })
                if (await this.#get(["users", username]))
                  return this.#json({error:StatusText[Status.Conflict]}, {status: Status.Conflict})
                await this.#set(log, ["users", username], {username, password:await this.#hash(password), grant_admin, grant_automation, grant_data, logged:null} as user)
              }
              case "GET":{
                this.#authorize(user, {grant_admin:true})
                const users = (await Array.fromAsync(this.#kv.list({prefix:["users"]}))).map((({value}) => value))
                users.forEach(user => delete (user as rw).password)
                return this.#json(users)
              }
              default:
                return this.#unsupported()
            }
          case new URLPattern("/api/users/:username", url.origin).test(url.href.replace(url.search, "")):{
            const username = decodeURIComponent(url.pathname.split("/").at(-1) as string)
            const userdata = await this.#get(["users", username]) as user
            if (!userdata)
              return this.#json({error:StatusText[Status.NotFound]}, {status: Status.NotFound})
            switch (request.method) {
              case "DELETE":{
                this.#authorize(user, {grant_admin:user?.username !== username})
                if (await this.#get(["settings", "root"]) === username)
                  return this.#json({error:"This user cannot be deleted"}, {status:Status.NotAcceptable})
                await this.#delete(log, ["users", username])
                return this.#json({})
              }
              case "PUT":{
                this.#authorize(user, {grant_admin:user?.username !== username})
                const {password, grant_admin, grant_automation, grant_data} = await this.#check(request, {
                  username: is.string().min(1).max(64), // Read-only
                  password: is.union([is.string().min(12).max(255), is.string().min(0).max(0)]).optional(),
                  grant_admin: is.boolean().optional(), // Read-only if not admin
                  grant_automation: is.boolean().optional(), // Read-only if not admin
                  grant_data: is.boolean().optional(), // Read-only if not admin
                  logged: is.string().nullable(), // Read-only
                })
                if (password) {
                  log.info("changing user password")
                  userdata.password = await this.#hash(password)
                }
                if ((user?.grant_admin)&&(await this.#get(["settings", "root"]) !== username)) {
                  log.info("changing user grants")
                  userdata.grant_admin = grant_admin ?? userdata.grant_admin
                  userdata.grant_automation = grant_automation ?? userdata.grant_automation
                  userdata.grant_data = grant_data ?? userdata.grant_data
                }
                await this.#set(log, ["users", username], {...userdata} as user)
              }
              case "GET":{
                this.#authorize(user, {grant_admin:user?.username !== username})
                delete (user as rw).password
                return this.#json(user)
              }
              default:
                return this.#unsupported()
            }
          }
          // Automation targets
          case new URLPattern("/api/automation/targets", url.origin).test(url.href.replace(url.search, "")):
            switch (request.method) {
              case "POST": {
                this.#authorize(user, {grant_automation:true})
                const {name, icon, module, disabled} = await this.#check(request, {
                  name: is.string().min(1).max(64),
                  icon: is.string().max(32),
                  module: is.string().min(1).max(255),
                  disabled: is.boolean().default(false),
                })
                if (await this.#get(["automation", "targets", module]))
                  return this.#json({error:StatusText[Status.Conflict]}, {status: Status.Conflict})
                await this.#set(log, ["automation", "targets", module], {name, icon, module, disabled} as automation_target)
              }
              case "GET":{
                //TODO
                this.#authorize(user, {})
                return this.#json((await Array.fromAsync(this.#kv.list({prefix:["automation", "targets"]}))).map((({value}) => value)))
              }
              default:
                return this.#unsupported()
            }
            case new URLPattern("/api/automation/targets/:module", url.origin).test(url.href.replace(url.search, "")):{
              const module = decodeURIComponent(url.pathname.split("/").at(-1) as string)
              const targetdata = await this.#get(["automation", "targets", module]) as automation_target
              if (!targetdata)
                return this.#json({error:StatusText[Status.NotFound]}, {status: Status.NotFound})
              switch (request.method) {
                case "DELETE":{
                  this.#authorize(user, {grant_automation:true})
                  await this.#delete(log, ["automation", "targets", module])
                  return this.#json({})
                }
                case "PUT":{
                  this.#authorize(user, {grant_automation:true})
                  const {name, icon, disabled} = await this.#check(request, {
                    name: is.string().min(1).max(64),
                    icon: is.string().max(32),
                    module: is.string().min(1).max(255), // Read-only
                    disabled: is.boolean().default(false),
                  })
                  await this.#set(log, ["automation", "targets", module], {...targetdata, name, icon, disabled} as automation_target)
                }
                case "GET":{
                  //TODO
                  this.#authorize(user, {})
                  return this.#json(targetdata)
                }
                default:
                  return this.#unsupported()
              }
            }
            // Automation rules
            case new URLPattern("/api/automation/rules", url.origin).test(url.href.replace(url.search, "")):
              switch (request.method) {
                case "POST": {
                  this.#authorize(user, {grant_automation:true})
                  const {name, target, priority, action, duration, conditions} = await this.#check(request, {
                    name: is.string().min(1).max(64),
                    hits: is.number(), // Read-only
                    last_hit: is.string().nullable(), // Read-only
                    target: is.string().min(1).max(64),
                    priority: is.coerce.number().min(0),
                    action: is.enum(["on", "off"]),
                    duration: is.coerce.number().min(0),
                    conditions: is.array(is.object({
                      data: is.string().min(0).max(64),
                      operator: is.enum(["==", "!=", ">", ">=", "<", "<="]),
                      value: is.union([is.string(), is.coerce.number()]),
                      delta: is.coerce.number(),
                    })).min(1),
                  })
                  if (await this.#get(["automation", "rules", name]))
                    return this.#json({error:StatusText[Status.Conflict]}, {status: Status.Conflict})
                  await this.#set(log, ["automation", "rules", name], {name, target, priority, action, duration, conditions, hits:0, last_hit:null} as automation_rule)
                }
                case "GET":{
                  //TODO
                  this.#authorize(user, {})
                  return this.#json((await Array.fromAsync(this.#kv.list({prefix:["automation", "rules"]}))).map((({value}) => value)).sort((a, b) => (b as automation_rule).priority - (a as automation_rule).priority))
                }
                default:
                  return this.#unsupported()
              }
            case new URLPattern("/api/automation/rules/:rule", url.origin).test(url.href.replace(url.search, "")):{
              const rule = decodeURIComponent(url.pathname.split("/").at(-1) as string)
              const ruledata = await this.#get(["automation", "rules", rule]) as automation_rule
              if (!ruledata)
                return this.#json({error:StatusText[Status.NotFound]}, {status: Status.NotFound})
              switch (request.method) {
                case "DELETE":{
                  this.#authorize(user, {grant_automation:true})
                  await this.#delete(log, ["automation", "rules", rule])
                  return this.#json({})
                }
                case "PUT":{
                  this.#authorize(user, {grant_automation:true})
                  const {target, priority, action, duration, conditions} = await this.#check(request, {
                    name: is.string().min(1).max(64), // Read-only
                    hits: is.number(), // Read-only
                    last_hit: is.string().nullable(), // Read-only
                    target: is.string().min(1).max(64),
                    priority: is.coerce.number().min(0),
                    action: is.enum(["on", "off"]),
                    duration: is.coerce.number().min(0),
                    conditions: is.array(is.object({
                      data: is.string().min(0).max(64),
                      operator: is.enum(["==", "!=", ">", ">=", "<", "<="]),
                      value: is.union([is.string(), is.coerce.number()]),
                      delta: is.coerce.number(),
                    })).min(1),
                  })
                  await this.#set(log, ["automation", "rules", rule], {...ruledata, target, priority, action, duration, conditions} as automation_rule)
                }
                case "GET":{
                  //TODO
                  this.#authorize(user, {})
                  return this.#json(ruledata)
                }
                default:
                  return this.#unsupported()
              }
            }












            case new URLPattern("/api/pictures", url.origin).test(url.href.replace(url.search, "")):
              switch (request.method) {
                case "POST": {
                  this.#authorize(user, null)

                  const file = `${new Date().toISOString()}.png`
                  await fetch(`${await this.#get(["settings", "camera", "url"])}`)
                    .then(response => response.bytes())
                    .then(async bytes => Deno.writeFile(`${await this.#get(["settings", "camera", "storage"])}/${file}`, bytes))
                  return this.#json({file})


                }
                case "GET":{
                  this.#authorize(user, null)
                  try {
                    return await fetch(`${await this.#get(["settings", "camera", "url"])}`)
                  }
                  catch {
                    return new Response(null, {status:Status.NotFound})
                  }
                }
                default:
                  return this.#unsupported()
              }


          case new URLPattern("/api/overview", url.origin).test(url.href.replace(url.search, "")):
            switch (request.method) {
              case "GET": {
                //TODO
                this.#authorize(user, {})

                const targets = (await Array.fromAsync(this.#kv.list({prefix:["automation", "targets"]}))).map((({value}) => value)) as automation_target[]
                const tapo = await this.#get(["settings", "tapo", "modules"]) as {name:string, mac:string}[]
                targets.forEach(target => {
                  const plug = tapo.find(({mac}) => target.module === mac)
                  if (plug)
                    Object.assign(target, {module_hint:plug.name})
                })

                return this.#json({targets})



              }
              default:
                return this.#unsupported()
            }


          // Data and graphs
          case new URLPattern("/api/data", url.origin).test(url.href.replace(url.search, "")):
            switch (request.method) {
              case "PUT":{
                this.#authorize(user, {grant_data:true})
                const {t} = await this.#check(request, {
                  t: is.coerce.date()
                })
                await this.#netatmo_data(log, t)
              }
              case "GET":{
                // TODO
                this.#authorize(user, {})
                const {from, to} = await this.#check(request, {
                  from: is.coerce.date().default(() => new Date()),
                  to: is.coerce.date().default(() => new Date()),
                }, {type:"search"})
                return this.#json(await this.#data(log, from, to))
              }
              default:
                return this.#unsupported()
            }
          // Camera
          case new URLPattern("/camera", url.origin).test(url.href.replace(url.search, "")):
            switch (request.method) {
              case "GET":{
                try {
                  // TODO
                  this.#authorize(user, {})
                  return await fetch(`${await this.#get(["settings", "camera", "url"])}`)
                }
                catch {
                  return serveFile(request, fromFileUrl(import.meta.resolve("../client/camera_offline.png")))
                }
              }
              default:
                return this.#unsupported()
            }
          // Login
          case new URLPattern("/login", url.origin).test(url.href.replace(url.search, "")):
            switch (request.method) {
              case "POST":{
                if (session) {
                  return this.#session_restore(log, session)
                }
                const {username, password} = await this.#check(request, {
                  username: is.string(),
                  password: is.string(),
                  grants: is.union([is.array(is.string()), is.string().transform((value) => value.split(",").map((value) => value.trim()))]), // Read-only
                  logged: is.string().nullable(), // Read-only
                })
                return this.#login(log, {username, password})
              }
              default:
                return this.#unsupported()
            }
          // Logout
          case new URLPattern("/logout", url.origin).test(url.href.replace(url.search, "")):
            switch (request.method) {
              case "POST":
                return this.#logout(log, session)
              default:
                return this.#unsupported()
            }
          // Setup
          case new URLPattern("/setup", url.origin).test(url.href.replace(url.search, "")):
            if (await this.#get(["status"]))
              return this.#json({error:StatusText[Status.NotFound]}, {status: Status.NotFound})
            log = log.with({setup:true})
            switch (request.method) {
              case "POST": {
                const {instance_name, admin_username:username, admin_password:password} = await this.#check(request, {
                  instance_name: is.string().min(1).max(255),
                  admin_username: is.string().min(1).max(64),
                  admin_password: is.string().min(12).max(255),
                })
                await this.#set(log, ["settings", "meta", "instance_name"], instance_name)
                log.info("set instance name", instance_name)
                await this.#set(log, ["users", username], {username, password:await this.#hash(password), grant_admin:true, grant_automation:true, grant_data:true, logged:null} as user)
                await this.#set(log, ["settings", "root"], username)
                log.info("created admin user", username)
                await this.#set(log, ["status"], "configured")
                log.info("server configured")
                return this.#login(log, {username, password})
              }
              default:
                return this.#unsupported()
            }
          // Static files
          default:
            return serveDir(request, {
              fsRoot: fromFileUrl(new URL(import.meta.resolve("../client"))),
              quiet: true,
            })
        }
      }
      catch(error) {
        if (error instanceof Response) {
          return error
        }
        if (error instanceof is.ZodError) {
          return this.#json({error: error.errors.map(({path, message}) => `${path.join(".")}: ${message}`).join("\n")}, {status: Status.BadRequest})
        }
        log.error(error)
        return this.#json({error: error.message}, {status: Status.InternalServerError})
      }
    })
  }

  // ===================================================================================================================

  /** Read Key-value store entry. */
  async #get<T>(key:Deno.KvKey) {
    const {value} = await this.#kv.get<T>(key)
    return value
  }

  /** Write Key-value store entry. */
  async #set<T>(log:Logger, key:Deno.KvKey, value:T) {
    await this.#kv.set(key, value)
    log.log("kv-store write", key, value)
  }

  /** Delete Key-value store entry. */
  async #delete(log:Logger, key:Deno.KvKey) {
    await this.#kv.delete(key)
    log.log("kv-store delete", key)
  }

  // ===================================================================================================================

  /** Hash text. */
  async #hash(text:string) {
    return encodeHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))
  }

  // ===================================================================================================================

  /** Authorize user request against grants. */
  #authorize(user:Nullable<user>, grants:Nullable<Partial<Pick<user, "grant_admin" | "grant_automation" | "grant_data">>>) {
    if (grants === null)
      return
    if (!user)
      throw this.#json({error:StatusText[Status.Unauthorized]}, {status:Status.Unauthorized})
    if (user.grant_admin)
      return
    for (const grant in grants) {
      if ((grants[grant as keyof typeof grants])&&(!user[grant as keyof typeof grants]))
        throw this.#json({error:StatusText[Status.Forbidden]}, {status:Status.Forbidden})
    }
  }

  /** Parse and validate user JSON request. */
  async #check<T extends is.ZodRawShape>(request:Request, shape:T, {type = "json" as "search"|"json"} = {}) {
    const data = type === "json" ? await request.json() : Object.fromEntries(new URL(request.url).searchParams.entries())
    return is.object(shape).strict().parseAsync(data)
  }

  /** Serve JSON response. */
  #json(data:unknown, {status = Status.OK as number, cookie = undefined as Cookie|undefined} = {}) {
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "max-age=0, no-cache, must-revalidate, proxy-revalidate",
    })
    if (cookie) {
      setCookie(headers, cookie)
    }
    return new Response(JSON.stringify(data), {status, headers})
  }

  /** Unsupported method. */
  #unsupported() {
    return this.#json({error:StatusText[Status.MethodNotAllowed]}, {status: Status.MethodNotAllowed})
  }

  // ===================================================================================================================

  /** Lookup user session. */
  async #session(_:Logger, session:Nullable<string>) {
    if (!session)
      throw this.#json({error:StatusText[Status.Unauthorized]}, {status: Status.Unauthorized})
    const username = await this.#get<string>(["sessions", session])
    if (!username)
      throw this.#json({error:StatusText[Status.Unauthorized]}, {status: Status.Unauthorized})
    const user = await this.#get(["users", username])
    if (!user)
      throw this.#json({error:StatusText[Status.Unauthorized]}, {status: Status.Unauthorized})
    return user as user
  }

  /** Restore session. */
  async #session_restore(log:Logger, session:string) {
    const {username, password, ...user} = await this.#session(log, session)
    await this.#set(log, ["users", username], {username, ...user, password, logged:new Date().toISOString().slice(0, 16)} as user)
    log.with({username}).debug("session restored")
    return this.#json({username, ...user})
  }

  /** Login user. */
  async #login(log:Logger, {username, password}:{username:string, password:string}) {
    log = log.with({username}).debug("login...")
    const {password:hashed, ...user} = (await this.#get(["users", username]) ?? {}) as {password:string} & record
    if ((!user.username)||(await this.#hash(password) !== hashed)) {
      log.warn("login failed: invalid credentials")
      return this.#json({error:StatusText[Status.Unauthorized]}, {status: Status.Unauthorized})
    }
    const session = `${crypto.randomUUID()}${crypto.randomUUID()}`
    await this.#set(log, ["sessions", session], username)
    await this.#set(log, ["users", username], {...user, password:hashed, logged:new Date().toISOString().slice(0, 16)} as user)
    log.with({session:session.slice(0, 8)}).info("login success")
    return this.#json(user, {cookie:{name:"gardenia_session", value:session, path:"/"}})
  }

  /** Logout user. */
  async #logout(log:Logger, session:string) {
    const {username} = await this.#session(log, session)
    await this.#delete(log, ["sessions", session])
    log.with({username}).debug("session killed")
    return this.#json({}, {status: Status.OK, cookie:{name:"gardenia_session", value:"", path:"/", maxAge:0}})
  }

  // ===================================================================================================================

  /** Refresh Netatmo token. */
  async #netatmo(log:Logger) {
    log.debug("netatmo token refreshing...")
    const headers = new Headers({"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"})
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: await this.#get(["settings", "netatmo", "client_id"]) ?? "",
      client_secret: await this.#get(["settings", "netatmo", "client_secret"]) ?? "",
      refresh_token: await this.#get(["settings", "netatmo", "refresh_token"]) ?? "",
    }).toString()
    const response = await fetch("https://api.netatmo.com/oauth2/token", {method:"POST", headers, body}).then((response) => response.json())
    const {access_token, refresh_token, expires_in} = response
    if (!access_token) {
      log.error("netatmo token refresh failed", response)
      throw new Error(`Failed to refresh Netatmo token: ${JSON.stringify(response)}`)
    }
    const expiration = Date.now() + expires_in * 1000
    await this.#set(log, ["settings", "netatmo", "refresh_token"], refresh_token)
    await this.#set(log, ["settings", "netatmo", "access_token"], access_token)
    await this.#set(log, ["settings", "netatmo", "access_token_expiration"], expiration)
    log.with({expiration}).info("netatmo token refreshed")
  }

  /** Netatmo data per module enum. */
  private readonly netatmo_data = {
    station: {
      id: "NAMain",
      data: ["temperature", "humidity", "co2", "pressure", "noise"],
      suffix: ""
    },
    module: {
      id:"NAModule1",
      data: ["temperature", "humidity"],
      suffix: "_out"
    },
    wind: {
      id: "NAModule2",
      data: ["windstrength", "windangle", "guststrength", "gustangle"],
      suffix: ""
    },
    rain: {
      id: "NAModule3",
      data: ["rain"],
      suffix: ""
    },
  } as const

  /** Fetch station data from Netamot API. */
  async #netatmo_station(log:Logger) {
    log.debug("netatmo station loading...")
    const token = `${await this.#get(["settings", "netatmo", "access_token"]) ?? ""}`
    const headers = new Headers({Accept: "application/json", Authorization: `Bearer ${token}`})
    const { body, error } = await fetch(`https://api.netatmo.com/api/getstationsdata`, { headers}).then((response) => response.json())
    if (error) {
      log.error("netatmo station loading failed", error)
      throw new Error(`Failed to load Netatmo station: ${error?.message ?? ""}`)
    }
    assertEquals(body.devices.length, 1, "Only one Netatmo station at a time is supported")
    type module = {_id:string, type:string, battery_percent:number, last_message:number, last_status_store:number}
    const {devices:[device], user} = body
    const station = {mac:device._id, type:"station", battery:100, updated:new Date(body.devices[0].last_status_store * 1000).toISOString().slice(0, 16)}
    const modules = device.modules.map(({_id:mac, type:module, battery_percent:battery, last_message:updated}:module) => ({mac, type:Object.entries(this.netatmo_data).find(([_, {id}]) => module === id)?.[0] ?? null, battery, updated: new Date(updated * 1000).toISOString().slice(0, 16)}))
    await this.#set(log, ["settings", "netatmo", "modules"], [station, ...modules])
    await this.#set(log, ["settings", "netatmo", "user_mail"], user.mail)
    log.with({station:station.mac}).info("netatmo station loaded")
  }

  /** Fetch weather data from Netatmo API. */
  async #netatmo_data(log:Logger, t = new Date() as ConstructorParameters<typeof Date>[0]) {
    const token = `${await this.#get(["settings", "netatmo", "access_token"]) ?? ""}`
    const headers = new Headers({Accept: "application/json", Authorization: `Bearer ${token}`})
    const modules = await this.#get(["settings", "netatmo", "modules"]) as {mac:string, type:keyof Server["netatmo_data"]}[]
    if (!modules.length) {
      log.warn("netatmo data fetching skipped: no modules (call #netatmo_station first)")
      return
    }
    const [station] = modules
    const date = new Date(t)
    date.setMinutes(date.getMinutes() - 30)
    log = log.with({station:station.mac, t: Math.floor(date.getTime()/1000)})
    log.debug("netatmo data fetching...")
    const errors = []
    for (const module of modules) {
      log.with({module:module.type}).debug("netatmo data fetching...")
      const search = new URLSearchParams({
        device_id: station.mac,
        scale: "30min",
        optimize: "false",
        date_begin: `${Math.floor(date.getTime() / 1000)}`,
        type: this.netatmo_data[module.type].data.join(","),
      })
      if (module.type !== "station")
        search.set("module_id", module.mac)
      const { body, error } = await fetch(`https://api.netatmo.com/api/getmeasure?${search}`, { headers }).then((response) => response.json())
      if (error) {
        log.error("netatmo data fetching failed", error)
        errors.push(new Error(`Failed to load Netatmo ${module.type}[${module.mac}] data: ${error?.message ?? ""}`))
        continue
      }
      for (const [t, values] of Object.entries(body) as Array<[string, Array<Nullable<number>>]>) {
        const timestamp = new Date(Number(t) * 1000).getTime()
        const data = Object.fromEntries(this.netatmo_data[module.type].data.map((name, i) => [`${name}${this.netatmo_data[module.type].suffix}`, values[i]]))
        await this.#set(log, ["data", timestamp], deepMerge(await this.#get(["data", timestamp]) ?? {}, data))
      }
    }
    if (errors.length) {
      throw new Error(errors.map(({message}) => message).join("\n"))
    }
  }

  // ===================================================================================================================

  /** Data graphs configuration. */
  private readonly data_graphs = {
    temperature: {
      type: "line",
      color: ["#da3633", "#301a1f40"],
      scale:{ min: -40, max: 65, unit: "°C" },
    },
    temperature_out: {
      type: "line",
      color: ["#e09b13", "#2a211140"],
      scale:{ min: -40, max: 65, unit: "°C" },
    },
    humidity: {
      type: "line",
      color: ["#1f6feb", "#121d2f40"],
      scale: { min: 0, max: 100, unit: "%" },
    },
    humidity_out: {
      type: "line",
      color: ["#b87fff", "#1c182840"],
      scale: { min: 0, max: 100, unit: "%" },
    },
    co2: {
      type: "line",
      color: ["#6e7681", "#161b2240"],
      scale:{ min: 0, max: 5000, unit: "ppm" },
    },
    pressure: {
      type: "line",
      color: ["#bf4b8a", "#22192640"],
      scale:{ min: 260, max: 1160, unit: "mbar" },
    },
    noise: {
      type: "line",
      color: ["#ef6eb1", "#21162040"],
      scale:{ min: 35, max: 120, unit: "dB" },
    },
    rain: {
      type: "line",
      color: ["#8957e5", "#1d1b2e40"],
      scale:{ min: 0, max: 150, unit: "mm/h" },
    },
    windstrength: {
      type: "line",
      color: ["#238636", "#12261e40"],
      scale:{ min: 0, max: 45, unit: "m/s" },
    },
    guststrength: {
      type: "line",
      color: ["#09b43a", "#0a251740"],
      scale:{ min: 0, max: 45, unit: "m/s" },
    },
    windangle: {
      type: "polarArea",
      color: ["#238636", "#12261e40"],
      scale:{ min: 0, max: 360, unit: "°" },
    },
    gustangle: {
      type: "polarArea",
      color: ["#09b43a", "#0a251740"],
      scale:{ min: 0, max: 360, unit: "°" },
    },
    illuminance: {
      type: "line",
      color: ["#9e6a03", "#27211540"],
      scale:{ min: 1, max: 65535, unit: "lux" },
    },
  }

  /** Prepare and format data. */
  async #data(log:Logger, from:Date, to:Date) {
    from.setHours(0, 0, 0, 0)
    to.setHours(23, 59, 59, 999)
    log = log.with({from:from.toISOString().slice(0, 16), to:to.toISOString().slice(0, 16)}).debug("data loading...")
    const data = await Array.fromAsync(this.#kv.list<record<Nullable<number>>>({start:["data", from.getTime()], end:["data", to.getTime()]}))
    const values = data.map(({value}) => value)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const result = {
      time: Date.now(),
      range: {timezone, from: from.toISOString(), to: to.toISOString()},
      data: {} as record<{current:number, min:number, max:number, trend:Nullable<"up"|"down"|"stable">, unit:string, graph_type:string, graph:Nullable<{labels:string[], datasets:record[], min:number, max:number}>}>
    }
    for (const key of Object.keys(this.data_graphs) as Array<keyof typeof this.data_graphs>) {
      const previous = values.at(0)?.[key] ?? NaN
      const current = values.at(-1)?.[key] ?? NaN
      const min = values.reduce((min, value) => Math.min(min, value[key] ?? Infinity), Infinity)
      const max = values.reduce((max, value) => Math.max(max, value[key] ?? -Infinity), -Infinity)
      const trend = current > previous ? "up" : current < previous ? "down" : "stable"
      const [borderColor, backgroundColor] = this.data_graphs[key].color
      result.data[key] = {current, min, max, trend, unit:this.data_graphs[key].scale.unit, graph_type:this.data_graphs[key].type, graph: null}
      {
        const values = data.map(({ key: [_, date], value }) => [date, value[key]]).filter(([, value]) => Number.isFinite(value))
        if (values.length) {
          const labels = values.map(([date]) => new Date(date as string).toISOString())
          const datasets = [{label: key, data: values.map(([, value]) => value), borderColor, backgroundColor, fill: true}]
          if (/^(wind|gust)angle$/.test(key)) {
            result.data[key].trend = null
            labels.length = 0
            const values = datasets[0].data as number[]
            datasets[0].data = new Array(360).fill(0)
            values.forEach(value => (datasets[0].data[value] as number)++)
          }
          if (/_out$/.test(key)) {
            result.data[key.replace("_out", "")].graph?.datasets.push(...datasets)
            continue
          }
          if (/^gust(strength|angle)$/.test(key)) {
            result.data[key.replace("gust", "wind")].graph?.datasets.push(...datasets)
            continue
          }
          result.data[key].graph = {labels, datasets, ...this.data_graphs[key].scale}
          delete (result.data[key].graph as rw).unit
        }
      }
    }
    log.debug("data loaded")
    return result
  }

  // ===================================================================================================================

  /** Authenticate user and create a new Tapo session. */
  async #tapo(log:Logger) {
    log.debug("tapo token refreshing...")
    const {token} = await this.#tapo_api(log, {
      method: "login",
      params: {
        appType: "Tapo_Ios",
        cloudUserName: await this.#get(["settings", "tapo", "username"]),
        cloudPassword: await this.#get(["settings", "tapo", "password"]),
        terminalUUID: await this.#get(["settings", "tapo", "uuid"]),
      }
    }, {token:false})
    await this.#set(log, ["settings", "tapo", "token"], token)
    log.info("tapo token refreshed")
  }

  /** Execute Tapo API call. */
  async #tapo_api(log:Logger, body:{method:string} & record, {method = "POST", token = true} = {}) {
    let api = await this.#get(["settings", "tapo", "api"]) as string
    if (token)
      api += `?token=${await this.#get(["settings", "tapo", "token"]) as string}`
    log = log.with({api, token, method, endpoint:body.method}).debug("tapo api call")
    const params = {method} as Arg<typeof fetch, 1, true>
    if (body)
      params.body = JSON.stringify(body)
    const {error_code:code, msg:error, result} = await fetch(api, params).then(response => response.json())
    if (code) {
      log.error("tapo api call failed", code, error)
      throw new Error(`Tapo API Error ${code}: ${error}`)
    }
    log.with({result}).debug("tapo api call success")
    return result
  }

  /** Fetch Tapo devices. */
  async #tapo_devices(log:Logger) {
    log.debug("tapo devices loading...")
    const {deviceList:devices} = await this.#tapo_api(log, {method: "getDeviceList"})
    const modules = devices
      .map(({alias, fwVer:firmware, deviceModel:model, deviceMac:mac}:record<string>) => ({name:atob(alias), model, firmware, mac:mac.split(/(..)/).filter(byte => byte).join(":").toLowerCase()}))
      .sort((a:record<string>, b:record<string>) => a.name.localeCompare(b.name))
    await this.#set(log, ["settings", "tapo", "modules"], modules)
    log.info("tapo devices loaded")
  }

}

if (import.meta.main) {
  const server = new Server()
  server.serve()
}
