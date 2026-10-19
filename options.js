import { clearCalendarCache } from "./shared/calendar.js";

const defaults = { defaultView: "month", holidayCalendars: [], popupLayoutVersion: 1, reminderMinutes: 10, notifications: true, voice: false, showBadge: true };
const byId = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", initialize);
document.querySelectorAll("input, select").forEach((control) => control.addEventListener("change", saveSettings));
byId("disconnect-button").addEventListener("click", disconnect);

async function initialize() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  const current = { ...defaults, ...settings };
  byId("default-view").value = current.defaultView;
  byId("reminder-minutes").value = String(current.reminderMinutes);
  byId("notifications").checked = current.notifications;
  byId("voice").checked = current.voice;
  byId("show-badge").checked = current.showBadge;
}

async function saveSettings() {
  const { settings: storedSettings = {} } = await chrome.storage.local.get("settings");
  const settings = {
    ...defaults,
    ...storedSettings,
    defaultView: byId("default-view").value,
    popupLayoutVersion: defaults.popupLayoutVersion,
    reminderMinutes: Number(byId("reminder-minutes").value),
    notifications: byId("notifications").checked,
    voice: byId("voice").checked,
    showBadge: byId("show-badge").checked
  };
  await chrome.storage.local.set({ settings });
  byId("settings-status").textContent = "Saved";
  chrome.runtime.sendMessage({ type: "DAYBEAM_REFRESH" });
  setTimeout(() => { byId("settings-status").textContent = ""; }, 1500);
}

async function disconnect() {
  await new Promise((resolve) => chrome.identity.clearAllCachedAuthTokens(resolve));
  await clearCalendarCache();
  await chrome.storage.local.remove(["notified", "snoozed"]);
  byId("settings-status").textContent = "Google disconnected";
  chrome.runtime.sendMessage({ type: "DAYBEAM_REFRESH" });
}
