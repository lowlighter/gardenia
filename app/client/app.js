;(async () => {
  Chart.defaults.color = "#fff"
  const status = await fetch("/api/status").then((response) => response.json())
  const charts = {}
  const data = {
    init() {
      this.$watch("tab", (value) => this.tick(value))
      if (this.status === "configured") {
        if (document.cookie.includes("gardenia_session=")) {
          this.api(null, "/login", {
            callback: (data) => {
              this.user = data
              this.tab = "home"
              this.refresh_users()
              this.refresh_settings()
              console.debug("session restored")
            },
            method: "POST",
          })
        } else {
          if (
            (!this.settings.visibility.public_camera) && (!this.settings.visibility.public_pictures) && (!this.settings.visibility.public_data) && (!this.settings.visibility.public_modules) &&
            (!this.settings.visibility.public_history)
          ) {
            this.tab = "login"
          } else {
            this.tab = "home"
          }
        }
        setInterval(() => this.tick(this.tab), 5 * 60 * 1000)
      } else if (this.status === "unconfigured") {
        this.tab = "setup"
      }
    },
    t: Date.now(),
    timeout: 0,
    tab: "",
    status,
    setup: {
      instance_name: "",
      admin_username: "",
      admin_password: "",
    },
    overview: {
      targets: [],
    },
    pictures: [],
    history: {
      page: 1,
      limit: 10,
      logs: "no",
      entries: [],
    },
    graphs: {
      range: {
        from: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().slice(0, 16),
        to: new Date().toISOString().slice(0, 16),
      },
      time: null,
      data: {},
    },
    user: {
      username: "",
      password: "",
      grant_admin: false,
      grant_automation: false,
      grant_data: false,
      logged: null,
    },
    users: [],
    automation: {
      targets: [],
      rules: [],
    },
    ping: await fetch("/ping/status").then((response) => response.json()),
    settings: {
      meta: await fetch("/api/settings/meta").then((response) => response.json()),
      visibility: await fetch("/api/settings/visibility").then((response) => response.json()),
      tickrate: {},
      control: {},
      control_test: {},
      camera: {},
      camera_test: {},
      netatmo: {},
      netatmo_modules: [],
      tapo: {},
      tapo_modules: [],
      notes: {},
    },
    lang: await fetch("/lang/fr").then((response) => response.json()),
    icons: await fetch("/icons").then((response) => response.json()),
    /** Tick refresh. */
    async tick(tab) {
      clearTimeout(this.timeout)
      this.t = Date.now()
      switch (tab) {
        case "user":
          await this.refresh_users()
          break
        case "automation":
          await this.refresh_automation()
          break
        case "settings":
          await this.refresh_settings()
          break
        case "home":
          await Promise.allSettled([
            this.refresh_graphs(null),
            this.refresh_overview(),
            this.refresh_pictures(),
            this.refresh_history(),
          ])
          break
      }
      if (tab) {
        await this.refresh_ping()
      }
      if (this.tab === "home") {
        for (const target of this.overview.targets) {
          if ((target.status === "on") && (target.status_details?.duration) && (target.status_details?.t2) && (this.t >= target.status_details.t2)) {
            await this.refresh_overview()
          }
        }
      } else {
        for (const [key, chart] of Object.entries(charts)) {
          chart.destroy()
          delete charts[key]
        }
      }
      this.timeout = setTimeout(() => this.tick(), 1000)
    },
    /** Format history */
    history_format(entry) {
      return (this.lang[`history_entry_${entry.action}`] ?? entry.action)
        .replace(/%%/g, entry.user)
        .replace(/%([\w_]+)/g, (_, key) => entry.details?.[key])
    },
    /** Refresh ping. */
    async refresh_ping() {
      this.ping = await fetch("/ping/status").then((response) => response.json())
    },
    /** Refresh overview. */
    async refresh_overview() {
      if ((this.user.grant_data) || (this.settings.visibility.public_modules)) {
        this.overview = await fetch("/api/overview").then((response) => response.json())
      }
    },
    /** Refresh pictures. */
    async refresh_pictures() {
      if ((this.user.grant_data) || (this.settings.visibility.public_pictures)) {
        this.pictures = await fetch("/api/pictures").then((response) => response.json())
      }
    },
    /** Refresh history. */
    async refresh_history() {
      if ((this.user) || (this.settings.visibility.public_history)) {
        const search = new URLSearchParams({ limit: this.history.limit, logs: this.history.logs })
        this.history.entries = await fetch(`/api/history/${this.history.page}?${search}`).then((response) => response.json())
      }
    },
    /** Refresh users list. */
    async refresh_users() {
      if (this.user.grant_admin) {
        this.users = await fetch("/api/users").then((response) => response.json())
      }
    },
    /** Refresh automation. */
    async refresh_automation() {
      if (this.user.grant_automation) {
        this.automation.targets = await fetch("/api/automation/targets").then((response) => response.json())
        this.automation.rules = await fetch("/api/automation/rules").then((response) => response.json())
      }
    },
    /** Refresh settings. */
    async refresh_settings() {
      if (this.user.grant_admin) {
        await Promise.allSettled([
          fetch("/api/settings/meta").then((response) => response.json()).then((data) => this.settings.meta = data),
          fetch("/api/settings/visibility").then((response) => response.json()).then((data) => this.settings.visibility = data),
          fetch("/api/settings/tickrate").then((response) => response.json()).then((data) => this.settings.tickrate = data),
          fetch("/api/settings/control").then((response) => response.json()).then((data) => this.settings.control = data),
          fetch("/api/settings/camera").then((response) => response.json()).then((data) => this.settings.camera = data),
          fetch("/api/settings/netatmo").then((response) => response.json()).then((data) => this.settings.netatmo = data),
          fetch("/api/settings/netatmo/modules").then((response) => response.json()).then((data) => this.settings.netatmo_modules = data),
          fetch("/api/settings/tapo").then((response) => response.json()).then((data) => this.settings.tapo = data),
          fetch("/api/settings/tapo/modules").then((response) => response.json()).then((data) => this.settings.tapo_modules = data),
          fetch("/api/settings/notes").then((response) => response.json()).then((data) => this.settings.notes = data),
          fetch("/api/settings/control/test").then((response) => response.json()).then((data) => this.settings.control_test = data),
          fetch("/api/settings/camera/test").then((response) => response.json()).then((data) => this.settings.camera_test = data),
        ])
      }
    },
    /** Refresh charts. */
    async refresh_graphs(event) {
      if ((!this.user.grant_data) && (!this.settings.visibility.public_data)) {
        return
      }
      const search = new URLSearchParams(this.graphs.range)
      const { time, data } = await this.api(event, `/api/data?${search}`, { flash: false, method: "GET" })
      this.graphs.data = data
      this.graphs.time = time
      while (true) {
        if (!Array.from(document.querySelectorAll("[data-graph]")).length) {
          await new Promise((resolve) => setTimeout(resolve, 250))
          continue
        }
        break
      }
      document.querySelectorAll("[data-graph]").forEach((graph) => {
        const name = graph.dataset.graph
        const { labels, datasets } = this.graphs.data[name].graph
        const { graph_type } = this.graphs.data[name]
        datasets.forEach((dataset) => dataset.label = this.lang[`data_${dataset.label}`]?.replaceAll(/<\/?.*?>/g, "") ?? "")
        if (charts[name]) {
          charts[name].data.labels = labels
          charts[name].data.datasets = datasets
          charts[name].update()
        } else {
          const color = {
            muted: getComputedStyle(graph).getPropertyValue("--muted"),
          }
          charts[name] = new Chart(graph, {
            type: graph_type,
            data: { labels, datasets },
            options: {
              response: true,
              plugins: { legend: { display: true, position: "bottom" } },
              scales: {
                r: {
                  display: graph_type === "polarArea",
                  grid: { color: color.muted },
                  ticks: { display: false },
                },
                y: {
                  display: graph_type === "line",
                  grid: { color: color.muted },
                },
                x: {
                  display: graph_type === "line",
                  grid: { color: color.muted },
                  ticks: {
                    callback(_, i) {
                      const t = new Date(labels[i])
                      try {
                        return [
                          new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(t),
                          new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" }).format(t),
                        ]
                      } catch {
                        return ""
                      }
                    },
                  },
                },
              },
            },
          })
        }
      })
    },
    /** Flash message. */
    flash(text, { type = "default" } = {}) {
      const section = document.querySelector("[data-flash]")
      const flash = document.createElement("div")
      flash.classList.add("flash", type)
      flash.innerText = text
      const timer = document.createElement("div")
      timer.classList.add("timer")
      flash.appendChild(timer)
      section.appendChild(flash)
      const timeout = setTimeout(() => section.removeChild(flash), 5000)
      section.addEventListener("click", () => {
        try {
          clearTimeout(timeout)
          section.removeChild(flash)
        } catch {
          // pass
        }
      })
    },
    /** API request. */
    async api(event, endpoint, { flash = true, callback = null, method = "PATCH", body } = {}) {
      event?.preventDefault()
      const button = event?.target
      let text = ""
      try {
        if (button) {
          text = button.innerText
          button.innerText = this.lang.api_update_pending
          button.disabled = true
        }
        const data = await fetch(endpoint, { method, body }).then((response) => response.json())
        await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500))
        if (data.error) {
          throw new Error(data.error)
        }
        if (flash) {
          this.flash(this.lang.api_update_success, { type: "success" })
        }
        if (callback) {
          callback(data)
        }
        return data
      } catch (error) {
        this.flash(`${this.lang.api_update_error}\n${error.message}`, { type: "danger" })
      } finally {
        if (button) {
          button.innerText = text
          button.disabled = false
        }
      }
    },
  }
  Alpine.data("app", () => data)
  Alpine.start()
})()
