# Free Render Deployment

The production target is one Render Free Node web service. It serves both the built dashboard and the Firebase-backed API, so the app uses one same-origin HTTPS URL and no paid Cloud Run or separately hosted static site. Render assigns an `onrender.com` address; a custom domain is not needed.

## Deploy from GitHub

1. Push this repository, including `render.yaml`, to the GitHub repository connected to your Render account. Do not commit `.env` or any Firebase credentials.
2. In the [Render Dashboard](https://dashboard.render.com/), choose **New > Blueprint**, select the repository and the branch containing `render.yaml`, and create the service. Keep the service on the **Free** plan. If `rent-and-play.onrender.com` is already taken, choose another available service name and update `WEB_ORIGIN` to its exact `https://...onrender.com` URL.
3. When Render requests environment values, copy `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, and `FIREBASE_SERVICE_ACCOUNT_JSON` from your local `apps/backend/.env` into Render's private environment form. Never paste credentials into GitHub, source files, or chat.
4. Wait for the build and health check to pass. Open the Render service URL. The website and API share the same origin, and the backend sets secure session cookies.
5. In Firebase Console, open **Authentication > Settings > Authorized domains** and add the Render hostname (without `https://`) if it is not already present.

The deployment uses the existing active `ADMIN` Firebase account. It does not create accounts or change passwords.

## Free-tier limits

Render Free services sleep after 15 minutes without traffic and may take about a minute to wake. Free web services are intended for hobby/testing use and have monthly usage limits. Firebase Hosting is not used in this deployment. Firestore has a free quota of 1 GiB storage, 50,000 document reads/day, and 20,000 writes/day; check current limits and usage in Firebase Console.

A purchased custom domain costs money, so stay with the Render URL to keep deployment at $0. If usage exceeds a provider's no-cost quota, stop and review the dashboard before enabling any paid plan.