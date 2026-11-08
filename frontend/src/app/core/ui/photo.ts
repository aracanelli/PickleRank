/**
 * Player photos and league logos. Reads need the bearer token, so images are fetched through the
 * API client and shown as object URLs, cached for the session by path + version.
 * Only fetch when a DTO says a photo exists (photoVersion / logoVersion), so lists cost no extra requests.
 */
import { ref, watchEffect, type Ref } from 'vue'
import { api, type ApiError } from '@/app/core/http/api-client'

export const ACCEPT = 'image/jpeg,image/png,image/webp'
const MAX_SIDE = 512
// Phone photos are big; we shrink them here. The server's own cap (2 MB) applies to what we send.
const MAX_PICK_BYTES = 20 * 1024 * 1024

export const playerPhotoPath = (groupId: string, groupPlayerId: string) => `/api/groups/${groupId}/players/${groupPlayerId}/photo`
export const leagueLogoPath = (groupId: string) => `/api/groups/${groupId}/logo`

const cache = new Map<string, Promise<string | null>>()

function load(path: string, version: number): Promise<string | null> {
  const key = `${path}?v=${version}`
  let hit = cache.get(key)
  if (!hit) {
    hit = api.getBlob(key).then(b => URL.createObjectURL(b), () => null)
    cache.set(key, hit)
  }
  return hit
}

/** Object URL for an image, or null while loading, when there is none, or when it failed (callers fall back). */
export function useImage(source: () => { path: string; version?: number | null } | null): Ref<string | null> {
  const url = ref<string | null>(null)
  watchEffect(onCleanup => {
    const s = source()
    url.value = null
    if (!s || !s.version) return
    let live = true
    onCleanup(() => { live = false })
    load(s.path, s.version).then(u => { if (live) url.value = u })
  })
  return url
}

export class PhotoError extends Error {}

/** Check the pick and downscale it with a canvas. A convenience only: the server validates everything again. */
export async function shrinkForUpload(file: File): Promise<Blob> {
  if (!ACCEPT.split(',').includes(file.type)) throw new PhotoError('Use a JPEG, PNG or WebP image.')
  if (file.size > MAX_PICK_BYTES) throw new PhotoError('That photo is too big. Pick one under 20 MB.')
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new PhotoError("That file couldn't be read as an image. Use a JPEG, PNG or WebP image.")
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bmp.width * scale))
  canvas.height = Math.max(1, Math.round(bmp.height * scale))
  canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  // Browsers without WebP encoding hand back PNG, which the server also accepts.
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.85))
  return blob ?? file
}

/** Plain-language message for a failed upload or removal. */
export function photoErrorMessage(e: unknown): string {
  if (e instanceof PhotoError) return e.message
  const status = (e as ApiError)?.status
  if (status === 413) return 'That photo is too big. The limit is 2 MB.'
  if (status === 415) return 'Use a JPEG, PNG or WebP image.'
  if (status === 403) return "You can't change this picture."
  if (status === 429) return 'Too many uploads. Try again in a minute.'
  return "The picture didn't save. Check your connection and try again."
}

export async function uploadImage(path: string, file: File): Promise<number> {
  const res = await api.putBlob<{ photoVersion?: number; logoVersion?: number }>(path, await shrinkForUpload(file))
  api.invalidateCache('/api/groups')
  return (res.photoVersion ?? res.logoVersion)!
}

export async function removeImage(path: string): Promise<void> {
  await api.delete(path)
  api.invalidateCache('/api/groups')
}
