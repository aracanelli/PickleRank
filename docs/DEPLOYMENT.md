# Vercel Deployment Guide

This guide will help you deploy both the frontend and backend as separate Vercel projects.

## Prerequisites

1. A Vercel account ([vercel.com](https://vercel.com))
2. Vercel CLI installed (optional, for CLI deployment): `npm i -g vercel`
3. Environment variables ready (see below)

## Project Structure

- **Frontend Project**: Deploy from `frontend/` directory
- **Backend Project**: Deploy from `backend/` directory

## Step 1: Deploy Backend

### 1.1 Create Backend Project in Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New..." → "Project"
3. Import your Git repository
4. **Important**: Set the **Root Directory** to `backend`
5. Vercel should auto-detect Python/FastAPI

### 1.2 Configure Backend Environment Variables

In the Vercel project settings, add these environment variables:

```
SUPABASE_DB_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
CLERK_JWKS_URL=https://your-clerk-instance.clerk.accounts.dev/.well-known/jwks.json
CLERK_ISSUER=https://your-clerk-instance.clerk.accounts.dev
CLERK_AUDIENCE=your-clerk-audience
ALLOWED_ORIGINS=https://your-frontend-domain.vercel.app,https://your-custom-domain.com
SECRET_KEY=your-secret-key-for-rate-limiting
ENVIRONMENT=production
DEBUG=false
```

**Important Notes:**
- Replace `ALLOWED_ORIGINS` with your actual frontend URL(s) after deploying
- You can add multiple origins separated by commas
- Keep `ENVIRONMENT=production` and `DEBUG=false` for production

### 1.3 Deploy Backend

- If using Git integration: Push to your main branch, Vercel will auto-deploy
- If using CLI: Run `vercel` from the `backend/` directory

### 1.4 Note Your Backend URL

After deployment, note your backend URL (e.g., `https://your-backend.vercel.app`)

## Step 2: Deploy Frontend

### 2.1 Create Frontend Project in Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New..." → "Project"
3. Import your Git repository (same repo as backend)
4. **Important**: Set the **Root Directory** to `frontend`
5. Vercel should auto-detect Vite/Vue

### 2.2 Configure Frontend Environment Variables

In the Vercel project settings, add these environment variables:

```
VITE_API_BASE_URL=https://your-backend.vercel.app
VITE_CLERK_PUBLISHABLE_KEY=pk_live_your_key_here
```

**Important Notes:**
- Replace `VITE_API_BASE_URL` with your actual backend URL from Step 1.4
- Use your production Clerk publishable key (starts with `pk_live_`)

### 2.3 Deploy Frontend

- If using Git integration: Push to your main branch, Vercel will auto-deploy
- If using CLI: Run `vercel` from the `frontend/` directory

## Step 3: Update CORS Settings

After both deployments are complete:

1. Go to your **Backend** project settings in Vercel
2. Update the `ALLOWED_ORIGINS` environment variable to include:
   - Your frontend Vercel URL
   - Any custom domains you're using
   - Example: `https://your-frontend.vercel.app,https://your-custom-domain.com`
3. Redeploy the backend (or wait for next deployment)

## Step 4: Verify Deployment

### Backend Health Check
Visit: `https://your-backend.vercel.app/api/health`

Should return a 200 status with health information.

### Frontend
Visit: `https://your-frontend.vercel.app`

Should load your Vue application.

### Test API Connection
1. Open browser DevTools on your frontend
2. Try to make an API call
3. Check Network tab for successful requests to your backend

## Troubleshooting

### Backend Issues

**Problem**: 500 errors or import errors
- **Solution**: Ensure all dependencies are in `requirements.txt`
- Check Vercel build logs for Python version issues

**Problem**: Database connection errors
- **Solution**: Verify `SUPABASE_DB_URL` is correct
- Ensure your database allows connections from Vercel IPs

**Problem**: CORS errors
- **Solution**: Update `ALLOWED_ORIGINS` in backend environment variables
- Include the exact frontend URL (with https://)

### Frontend Issues

**Problem**: API calls failing
- **Solution**: Verify `VITE_API_BASE_URL` is set correctly
- Check browser console for CORS errors
- Ensure backend `ALLOWED_ORIGINS` includes frontend URL

**Problem**: Build fails
- **Solution**: Check Node.js version (Vercel should auto-detect)
- Verify all dependencies are in `package.json`

## Custom Domains

### Adding Custom Domain to Frontend
1. Go to Frontend project → Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions

### Adding Custom Domain to Backend
1. Go to Backend project → Settings → Domains
2. Add your custom domain (e.g., `api.yourdomain.com`)
3. Update `VITE_API_BASE_URL` in frontend to use new domain
4. Update `ALLOWED_ORIGINS` in backend to include new frontend domain

## Environment-Specific Deployments

### Preview Deployments
Vercel automatically creates preview deployments for pull requests. You may want to:
- Use different environment variables for preview deployments
- Set up separate Clerk instances for staging

### Production vs Preview
Consider using Vercel's environment variable scopes:
- **Production**: Production environment variables
- **Preview**: Preview/staging environment variables
- **Development**: Local `.env` files

## Monitoring

- Check Vercel dashboard for deployment status
- Monitor function logs in Vercel dashboard
- Set up error tracking (e.g., Sentry) for production

## Additional Resources

- [Vercel Python Documentation](https://vercel.com/docs/functions/serverless-functions/runtimes/python)
- [Vercel Vite Documentation](https://vercel.com/docs/frameworks/vite)
- [FastAPI on Vercel](https://vercel.com/guides/deploying-fastapi-with-vercel)
