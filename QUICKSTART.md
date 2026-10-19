# Quick Start — Daybeam Calendar

## Use without Google sign-in

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Click **Load unpacked** and select this project folder.
3. Click the Daybeam toolbar icon. The calendar works without an account. New events are stored locally on this device and the account chip shows **Not connected**.

## Optional Google Calendar sync for a private copy

The GitHub source has no shared Google Cloud project or OAuth client. To sync a private installation, set up a project and OAuth client that you own:

1. In your own [Google Cloud Console](https://console.cloud.google.com/), enable Google Calendar API and configure the OAuth consent screen.
2. Create an OAuth client with type **Chrome Extension**, using the extension ID `coikfeniolifmkkchgpgigccbakokogn`.
3. Add this block to your local `manifest.json`, replacing the sample ID with the client ID from your project:

   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
     "scopes": [
       "openid",
       "profile",
       "email",
       "https://www.googleapis.com/auth/calendar.events"
     ]
   },
   ```

4. Reload Daybeam in `chrome://extensions`, click its toolbar button, and choose **Connect Google Calendar** from the account menu.

See Google's [OAuth guide for Chrome extensions](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth). A client ID can only be selected in the extension manifest, so the Chrome Web Store build cannot use a different client ID for each user. Each person who wants their own OAuth project must use a private/local copy configured with their own ID.

## Use Daybeam

- Choose Agenda, Day, Week, Month, Month Scroll, or Year from the view menu.
- Add an event in local mode to keep it on this device, or connect Google Calendar to create Google events.
- Use Settings to configure reminders, five-minute snoozes, spoken alerts, and the next-event countdown.
