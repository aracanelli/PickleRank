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




