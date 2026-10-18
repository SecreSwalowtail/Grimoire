import Constants from 'expo-constants'
import { Directory, File, Paths } from 'expo-file-system'
import * as IntentLauncher from 'expo-intent-launcher'
import { Platform } from 'react-native'

// New versions are published as GitHub Releases, tagged like "v1.2.0", with the APK attached.
const LATEST_RELEASE = 'https://api.github.com/repos/SecreSwalowtail/Grimoire/releases/latest'

export type AppUpdate = {
  version: string
  notes: string
  // The APK itself, or the release page when no APK is attached.
  url: string
  // Bytes of the APK (null: no APK, `url` is the release page).
  size: number | null
}

// Downloaded updates wait here until installed; the folder is emptied on the next launch.
const UPDATES = new Directory(Paths.cache, 'updates')

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
  // An update downloaded last time has been installed (or given up on) by now.
  try {
    if (UPDATES.exists) UPDATES.delete()
  } catch (e) {
    console.warn('Clearing old updates failed', e)
  }
  try {
    const res = await fetch(LATEST_RELEASE, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) throw new Error(`Latest release: ${res.status}`)
    const release = (await res.json()) as {
      tag_name: string
      body: string | null
      html_url: string
      assets: { name: string; size: number; browser_download_url: string }[]
    }
    const current = Constants.expoConfig?.version ?? '0.0.0'
    if (!isNewer(release.tag_name, current)) return null
    const apk = release.assets.find((a) => a.name.toLowerCase().endsWith('.apk'))
    return {
      version: release.tag_name.replace(/^v/i, ''),
      notes: plainNotes(release.body ?? ''),
      url: apk?.browser_download_url ?? release.html_url,
      size: apk ? apk.size : null,
    }
  } catch (e) {
    console.warn('Checking for an app update failed', e)
    return null
  }
}

// Can the app download and install the update itself? (Android, with an APK attached.)
export const canInstallInApp = (update: AppUpdate) => Platform.OS === 'android' && update.size != null

// Downloads the update's APK into the cache. `onProgress`: 0 to 1.
export async function downloadUpdate(update: AppUpdate, onProgress: (fraction: number) => void, signal: AbortSignal) {
  if (!UPDATES.exists) UPDATES.create({ intermediates: true })
  const file = new File(UPDATES, `grimoire-${update.version}.apk`)
  if (file.exists) file.delete()
  const task = File.createDownloadTask(update.url, file, {
    signal,
    onProgress: ({ bytesWritten, totalBytes }) => {
      const total = totalBytes > 0 ? totalBytes : update.size
      if (total) onProgress(Math.min(bytesWritten / total, 1))
    },
  })
  const downloaded = await task.downloadAsync()
  if (!downloaded) throw new Error('The download stopped before it finished')
  return downloaded
}

// Opens Android's installer on a downloaded APK. The user taps Install there (and, the first time,
// allows Grimoire to install apps); the new version replaces this one and keeps its data.
export async function installUpdate(apk: File) {
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: apk.contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION: lets the installer read the file
  })
}
