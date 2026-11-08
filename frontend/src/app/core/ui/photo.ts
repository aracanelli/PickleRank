/**
 * Player photos and league logos. Reads need the bearer token, so images are fetched through the
 * API client and shown as object URLs, cached for the session by path + version.
 * Only fetch when a DTO says a photo exists (photoVersion / logoVersion), so lists cost no extra requests.
 */
import { ref, watchEffect, type Ref } from 'vue'
import { api, type ApiError } from '@/app/core/http/api-client'

export const ACCEPT = 'image/jpeg,image/png,image/webp'
const MAX_SIDE = 512
// Phone photos are big; we crop and shrink them here. The server's own cap (2 MB) applies to what we send.
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

/** Check the pick, then decode it upright. A convenience only: the server validates everything again. */
export async function decodePick(file: File): Promise<ImageBitmap> {
  if (!ACCEPT.split(',').includes(file.type)) throw new PhotoError('Use a JPEG, PNG or WebP image.')
  // checked before decoding so a huge file never reaches the decoder
  if (file.size > MAX_PICK_BYTES) throw new PhotoError('That photo is too big. Pick one under 20 MB.')
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new PhotoError("That file couldn't be read as an image. Use a JPEG, PNG or WebP image.")
  }
}

export const ZOOM_MIN = 1
export const ZOOM_MAX = 4
export interface Pan { x: number; y: number }
export interface CropRect { sx: number; sy: number; size: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Frame px per image px. At zoom 1 the image's short side exactly fills the frame. */
const scaleAt = (w: number, h: number, zoom: number, view: number) => (view / Math.min(w, h)) * clamp(zoom, ZOOM_MIN, ZOOM_MAX)

/**
 * Keep the image covering the frame. `pan` is how far the image centre sits from the frame centre,
 * in frame px (positive x moves the image right).
 */
export function clampPan(w: number, h: number, zoom: number, pan: Pan, view: number): Pan {
  const s = scaleAt(w, h, zoom, view)
  const mx = (w * s - view) / 2
  const my = (h * s - view) / 2
  return { x: clamp(pan.x, -mx, mx), y: clamp(pan.y, -my, my) }
}

/** The square of the source image (in image px) that a `view`-px frame shows at this zoom and pan. */
export function cropRect(w: number, h: number, zoom: number, pan: Pan, view: number): CropRect {
  const s = scaleAt(w, h, zoom, view)
  const p = clampPan(w, h, zoom, pan, view)
  const size = view / s
  return { sx: clamp(w / 2 - size / 2 - p.x / s, 0, w - size), sy: clamp(h / 2 - size / 2 - p.y / s, 0, h - size), size }
}

/** Draw the chosen square at 512x512 and encode it: WebP, or JPEG where the browser can't encode WebP. */
export async function encodeCrop(bmp: ImageBitmap, r: CropRect): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = MAX_SIDE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new PhotoError("The picture couldn't be prepared. Try again.")
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, r.sx, r.sy, r.size, r.size, 0, 0, MAX_SIDE, MAX_SIDE)
  const toBlob = (type: string, q: number) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, q))
  const webp = await toBlob('image/webp', 0.85)
  if (webp?.type === 'image/webp') return webp
  // JPEG has no transparency: put a white backing under see-through logos instead of black
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, MAX_SIDE, MAX_SIDE)
  const jpeg = await toBlob('image/jpeg', 0.9)
  if (!jpeg) throw new PhotoError("The picture couldn't be prepared. Try again.")
  return jpeg
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

export async function uploadImage(path: string, image: Blob): Promise<number> {
  const res = await api.putBlob<{ photoVersion?: number; logoVersion?: number }>(path, image)
  api.invalidateCache('/api/groups')
  return (res.photoVersion ?? res.logoVersion)!
}

export async function removeImage(path: string): Promise<void> {
  await api.delete(path)
  api.invalidateCache('/api/groups')
}
