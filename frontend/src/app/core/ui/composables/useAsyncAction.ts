import { ref } from 'vue'
import { useToast } from './useToast'
import { getApiErrorMessage } from './useApiError'

/**
 * Wraps a mutation: tracks a loading flag, surfaces failures as an error
 * toast, and optionally shows a success toast.
 *
 *   const { run: save, loading: saving } = useAsyncAction(
 *     () => groupsApi.rename(id, name),
 *     { success: 'Group renamed' }
 *   )
 */
export function useAsyncAction<Args extends unknown[], T>(
  action: (...args: Args) => Promise<T>,
  options: { success?: string; errorFallback?: string } = {}
) {
  const loading = ref(false)
  const toast = useToast()

  async function run(...args: Args): Promise<T | undefined> {
    if (loading.value) return undefined
    loading.value = true
    try {
      const result = await action(...args)
      if (options.success) toast.success(options.success)
      return result
    } catch (e) {
      toast.error(getApiErrorMessage(e, options.errorFallback))
      return undefined
    } finally {
      loading.value = false
    }
  }

  return { run, loading }
}
