/** Init app */
const lang = {}
globalThis.initApp = async function initApp(_meta, _lang) {
  Object.assign(
    _lang,
    await fetch("/lang").then((response) => response.json()),
  )
  Object.assign(
    _meta,
    await fetch("/api/meta").then((response) => response.json()),
  )
  Object.assign(lang, _lang)
}

// Charts
Chart.defaults.color = "#fff"
const charts = {}

/** Update graphs */
function updateGraphs(_data) {
  document.querySelectorAll("[data-graph]").forEach((graph) => {
    const type = graph.dataset.graph
    const { labels = [], datasets = [] } = _data.stats?.[type]?.graph ?? {}
    if (!charts[type]) {
      charts[type] = new Chart(
        document.querySelector(`[data-graph="${type}"]`),
        {
          type: type.endsWith("angle") ? "polarArea" : "line",
          data: {
            labels,
            datasets,
          },
          options: {
            responsive: true,
            plugins: {
              legend: { display: true, position: "bottom" },
            },
            scales: {
              x: {
                ticks: {
                  callback(_, i) {
                    const t = new Date(labels[i])
                    try {
                      return [
                        new Intl.DateTimeFormat("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                        }).format(t),
                        new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" })
                          .format(t),
                      ]
                    } catch {
                      return ""
                    }
                  },
                },
              },
              r: {
                ticks: {
                  display: false,
                },
              },
            },
          },
        },
      )
    } else {
      charts[type].data.labels = labels
      charts[type].data.datasets = datasets
      charts[type].update()
    }
  })
}

/** Fetch stats */
globalThis.getStats = async function getStats(_data) {
  const from = document.querySelector('input[name="range_from"]')?.value
  const to = document.querySelector('input[name="range_to"]')?.value
  const search = new URLSearchParams()
  if (from) {
    search.append("from", from)
  }
  if (to) {
    search.append("to", to)
  }
  _data.stats = await fetch(`/api/stats?${search}`).then((response) => response.json())
  updateGraphs(_data)
}

/** Fetch refresh data */
async function getRefresh(_data) {
  _data.refresh = await fetch("/api/refresh").then((response) => response.json())
}

/** Fetch system config */
async function getSystem(_data) {
  _data.system = await fetch("/api/system").then((response) => response.json())
  if (_data.user.role?.admin || _data.user.role?.system) {
    _data.modules = await fetch("/api/modules").then((response) => response.json())
  }
}

/** Fetch actions */
async function getActions(_data) {
  _data.actions = await fetch("/api/actions").then((response) => response.json())
}

/** Fetch users */
async function getUsers(_data) {
  if (_data.user.role?.admin || _data.user.role?.users) {
    _data.users = await fetch("/api/users").then((response) => response.json())
  }
}

/** Fetch history */
async function getHistory(_data) {
  const search = new URLSearchParams({ page: _data.history_page || 0 })
  _data.history = await fetch(`/api/history?${search}`).then((response) => response.json())
}

/** Fetch pictures */
async function getPictures(_data) {
  _data.pictures = await fetch("/api/pictures").then((response) => response.json())
}

/** Fetch history page */
globalThis.getHistoryPage = function getHistoryPage(_data, page = 0) {
  _data.history_page = Math.max(0, Math.min(_data.history.length, page || 0))
  refresh(_data, { history: true })
}

/** Create new user */
globalThis.createUser = function createUser(_data, _user) {
  return api({
    section: "users",
    method: "POST",
    route: "/api/users",
    _data,
    body: _user,
    success() {
      Object.assign(_user, {
        username: "",
        password: "",
        role: { admin: false, users: false, actions: false },
      })
      refresh(_data, { users: true, history: true })
    },
  })
}

/** Delete user */
globalThis.deleteUser = function deleteUser(_data, _user) {
  return api({
    section: "users",
    method: "DELETE",
    route: "/api/users",
    _data,
    body: _user,
    success() {
      refresh(_data, { users: true, history: true })
    },
  })
}

/** Update user */
globalThis.updateUser = function updateUser(_data, _user, section = "users") {
  return api({
    section,
    method: "PATCH",
    route: "/api/users",
    _data,
    body: _user,
    success() {
      refresh(_data, { users: true, history: true })
    },
  })
}

/** Update action */
globalThis.updateAction = function updateAction(_data, _action) {
  return api({
    section: "actions",
    method: "PATCH",
    route: "/api/actions",
    _data,
    body: _action,
    success() {
      refresh(_data, { actions: true, history: true })
    },
  })
}

/** Update action conditions */
globalThis.updateActionCondition = function updateActionCondition(
  _data,
  _body,
) {
  return api({
    section: `conditions_${_body.target}`,
    method: "PATCH",
    route: "/api/actions/conditions",
    _data,
    body: _body,
    success() {
      refresh(_data, { actions: true, history: true })
    },
  })
}

/** Update system */
globalThis.updateSystem = function updateSystem(_data) {
  return api({
    section: "system",
    method: "PATCH",
    route: "/api/system",
    _data,
    body: _data.system,
    success() {
      refresh(_data, { system: true })
    },
  })
}

/** Exit seervice */
globalThis.exitService = function exitService(_data) {
  return api({
    section: "system",
    method: "DELETE",
    route: "/api/system/exit",
    _data,
    success() {
      refresh(_data, { system: true })
    },
  })
}

/** User login */
globalThis.login = function login(_data, { auto = false } = {}) {
  const username = document.querySelector('input[name="username"]')?.value
  const password = document.querySelector('input[name="password"]')?.value
  return api({
    section: !auto ? "login" : "",
    method: "POST",
    route: "/login",
    _data,
    body: { username, password },
    error() {
      document.cookie = "gardenia_session=; SameSite=Lax; expires=Thu, 01 Jan 1970 00:00:01 GMT"
    },
    success({ session, user }) {
      document.cookie = `gardenia_session=${session}; SameSite=Lax`
      Object.assign(_data, { user })
      refresh(_data)
    },
  })
}

/** User logout */
globalThis.logout = function logout(_data) {
  return api({
    section: "login",
    method: "POST",
    route: "/logout",
    _data,
    success() {
      Object.assign(_data, { user: {}, users: [], history: [], stats: {} })
      refresh(_data)
    },
  })
}

/** Refresh data */
function refresh(
  _data,
  {
    refresh = true,
    pictures = true,
    actions = true,
    users = true,
    history = true,
    stats = true,
    system = true,
  } = {},
) {
  if (system) {
    getSystem(_data)
  }
  if (refresh) {
    getRefresh(_data)
  }
  if (pictures) {
    getPictures(_data)
  }
  if (actions) {
    getActions(_data)
  }
  if (users) {
    getUsers(_data)
  }
  if (history) {
    getHistory(_data)
  }
  if (stats) {
    getStats(_data)
  }
}

/** API call */
async function api(
  { section, method = "GET", route, body = null, _data, ...on },
) {
  try {
    const { success, error, ...data } = await fetch(route, {
      method,
      body: JSON.stringify(body),
    }).then((response) => response.json())
    if (success) {
      if (section) {
        _data.errors[section] = ""
        _data.success[section] = lang.done
        setTimeout(() => _data.success[section] = "", 4000)
      }
      on.success?.(data)
    }
    if (error) {
      if (section) {
        _data.errors[section] = error
        _data.success[section] = ""
        setTimeout(() => _data.errors[section] = "", 4000)
      }
      on.error?.()
    }
  } catch {
    if (section) {
      _data.errors[section] = lang.unknown_error
      _data.success[section] = ""
      setTimeout(() => _data.errors[section] = "", 4000)
    }
  }
}
