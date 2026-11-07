/**
 * Render an element to PNG and hand it to the platform: share sheet when available,
 * a new tab on iOS (long-press to save), a download elsewhere.
 * Carried forward from the original event and rankings export.
 */
export async function shareElementAsImage(el: HTMLElement, fileName: string): Promise<'shared' | 'opened' | 'downloaded' | 'cancelled'> {
  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(el, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    logging: false,
    width: el.scrollWidth,
    height: el.scrollHeight
  })
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Image not created')

  if (navigator.share && navigator.canShare) {
    const file = new File([blob], fileName, { type: 'image/png' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        return 'shared'
      } catch (e) {
        if ((e as Error).name === 'AbortError') return 'cancelled'
      }
    }
  }

  const url = URL.createObjectURL(blob)
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    return 'opened'
  }
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return 'downloaded'
}

export const safeFileName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'picklerank'
