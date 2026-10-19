# Daybeam Calendar Privacy Policy

**Last updated: October 19, 2026**

Daybeam Calendar is a Chrome extension for viewing calendar events, adding events, displaying selected public holiday calendars, and receiving optional reminders.

## Information Daybeam handles

- **Local events:** When Google sync is not configured, event title, date, time, duration, and optional location are saved in Chrome storage on the current device. These events are not sent to Google and are not synced to other devices.
- **Google Calendar data:** If a user configures their own OAuth client and connects Google Calendar, Daybeam requests event titles, dates and times, locations when present, event identifiers, and calendar links directly from Google Calendar. New events are sent to Google only after the user saves them. Responses are temporarily cached in Chrome session storage for up to five minutes; Chrome clears session storage when the browser session ends.
- **Public holiday calendars:** When selected, Daybeam downloads the selected Jewish, Christian, or Islamic public holiday feed directly from Google Calendar. These public dates do not require a connected account. Feed data is cached temporarily in Chrome session storage for up to 24 hours and is not sent to a Daybeam server.
- **Google account details:** When connected, Daybeam requests the account name and email so it can identify the active account in the popup. Profile data is displayed but not saved by Daybeam.
- **Extension settings:** Calendar view, selected holiday calendars, reminder preferences, local events, reminder snooze times, and notification de-duplication keys are stored in Chrome storage on the device.
- **Selected text:** If a user explicitly chooses the Daybeam context-menu action on selected webpage text, or enters text after the `cal` keyword in the address bar, that text is used to prefill an event draft. It is sent to Google only if the user saves the event while Google sync is connected.
- **Google authorization:** Chrome's Identity API manages OAuth access tokens. Daybeam does not ask for or store Google passwords or save OAuth tokens in its own storage.

## How information is used and shared

Daybeam uses this information to display calendars, create events at the user's request, show optional reminders and the next-event countdown, and remember extension settings. Selected holiday events are shown in Daybeam and are not copied into the primary calendar.

When Google sync is enabled, calendar and account requests go directly from the extension to Google over HTTPS. Daybeam does not operate a server and does not send calendar or profile data to a Daybeam server. Google handles received information under [Google's Privacy Policy](https://policies.google.com/privacy). Daybeam does not sell user data or use it for advertising. Use of Google API data follows the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/), including its Limited Use requirements.

Daybeam does not read webpage content in the background, monitor browsing history, or record clicks or keystrokes. Selected text is accessed only after the user explicitly invokes the context-menu action.

## Retention and user choices

Local-only events and extension preferences remain in Chrome storage on the user's device until the user deletes them or removes the extension. Google Calendar events remain in the user's Google account and are managed through Google Calendar. Users can disconnect Daybeam and revoke its access through their Google Account security settings. Daybeam does not retain a separate server copy.

The GitHub source and ZIP contain no shared OAuth client ID or Google Cloud project credentials. Google sync is optional. Users who configure a private copy with their own OAuth client authorize their own Google account; their Google Cloud project is subject to Google's own quota and billing settings.

## Contact

For privacy questions, contact the developer through the [Daybeam Calendar GitHub repository](https://github.com/yuval-kahan/daybeam-calendar).
