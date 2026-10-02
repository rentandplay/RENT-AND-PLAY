# Free Render Deployment

This deployment uses one Render Free web service for both the dashboard and API. It keeps login same-origin and continues to use the existing Firebase Authentication and Firestore project. Render supplies an `onrender.com` URL, so purchasing a custom domain is optional.

## Free-Tier Limits

- Render Free services sleep after 15 minutes without traffic and may take about a minute to wake.
- Free services have monthly usage limits and are intended for hobby projects and previews, not guaranteed production uptime.
- Firestore has free quotas; monitor usage in Firebase Console.
- Do not attach paid compute or select a paid Render plan if deployment must stay at $0.

## Deploy

1. Sign in to [Render](https://dashboard.render.com/) with the GitHub account that has access to this repository.
2. Make sure the intended app changes and the root `render.yaml`, `Dockerfile.render`, and `apps/production-render.mjs` are committed and pushed to the branch you will deploy. Render deploys from GitHub, not from uncommitted local files. Review existing worktree changes before pushing; do not include unrelated deletions.
3. In Render, choose **New > Blueprint**, connect `RENT-AND-PLAY`, and deploy the `rent-and-play-app` service from `render.yaml`. Confirm the compute plan remains **Free**.
4. Enter these values in Render's environment settings. Get them from the local backend `.env` without sharing them in chat:
	- `FIREBASE_PROJECT_ID`
	- `FIREBASE_WEB_API_KEY`
	- `FIREBASE_SERVICE_ACCOUNT_JSON`
	- `WEB_ORIGIN`, set to the exact HTTPS URL Render assigns to the service
5. Wait for `/api/health` to become healthy, then open the generated `https://...onrender.com` URL and sign in with the existing admin account.

The service uses `COOKIE_SECURE=true` and routes `/api/**` through the same-origin web server. Firebase service-account credentials are passed only as a Render environment secret; they are excluded from the Docker build context and must never be committed.

## Later Updates

After pushing reviewed changes to the connected GitHub branch, Render can automatically redeploy. Keep `.env`, service-account JSON, and other credentials out of Git. A custom domain can be connected later, but registering one costs money; the Render-provided domain remains free.