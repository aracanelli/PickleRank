import type { RouteLocationRaw, LocationQueryValue } from 'vue-router'

/**
 * Default safe redirect path when no valid redirect is provided
 */
const DEFAULT_REDIRECT = '/groups'

/**
 * List of allowed internal path prefixes for redirects.
 * Only paths starting with these prefixes are considered safe.
 */
const ALLOWED_PATH_PREFIXES = [
    '/groups',
    '/rankings',
    '/events',
    '/players',
    '/profile',
    '/settings',
    '/admin',
    '/link-player',
]

/**
 * Validates and returns a safe redirect path to prevent open-redirect attacks.
 * 
 * @param redirectQuery - The redirect query parameter value from the route (may be LocationQueryValue or LocationQueryValue[])
 * @param fallback - Optional fallback path if redirect is invalid (defaults to '/groups')
 * @returns A validated internal path that is safe to redirect to
 * 
 * The function validates that:
 * 1. The redirect is a non-empty string
 * 2. The redirect starts with '/' (relative path)
 * 3. The redirect does not contain protocol-relative URLs (//)
 * 4. The redirect path starts with an allowed prefix
 */
export function getSafeRedirect(
    redirectQuery: LocationQueryValue | LocationQueryValue[],
    fallback: string = DEFAULT_REDIRECT
): string {
    // Handle array values (take first element)
    const redirect = Array.isArray(redirectQuery) ? redirectQuery[0] : redirectQuery

    // Must be a non-empty string
    if (!redirect || typeof redirect !== 'string') {
        return fallback
    }

    // Trim whitespace
    const trimmed = redirect.trim()

    // Must start with / to be a relative path
    if (!trimmed.startsWith('/')) {
        return fallback
    }

    // Reject protocol-relative URLs (e.g., //evil.com)
    if (trimmed.startsWith('//')) {
        return fallback
    }

    // Normalize the path for comparison (handle encoded characters)
    let normalizedPath: string
    try {
        normalizedPath = decodeURIComponent(trimmed)
    } catch {
        // Invalid encoding - reject
        return fallback
    }

    // Re-check after decode for protocol-relative URLs
    if (normalizedPath.startsWith('//')) {
        return fallback
    }

    // Check that the path starts with one of the allowed prefixes
    const isAllowed = ALLOWED_PATH_PREFIXES.some(
        prefix => normalizedPath === prefix ||
            normalizedPath.startsWith(prefix + '/') ||
            normalizedPath.startsWith(prefix + '?')
    )

    if (!isAllowed) {
        return fallback
    }

    return trimmed
}

/**
 * Creates a vue-router compatible route object with the redirect query parameter.
 * The redirect parameter is preserved safely (not validated here since it will be
 * validated when actually used for navigation).
 * 
 * @param routeName - The route name to navigate to
 * @param redirectQuery - The redirect query parameter to preserve
 * @returns A RouteLocationRaw object for vue-router navigation
 */
export function createNavigationWithRedirect(
    routeName: string,
    redirectQuery: LocationQueryValue | LocationQueryValue[]
): RouteLocationRaw {
    const redirect = Array.isArray(redirectQuery) ? redirectQuery[0] : redirectQuery

    return {
        name: routeName,
        query: redirect ? { redirect } : {}
    }
}
