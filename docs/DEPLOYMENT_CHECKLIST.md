# Quick Deployment Checklist

## Backend Deployment

- [ ] Create new Vercel project
- [ ] Set **Root Directory** to `backend`
- [ ] Add environment variables:
  - [ ] `SUPABASE_DB_URL`
  - [ ] `CLERK_JWKS_URL`
  - [ ] `CLERK_ISSUER`
  - [ ] `CLERK_AUDIENCE`
  - [ ] `ALLOWED_ORIGINS` (update after frontend deployment)
  - [ ] `SECRET_KEY`
  - [ ] `ENVIRONMENT=production`
  - [ ] `DEBUG=false`
- [ ] Deploy and note backend URL: `https://________________.vercel.app`
- [ ] Test health endpoint: `https://________________.vercel.app/api/health`

## Frontend Deployment

- [ ] Create new Vercel project
- [ ] Set **Root Directory** to `frontend`
- [ ] Add environment variables:
  - [ ] `VITE_API_BASE_URL=https://your-backend.vercel.app` (use backend URL from above)
  - [ ] `VITE_CLERK_PUBLISHABLE_KEY=pk_live_...`
- [ ] Deploy and note frontend URL: `https://________________.vercel.app`
- [ ] Test frontend loads correctly

## Post-Deployment

- [ ] Update backend `ALLOWED_ORIGINS` with frontend URL
- [ ] Redeploy backend (or wait for auto-deploy)
- [ ] Test API calls from frontend
- [ ] Verify authentication works
- [ ] Check browser console for errors
- [ ] Test full user flow

## Custom Domains (Optional)

- [ ] Add custom domain to frontend
- [ ] Add custom domain to backend (e.g., `api.yourdomain.com`)
- [ ] Update `VITE_API_BASE_URL` in frontend
- [ ] Update `ALLOWED_ORIGINS` in backend
- [ ] Configure DNS records
