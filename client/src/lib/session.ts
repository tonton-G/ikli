// Edit keys the user holds for links created/unlocked in this browser session.
// sessionStorage only — the key is shown once at creation; this just saves
// re-typing it while moving between the result, QR, and edit screens.

const PREFIX = 'ikli:key:'

export function rememberKey(slug: string, key: string): void {
  try {
    sessionStorage.setItem(PREFIX + slug, key)
  } catch {
    /* storage unavailable — user will retype the key */
  }
}

export function recallKey(slug: string): string | null {
  try {
    return sessionStorage.getItem(PREFIX + slug)
  } catch {
    return null
  }
}

export function forgetKey(slug: string): void {
  try {
    sessionStorage.removeItem(PREFIX + slug)
  } catch {
    /* ignore */
  }
}

export function moveKey(oldSlug: string, newSlug: string): void {
  const key = recallKey(oldSlug)
  if (key) {
    forgetKey(oldSlug)
    rememberKey(newSlug, key)
  }
}
