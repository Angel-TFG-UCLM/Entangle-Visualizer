const explicitlyOffline = import.meta.env.VITE_OFFLINE_MODE === 'true'
let offlineEnabled = explicitlyOffline || !import.meta.env.VITE_API_URL
let offlineReason = explicitlyOffline
  ? 'configured'
  : !import.meta.env.VITE_API_URL
    ? 'missing-api-url'
    : null

export function isOfflineMode() {
  return offlineEnabled
}

export function isExplicitOfflineMode() {
  return explicitlyOffline
}

export function getOfflineReason() {
  return offlineReason
}

export function enableOfflineMode(reason = 'backend-unavailable') {
  offlineEnabled = true
  offlineReason = reason
}

export function disableOfflineMode() {
  if (explicitlyOffline) return false
  offlineEnabled = false
  offlineReason = null
  return true
}
