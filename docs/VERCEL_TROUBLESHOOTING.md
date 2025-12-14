# Vercel Deployment Troubleshooting

## Common Issues and Solutions

### 1. FUNCTION_INVOCATION_FAILED (500 Error)

This error typically means the serverless function crashed during initialization or execution.

#### Check Vercel Logs
1. Go to your Vercel project dashboard
2. Click on the failed deployment
3. Check the "Function Logs" tab
4. Look for Python tracebacks or import errors

#### Common Causes:

**a) Missing Environment Variables**
- Ensure all required environment variables are set in Vercel project settings
- Check that `SUPABASE_DB_URL` is correctly formatted
- Verify `CLERK_JWKS_URL` and `CLERK_ISSUER` are set

**b) Import Errors**
- Check if all dependencies are in `requirements.txt`
- Verify Python version matches (should be 3.11)
- Look for relative import issues in logs

**c) Database Connection Issues**
- The app should still start even if database connection fails
- Check that `SUPABASE_DB_URL` is accessible from Vercel's IPs
- Verify database allows external connections

**d) Missing Dependencies**
- Ensure `requirements.txt` includes all packages
- Check build logs for missing package errors

### 2. How to Debug

#### Step 1: Check Health Endpoint
Try accessing: `https://your-backend.vercel.app/api/health`

This endpoint doesn't require database access and should work even if DB is down.

#### Step 2: Check Function Logs
In Vercel dashboard:
1. Go to your project
2. Click on "Functions" tab
3. Click on the function name
4. View "Logs" tab for real-time logs

#### Step 3: Test Locally with Vercel CLI
```bash
cd backend
vercel dev
```

This runs your function locally in a Vercel-like environment.

### 3. Environment Variables Checklist

Ensure these are set in Vercel:

**Required:**
- `SUPABASE_DB_URL` - Your PostgreSQL connection string
- `CLERK_JWKS_URL` - Clerk JWKS endpoint
- `CLERK_ISSUER` - Clerk issuer URL
- `ALLOWED_ORIGINS` - Comma-separated list of allowed origins

**Optional but Recommended:**
- `CLERK_AUDIENCE` - Clerk audience (if using)
- `SECRET_KEY` - Secret for rate limiting
- `ENVIRONMENT` - Set to `production`
- `DEBUG` - Set to `false`

### 4. Database Connection Issues

If database connection fails:
- The app should still start (database is initialized lazily)
- First API call that needs DB will attempt connection
- Check Vercel logs for database connection errors
- Verify your database allows connections from Vercel's IP ranges
- Check if your database requires SSL connections

### 5. Import Path Issues

If you see `ModuleNotFoundError`:
- Ensure `requirements.txt` has all dependencies
- Check that imports use `app.` prefix (not relative imports)
- Verify the `vercel.json` points to `app/main.py` correctly

### 6. Python Version Issues

- Ensure `runtime.txt` specifies `3.11`
- Check `vercel.json` has `"PYTHON_VERSION": "3.11"` in env
- Vercel should auto-detect, but explicit is better

### 7. Build vs Runtime Errors

**Build Errors:**
- Check "Build Logs" in Vercel dashboard
- Usually related to `requirements.txt` or Python version

**Runtime Errors:**
- Check "Function Logs" in Vercel dashboard
- Usually related to code execution, imports, or environment variables

### 8. Quick Fixes

**If app won't start at all:**
1. Check that `app/main.py` exports `app` variable
2. Verify `vercel.json` points to correct path
3. Ensure all imports are correct

**If database calls fail:**
1. Check `SUPABASE_DB_URL` is correct
2. Verify database is accessible
3. Check connection pool settings in `connection.py`

**If CORS errors:**
1. Update `ALLOWED_ORIGINS` in backend environment variables
2. Include exact frontend URL (with https://)
3. Redeploy backend after updating

### 9. Testing the Fix

After making changes:
1. Commit and push to trigger new deployment
2. Wait for deployment to complete
3. Test `/api/health` endpoint first (no DB required)
4. Then test endpoints that require database
5. Check function logs for any errors

### 10. Getting Help

If issues persist:
1. Copy the full error from Vercel function logs
2. Check the specific line number in the traceback
3. Verify environment variables are set correctly
4. Test the health endpoint to isolate the issue

## Recent Changes Made

The following improvements were made to help with Vercel deployment:

1. **Lazy Database Initialization**: Database pool now initializes on first use, not at startup
2. **Better Error Handling**: App can start even if some components fail
3. **Vercel Detection**: Code detects Vercel environment and adjusts behavior
4. **Improved Logging**: Better error messages in logs
5. **Graceful Degradation**: App provides error endpoints if initialization fails
