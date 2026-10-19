# Daybeam Calendar

Daybeam is a Chrome Manifest V3 calendar companion with an original name, icon, and interface. It uses the Google Calendar API to show upcoming events from the signed-in user's **primary calendar**, optionally display public Jewish, Christian, and Islamic holiday calendars, and create new timed events on the primary calendar.

## Features

- Opens to a full month grid with event chips; agenda, day, week, and year views are available from the view menu
- Select Jewish, Christian, and Islamic holiday calendars from the toolbar menu to display their dates alongside personal events in Daybeam
- Quick event creation from the popup, a selected-text context menu, or Chrome's address bar with the `cal` keyword; the quick-add form recognizes simple English dates such as “tomorrow” or a weekday, ISO dates, and times such as “3pm”
- Snoozable desktop reminders, optional spoken alerts, and a next-event countdown on the toolbar icon
- Preferences for the default view, selected holiday calendars, reminder timing, voice, notifications, and the toolbar badge
- Original extension icons plus Chrome Web Store preview artwork in `assets/`

## Screenshots

<table>
  <tr><th>Month view</th><th>Add an event</th></tr>
  <tr>
    <td><img src="assets/pic/Screenshot%202026-10-19%20203319.png" alt="Daybeam Calendar month view" width="400"></td>
    <td><img src="assets/pic/Screenshot%202026-10-19%20203350.png" alt="Add event dialog" width="400"></td>
  </tr>
  <tr><th>View picker</th><th>Calendar view menu</th></tr>
  <tr>
    <td><img src="assets/pic/Screenshot%202026-10-19%20152448.png" alt="Calendar view picker" width="400"></td>
    <td><img src="assets/pic/Screenshot%202026-10-19%20203333.png" alt="Calendar with the view menu open" width="400"></td>
  </tr>
  <tr><th>Settings</th><td></td></tr>
  <tr>
    <td><img src="assets/pic/Screenshot%202026-10-19%20203326.png" alt="Daybeam Calendar settings" width="400"></td>
    <td></td>
  </tr>
</table>

## Use without an account

Daybeam opens straight into the calendar without asking anyone to sign in. Events created in this mode are saved only in Chrome on that device and are marked **Not connected · Local only**. They are not sent to Google. The account chip in the toolbar shows whether Google Calendar is connected and synced.

## Optional Google Calendar sync

The GitHub source and downloadable ZIP contain no OAuth client ID or Google Cloud project credentials. Chrome's supported Google sign-in flow reads its OAuth client ID from the extension's `manifest.json`; a client ID cannot be entered later in the popup. To enable sync for a private copy, use a Google Cloud project and OAuth client that you control, then configure that local copy:

1. Open `chrome://extensions`, turn on **Developer mode**, and choose **Load unpacked**. Select this project folder. The included public key pins it to the Chrome Web Store item ID `coikfeniolifmkkchgpgigccbakokogn`.
2. In your own [Google Cloud Console](https://console.cloud.google.com/), enable the Google Calendar API and configure the OAuth consent screen.
3. Create an OAuth client of type **Chrome Extension** for extension ID `coikfeniolifmkkchgpgigccbakokogn`.
4. Add the following `oauth2` block to your local `manifest.json`, replacing the sample value with your own client ID:

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

5. Reload Daybeam in `chrome://extensions`, open it, and choose **Connect Google Calendar** from the account menu. Authorize the Google account you want to use.

Google's [Chrome extension OAuth guide](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth) describes the supported setup. If your consent screen is in Testing mode, add your account as a test user. General public use of a custom OAuth client may require publishing and verification. This per-user setup is for a local/private copy; the Chrome Web Store build cannot accept a different OAuth client ID at runtime.

## Load and update

For local use, load this folder as an unpacked extension. After editing any files, return to `chrome://extensions` and click the reload icon on the Daybeam card. The `Daybeam-Calendar.zip` archive is also provided for packaging or sharing the source.

## Access and privacy

See the [Daybeam Calendar Privacy Policy](PRIVACY.md) for details about the data the extension handles and how it is used.

When a user configures their own OAuth client and connects, Daybeam requests the `calendar.events`, `profile`, `email`, and `openid` scopes. Calendar and profile requests go directly from the extension to Google; Daybeam does not send event or profile data to a separate service, and does not store the profile name. Without a connected account, user-created events are stored locally in Chrome and are not synced. Selected holiday calendars are fetched from Google only while connected and are not copied into the primary calendar. Daybeam stores preferences, local-only events, reminder snooze times, and notification de-duplication keys in Chrome local storage. Calendar responses are cached temporarily in Chrome session storage for up to five minutes to reduce repeated API requests. The context menu only opens when text is selected, and the omnibox shortcut only runs after the `cal` keyword is entered.

Reminders are checked about once per minute while Chrome is running. Local-only reminders work without an account; Google event data, selected holiday calendars, and Google event creation require the user to configure and authorize their own OAuth client.

## Artwork

- `icons/16.png`, `icons/32.png`, `icons/48.png`, `icons/128.png`: toolbar and extension icons
- `assets/daybeam-mark.svg`: editable vector source for the icon
- `assets/daybeam-store-tile.png`: 440 × 280 Chrome Web Store promo tile
- `assets/daybeam-preview-1280x800.png`: 1280 × 800 feature preview
- `assets/store-listing/`: four 640 × 400, RGB PNG screenshots ready for the Chrome Web Store listing

Regenerate the PNG artwork with `python assets/make_assets.py`.
