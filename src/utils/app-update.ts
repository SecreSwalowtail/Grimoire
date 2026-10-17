import Constants from 'expo-constants'

// New versions are published as GitHub Releases, tagged like "v1.2.0", with the APK attached.
const LATEST_RELEASE = 'https://api.github.com/repos/SecreSwalowtail/Grimoire/releases/latest'

export type AppUpdate = {
  version: string
  notes: string
  // The APK itself, or the release page when no APK is attached.
  url: string
}

// "v1.10.0" → [1, 10, 0]
function parts(version: string) {
  return version.replace(/^v/i, '').split('.').map((p) => parseInt(p, 10) || 0)
}

function isNewer(latest: string, current: string) {
  const a = parts(latest)
  const b = parts(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

// Release notes are Markdown: drop the heading, emphasis and link syntax so they read as text.
function plainNotes(markdown: string) {
  return markdown
    .replace(/\r/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim()
}

// The latest release when it's newer than the installed app, otherwise null. Offline or
// rate-limited, the check is skipped until the next launch.
export async function checkForAppUpdate(): Promise<AppUpdate | null> {
  try {
    const res = await fetch(LATEST_RELEASE, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) throw new Error(`Latest release: ${res.status}`)
    const release = (await res.json()) as {
      tag_name: string
      body: string | null
      html_url: string
      assets: { name: string; browser_download_url: string }[]
    }
    const current = Constants.expoConfig?.version ?? '0.0.0'
    if (!isNewer(release.tag_name, current)) return null
    const apk = release.assets.find((a) => a.name.toLowerCase().endsWith('.apk'))
    return {
      version: release.tag_name.replace(/^v/i, ''),
      notes: plainNotes(release.body ?? ''),
      url: apk?.browser_download_url ?? release.html_url,
    }
  } catch (e) {
    console.warn('Checking for an app update failed', e)
    return null
  }
}
