# Security Documentation

## Authentication

### Clerk Integration

The application uses Clerk for authentication:

1. **Frontend**: Clerk React SDK handles login/logout/session management
2. **Backend**: Manual JWT verification using Clerk's JWKS endpoint

### JWT Verification (Backend)

```python
# The backend verifies JWTs by:
1. Fetching JWKS from Clerk's well-known endpoint
2. Validating the JWT signature
3. Verifying claims (issuer, audience, expiration)
4. Extracting the user ID (sub claim)
```

### Token Flow

1. User authenticates via Clerk (frontend)
2. Clerk issues a JWT
3. Frontend includes JWT in `Authorization: Bearer <token>` header
4. Backend verifies token on each request
5. User context is extracted and passed to services

## Authorization

### Ownership Model

- Every group has an `owner_user_id`
- All group-scoped operations verify ownership
- Users can only access their own data

### Authorization Rules

| Resource | Rule |
|----------|------|
| Groups | Only owner can read/write |
| Players | Only owner can read/write |
| Group Players | Only group owner can manage |
| Events | Only group owner can manage |
| Rankings | Only group owner can view |

## API Security

### CORS

- Strict origin allowlist
- Only frontend domains allowed
- No wildcard origins

### Rate Limiting

- Per-user limits: 100 requests/minute
- Per-endpoint limits for expensive operations
- Matchmaking generation: 10 requests/minute

### Request Validation

- All inputs validated via Pydantic
- Strict type checking
- Size limits on arrays and strings
- SQL injection prevented by parameterized queries

### Security Headers

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

### Image uploads (player photos, league logos)

Endpoints: `PUT/GET/DELETE /api/groups/{groupId}/players/{groupPlayerId}/photo` and `/api/groups/{groupId}/logo`.

- **Who can write**: a linked player for their own photo; the league owner or an organizer for any player in that league and for the logo. Everyone else gets 403. Photos belong to the league membership (`group_players.id`), so an organizer of one league cannot change how a player looks in another.
- **Who can read**: the owner and linked members of the league, the same rule as the roster. Reads need the bearer token; the web app fetches the bytes through the API client and shows an object URL, so no image URL carries a secret.
- **Size**: the body is read in chunks and refused with 413 past 2 MB, before any decoding (also the API-wide request cap, and under Vercel's 4.5 MB body limit). The web app downscales to 512 px first, as a convenience only.
- **Format allowlist**: the bytes are decoded with Pillow restricted to JPEG, PNG and WebP. SVG, GIF, HEIC, HTML, truncated files and anything else get 415. The client's filename and Content-Type are ignored.
- **Decompression bombs**: dimensions are checked (max 40 MP) before pixels are loaded, and `Image.MAX_IMAGE_PIXELS` is set to the same value.
- **Re-encoding**: the image is turned upright with `ImageOps.exif_transpose`, shrunk to fit 512x512, rebuilt from raw pixels and saved as WebP. The uploaded bytes are never stored or served, so EXIF/GPS, ICC, XMP and any appended payload are dropped.
- **Serving**: `Content-Type` comes from our own column (`image/webp`), with `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, `Content-Security-Policy: default-src 'none'; sandbox` and `Cache-Control: private, max-age=86400`.
- **Storage bound**: one row per player-in-league or league (`images` table, primary key `(kind, ref_id)`, upsert), capped at 1 MB by a CHECK. Row level security is on, so Supabase's REST roles cannot read the table. Uploads are rate-limited to 10 per minute per IP.

## Data Security

### Database Access

- Backend is the only access point to database
- No direct frontend-to-database connections
- Service role key never exposed to client
- Connection pooling for serverless safety

### Sensitive Data

- No passwords stored (Clerk handles auth)
- No PII beyond display names
- JWT secrets never logged

## Audit Logging

All significant actions are logged:

- Event generation
- Player swaps
- Score updates
- Event completion
- Settings changes

## Security Checklist

- [ ] Clerk keys properly configured
- [ ] JWKS URL is correct
- [ ] CORS origins restricted
- [ ] Rate limiting enabled
- [ ] Database URL uses connection pooling
- [ ] Environment variables not committed
- [ ] Security headers configured







