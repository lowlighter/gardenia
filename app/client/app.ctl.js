;(async () => {
  const data = {
    lang: await fetch("/lang/fr").then((response) => response.json()),
    token: await fetch("/token").then((response) => response.json()),
    version: await fetch("/version").then((response) => response.text()),
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
      section.addEventListener("click", () => (clearTimeout(timeout), section.removeChild(flash)))
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
