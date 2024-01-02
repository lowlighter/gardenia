// Imports
import { fetchNetatmoData, refreshNetatmoToken } from "./netatmo.ts"
import { checkActionsConditions } from "./actions.ts"

// Headers
const headers = new Headers({
  "Content-Type": "application/json",
  "Cache-Control": "max-age=0, no-cache, must-revalidate, proxy-revalidate",
})

/** Next refresh tick */
let tick = Date.now()

/** Refresh data and actions */
export async function refresh({ init = false } = {}) {
  console.log("refreshing data...")
  if (init) {
    await refreshNetatmoToken()
    await fetchNetatmoData(new Date(0))
  } else {
    await fetchNetatmoData()
  }
  await checkActionsConditions()
  tick += 30 * 60 * 1000
  setTimeout(refresh, 30 * 60 * 1000)
}

/** Get next refresh tick */
export function getNextRefresh(_: Request, __?: string) {
  return new Response(JSON.stringify({ tick }), { headers })
}
