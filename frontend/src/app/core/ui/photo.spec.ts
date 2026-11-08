import { describe, it, expect } from 'vitest'
import { decodePick, photoErrorMessage, PhotoError, cropRect, clampPan } from './photo'

describe('photo upload checks', () => {
  it.each(['image/svg+xml', 'image/gif', 'image/heic', 'text/html', ''])('rejects %s before uploading', async type => {
    await expect(decodePick(new File(['x'], 'pic', { type }))).rejects.toThrow('Use a JPEG, PNG or WebP image.')
  })

  it('rejects huge picks', async () => {
    const big = new File([new Uint8Array(21 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    await expect(decodePick(big)).rejects.toBeInstanceOf(PhotoError)
  })

  it('maps server refusals to plain copy', () => {
    expect(photoErrorMessage({ status: 413, message: '' })).toMatch(/too big/)
    expect(photoErrorMessage({ status: 415, message: '' })).toBe('Use a JPEG, PNG or WebP image.')
    expect(photoErrorMessage({ status: 403, message: '' })).toMatch(/can't change/)
  })
})

describe('crop math', () => {
  const close = (r: { sx: number; sy: number; size: number }, sx: number, sy: number, size: number) => {
    expect(r.sx).toBeCloseTo(sx)
    expect(r.sy).toBeCloseTo(sy)
    expect(r.size).toBeCloseTo(size)
  }

  it('at 1x with no pan takes the centred square of the short side', () => {
    close(cropRect(1000, 600, 1, { x: 0, y: 0 }, 240), 200, 0, 600)
    close(cropRect(600, 1000, 1, { x: 0, y: 0 }, 240), 0, 200, 600)
  })

  it('zoom shrinks the square around the centre', () => {
    close(cropRect(800, 800, 2, { x: 0, y: 0 }, 200), 200, 200, 400)
    close(cropRect(800, 800, 4, { x: 0, y: 0 }, 200), 300, 300, 200)
  })

  it('pan moves the square the other way, in image px', () => {
    // 800px image in a 200px frame at 2x: 1 frame px = 2 image px
    close(cropRect(800, 800, 2, { x: 50, y: -25 }, 200), 100, 250, 400)
  })

  it('clamps pan so the frame is always covered', () => {
    expect(clampPan(1000, 600, 1, { x: 999, y: 999 }, 240)).toEqual({ x: 80, y: 0 })
    close(cropRect(1000, 600, 1, { x: 999, y: 999 }, 240), 0, 0, 600)
    close(cropRect(1000, 600, 1, { x: -999, y: -999 }, 240), 400, 0, 600)
    close(cropRect(800, 800, 2, { x: -1e6, y: 1e6 }, 200), 400, 0, 400)
  })

  it('clamps zoom to 1x..4x', () => {
    close(cropRect(800, 800, 0.2, { x: 0, y: 0 }, 200), 0, 0, 800)
    close(cropRect(800, 800, 9, { x: 0, y: 0 }, 200), 300, 300, 200)
  })
})
