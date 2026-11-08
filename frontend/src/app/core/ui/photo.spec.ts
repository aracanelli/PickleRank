import { describe, it, expect } from 'vitest'
import { shrinkForUpload, photoErrorMessage, PhotoError } from './photo'

describe('photo upload checks', () => {
  it.each(['image/svg+xml', 'image/gif', 'image/heic', 'text/html', ''])('rejects %s before uploading', async type => {
    await expect(shrinkForUpload(new File(['x'], 'pic', { type }))).rejects.toThrow('Use a JPEG, PNG or WebP image.')
  })

  it('rejects huge picks', async () => {
    const big = new File([new Uint8Array(21 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    await expect(shrinkForUpload(big)).rejects.toBeInstanceOf(PhotoError)
  })

  it('maps server refusals to plain copy', () => {
    expect(photoErrorMessage({ status: 413, message: '' })).toMatch(/too big/)
    expect(photoErrorMessage({ status: 415, message: '' })).toBe('Use a JPEG, PNG or WebP image.')
    expect(photoErrorMessage({ status: 403, message: '' })).toMatch(/can't change/)
  })
})
