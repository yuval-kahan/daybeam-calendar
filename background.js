import { addDays, eventStart, isAllDay, listEvents, startOfDay } from "./shared/calendar.js";

const REMINDER_ALARM = "daybeam-reminder-poll";
const DEFAULTS = {
  settings: {
    defaultView: "month",
    holidayCalendars: [],
    popupLayoutVersion: 1,
    reminderMinutes: 10,
    notifications: true,
    voice: false,
    showBadge: true
  }
};

chrome.runtime.onInstalled.addListener(async (details) => {
  const stored = await chrome.storage.local.get("settings");
  const previousSettings = stored.settings || {};
  const settings = { ...DEFAULTS.settings, ...previousSettings };
  if (details.reason === "update" && !previousSettings.popupLayoutVersion && settings.defaultView === "agenda") {
    settings.defaultView = "month";
  }
  settings.popupLayoutVersion = DEFAULTS.settings.popupLayoutVersion;
  await chrome.storage.local.set({ settings });
  chrome.alarms.create(REMINDER_ALARM, { periodInMinutes: 1 });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "daybeam-add-selection",
      title: "Add “%s” to Daybeam Calendar",
      contexts: ["selection"]
    });
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(REMINDER_ALARM, { periodInMinutes: 1 });
  refreshBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REMINDER_ALARM) {
    checkReminders();
    refreshBadge();
  }
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "daybeam-add-selection") {
    openQuickAdd(info.selectionText || "");
  }
});

chrome.omnibox.setDefaultSuggestion({ description: "Add an event to Daybeam Calendar" });
chrome.omnibox.onInputEntered.addListener((text) => openQuickAdd(text));

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  const [eventId, startIso] = notificationId.split("::");
  if (buttonIndex === 0) {
    const data = await chrome.storage.local.get("snoozed");
    const snoozed = data.snoozed || {};
    snoozed[notificationId] = { eventId, startIso, fireAt: Date.now() + 5 * 60_000 };
    await chrome.storage.local.set({ snoozed });
    chrome.notifications.clear(notificationId);
  } else {
    chrome.tabs.create({ url: "https://calendar.google.com/calendar/u/0/r" });
  }
});

chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: "https://calendar.google.com/calendar/u/0/r" });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "DAYBEAM_REFRESH") {
    refreshBadge();
    checkReminders();
    sendResponse({ ok: true });
  }
  return true;
});

function openQuickAdd(title) {
  const url = new URL(chrome.runtime.getURL("quick-add.html"));
  if (title) url.searchParams.set("title", title.slice(0, 300));
  chrome.tabs.create({ url: url.toString() });
}

function countdownLabel(start) {
  const minutes = Math.max(0, Math.ceil((start.getTime() - Date.now()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.ceil(hours / 24)}d`;
}

async function refreshBadge() {
  try {
    const { settings = DEFAULTS.settings } = await chrome.storage.local.get("settings");
    if (!settings.showBadge) {
      await chrome.action.setBadgeText({ text: "" });
      await chrome.action.setTitle({ title: "Daybeam Calendar" });
      return;
    }
    const now = new Date();
    const rangeStart = startOfDay(now);
    const events = await listEvents(rangeStart, addDays(rangeStart, 8));
    const upcoming = events.find((event) => !isAllDay(event) && eventStart(event) >= now);
    if (!upcoming) {
      await chrome.action.setBadgeText({ text: "" });
      await chrome.action.setTitle({ title: "Daybeam Calendar · no upcoming event" });
      return;
    }
    await chrome.action.setBadgeBackgroundColor({ color: "#4057d6" });
    await chrome.action.setBadgeText({ text: countdownLabel(eventStart(upcoming)) });
    await chrome.action.setTitle({ title: `Next: ${upcoming.summary || "Untitled event"}` });
  } catch {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: "Daybeam Calendar" });
  }
}

async function checkReminders() {
  try {
    const { settings = DEFAULTS.settings, notified = {}, snoozed = {} } = await chrome.storage.local.get([
      "settings", "notified", "snoozed"
    ]);
    if (!settings.notifications) return;
    const now = Date.now();
    const rangeStart = startOfDay(new Date(now));
    const events = await listEvents(rangeStart, addDays(rangeStart, 8));
    const eventById = new Map(events.map((event) => [`${event.id}::${event.start?.dateTime || event.start?.date}`, event]));

    for (const [key, value] of Object.entries(snoozed)) {
      const event = eventById.get(key);
      if (event && value.fireAt <= now) {
        await showReminder(event, 0);
        delete snoozed[key];
      } else if (value.fireAt > now) {
        continue;
      } else {
        delete snoozed[key];
      }
    }

    for (const event of events) {
      if (isAllDay(event)) continue;
      const start = eventStart(event);
      const key = `${event.id}::${event.start?.dateTime || event.start?.date}`;
      const remindAt = start.getTime() - Math.max(0, Number(settings.reminderMinutes) || 0) * 60_000;
      if (now >= remindAt && now <= start.getTime() + 60_000 && !notified[key] && !snoozed[key]) {
        await showReminder(event, Math.max(0, Math.ceil((start.getTime() - now) / 60_000)));
        notified[key] = now;
      }
    }

    const cutoff = now - 14 * 86_400_000;
    for (const [key, time] of Object.entries(notified)) {
      if (time < cutoff) delete notified[key];
    }
    await chrome.storage.local.set({ notified, snoozed });
  } catch {
    // Calendar access may be unavailable until the user signs in.
  }
}

async function showReminder(event, minutes) {
  const key = `${event.id}::${event.start?.dateTime || event.start?.date}`;
  const message = minutes === 0 ? "Starting now" : `Starts in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const { settings = DEFAULTS.settings } = await chrome.storage.local.get("settings");
  if (settings.voice) {
    chrome.tts.speak(`${event.summary || "Upcoming event"}. ${message}.`, { rate: 0.95 });
  }
  return new Promise((resolve) => {
    chrome.notifications.create(key, {
      type: "basic",
      iconUrl: "icons/128.png",
      title: event.summary || "Upcoming event",
      message,
      buttons: [{ title: "Snooze 5 min" }, { title: "Open calendar" }],
      priority: 2
    }, resolve);
  });
}
