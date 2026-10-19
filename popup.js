import {
  addDays,
  addMonths,
  clearCalendarCache,
  createEvent,
  eventEnd,
  eventStart,
  formatTime,
  getToken,
  hasGoogleAccount,
  hasOAuthClient,
  isAllDay,
  listEvents,
  listPublicHolidayEvents,
  deleteLocalEvent,
  sameLocalDay,
  startOfDay
} from "./shared/calendar.js";

const $ = (selector) => document.querySelector(selector);
const state = {
  view: "month",
  activeDate: new Date(),
  events: [],
  holidayEvents: [],
  calendarCache: new Map(),
  range: null,
  settings: { defaultView: "month", holidayCalendars: [] },
  loading: false,
  loadId: 0
};
let monthScrollFrame = 0;
let monthScrollRecenterPending = false;

const HOLIDAY_CALENDARS = [
  { key: "jewish", name: "Jewish holidays", calendarId: "en.jewish#holiday@group.v.calendar.google.com" },
  { key: "christian", name: "Christian holidays", calendarId: "en.christian#holiday@group.v.calendar.google.com" },
  { key: "islamic", name: "Islamic holidays", calendarId: "en.islamic#holiday@group.v.calendar.google.com" }
];

const calendarPanel = $("#calendar-panel");
const content = $("#calendar-content");
const quickAddOverlay = $("#quick-add-overlay");
const datePicker = $("#date-picker-popover");
const settingsScreen = $("#settings-screen");
const refreshButton = $("#refresh-button");
const refreshButtonIcon = refreshButton.innerHTML;
const refreshToast = $("#refresh-toast");
content.addEventListener("scroll", onMonthScroll, { passive: true });
let refreshFeedbackTimeout = 0;
let refreshToastTimeout = 0;

document.addEventListener("DOMContentLoaded", initialize);
document.addEventListener("click", (event) => {
  if (!event.target.closest("#view-switcher, #view-menu-button")) closeViewMenu();
  if (!event.target.closest("#holiday-menu, #holiday-menu-button")) closeHolidayMenu();
  if (!event.target.closest("#date-picker-popover, #period-label")) closeDatePicker();
  if (!event.target.closest("#account-menu, #account-status")) closeAccountMenu();
});
$("#account-status").addEventListener("click", toggleAccountMenu);
$("#account-connect-button").addEventListener("click", connectCalendar);
$("#account-logout-button").addEventListener("click", () => {
  closeAccountMenu();
  disconnectGoogleFromPopup($("#account-logout-button"));
});
$("#settings-button").addEventListener("click", openSettingsScreen);
$("#settings-back-button").addEventListener("click", closeSettingsScreen);
settingsScreen.addEventListener("change", savePopupSettings);
$("#popup-disconnect-button").addEventListener("click", disconnectGoogleFromPopup);
$("#view-menu-button").addEventListener("click", toggleViewMenu);
$("#holiday-menu-button").addEventListener("click", toggleHolidayMenu);
$("#holiday-menu-close").addEventListener("click", closeHolidayMenu);
$("#holiday-menu").addEventListener("change", onHolidayCalendarChange);
$("#view-switcher").addEventListener("click", onViewClick);
$("#previous-button").addEventListener("click", () => movePeriod(-1));
$("#next-button").addEventListener("click", () => movePeriod(1));
$("#today-button").addEventListener("click", () => { state.activeDate = new Date(); loadCalendar({ instant: true }); });
$("#period-label").addEventListener("click", toggleDatePicker);
$("#date-picker-close").addEventListener("click", closeDatePicker);
$("#date-picker-previous-year").addEventListener("click", () => changePickerYear(-1));
$("#date-picker-next-year").addEventListener("click", () => changePickerYear(1));
$("#date-picker-year").addEventListener("input", renderDatePickerMonths);
$("#date-picker-year").addEventListener("change", normalizePickerYear);
$("#date-picker-today").addEventListener("click", () => {
  state.activeDate = new Date();
  if (state.view !== "month-scroll") state.view = "month";
  setActiveViewButton();
  closeDatePicker();
  loadCalendar({ instant: true, preserveOnMiss: state.view === "month-scroll" });
});
refreshButton.addEventListener("click", refreshCalendarFromButton);
$("#quick-add-toggle").addEventListener("click", showQuickAdd);
$("#quick-add-close").addEventListener("click", hideQuickAdd);
$("#quick-add-cancel").addEventListener("click", hideQuickAdd);
quickAddOverlay.addEventListener("click", (event) => {
  if (event.target === quickAddOverlay) hideQuickAdd();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeDatePicker();
  closeHolidayMenu();
  const accountMenuWasOpen = !$("#account-menu").classList.contains("hidden");
  closeAccountMenu();
  if (accountMenuWasOpen) $("#account-status").focus();
  if (!settingsScreen.classList.contains("hidden")) closeSettingsScreen();
  if (!quickAddOverlay.classList.contains("hidden")) hideQuickAdd();
});
$("#quick-add-form").addEventListener("submit", saveEvent);

async function refreshCalendarFromButton() {
  if (refreshButton.disabled) return;
  clearTimeout(refreshFeedbackTimeout);
  refreshButton.disabled = true;
  refreshButton.classList.remove("refresh-complete", "refresh-failed");
  refreshButton.classList.add("is-refreshing");
  refreshButton.setAttribute("aria-busy", "true");
  refreshButton.setAttribute("aria-label", "Refreshing calendar");
  refreshButton.title = "Refreshing calendar…";

  try {
    state.calendarCache.clear();
    await clearCalendarCache();
    await loadCalendar({ instant: true, preserveOnMiss: true });
    const syncStatus = $("#sync-indicator").textContent;
    const refreshed = syncStatus === "Just synced" || syncStatus === "Not connected";
    refreshButton.classList.remove("is-refreshing");
    refreshButton.classList.add(refreshed ? "refresh-complete" : "refresh-failed");
    refreshButton.innerHTML = refreshed
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 16.17-3.88-3.88L3.7 13.7 9 19l11.3-11.3-1.41-1.41z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z"/></svg>';
    refreshButton.setAttribute("aria-label", refreshed ? "Calendar updated" : "Calendar refresh failed");
    refreshButton.title = refreshed ? "Calendar updated" : "Calendar refresh failed";
    if (refreshed) showRefreshToast();
  } catch {
    refreshButton.classList.remove("is-refreshing");
    refreshButton.classList.add("refresh-failed");
    refreshButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z"/></svg>';
    refreshButton.setAttribute("aria-label", "Calendar refresh failed");
    refreshButton.title = "Calendar refresh failed";
  } finally {
    refreshButton.disabled = false;
    refreshButton.removeAttribute("aria-busy");
    refreshFeedbackTimeout = setTimeout(() => {
      refreshButton.classList.remove("refresh-complete", "refresh-failed");
      refreshButton.innerHTML = refreshButtonIcon;
      refreshButton.setAttribute("aria-label", "Refresh calendar");
      refreshButton.title = "Refresh calendar";
    }, 1800);
  }
}

function showRefreshToast() {
  clearTimeout(refreshToastTimeout);
  refreshToast.classList.add("visible");
  refreshToast.setAttribute("aria-hidden", "false");
  refreshToastTimeout = setTimeout(() => {
    refreshToast.classList.remove("visible");
    refreshToast.setAttribute("aria-hidden", "true");
  }, 2400);
}

async function initialize() {
  const stored = await chrome.storage.local.get("settings");
  state.settings = { ...state.settings, ...(stored.settings || {}) };
  if (!Array.isArray(state.settings.holidayCalendars)) state.settings.holidayCalendars = [];
  syncSettingsForm();
  syncHolidayMenu();
  state.view = state.settings.defaultView || "month";
  setActiveViewButton();
  const params = new URLSearchParams(location.search);
  if (params.has("add")) showQuickAdd(params.get("title") || "");
  try {
    showCalendar(await hasGoogleAccount() ? await getToken(false) : null);
  } catch {
    showCalendar(null);
  }
}

function syncSettingsForm() {
  $("#popup-default-view").value = state.settings.defaultView || "month";
  $("#popup-reminder-minutes").value = String(state.settings.reminderMinutes ?? 10);
  $("#popup-notifications").checked = state.settings.notifications !== false;
  $("#popup-voice").checked = Boolean(state.settings.voice);
  $("#popup-show-badge").checked = state.settings.showBadge !== false;
}

function openSettingsScreen() {
  closeViewMenu();
  closeHolidayMenu();
  closeDatePicker();
  if (!quickAddOverlay.classList.contains("hidden")) hideQuickAdd();
  syncSettingsForm();
  settingsScreen.classList.remove("hidden");
  settingsScreen.setAttribute("aria-hidden", "false");
  document.body.classList.add("settings-mode");
  $("#settings-back-button").focus();
}

function closeSettingsScreen() {
  settingsScreen.classList.add("hidden");
  settingsScreen.setAttribute("aria-hidden", "true");
  document.body.classList.remove("settings-mode");
  $("#settings-button").focus();
}

async function savePopupSettings() {
  state.settings = {
    ...state.settings,
    defaultView: $("#popup-default-view").value,
    reminderMinutes: Number($("#popup-reminder-minutes").value),
    notifications: $("#popup-notifications").checked,
    voice: $("#popup-voice").checked,
    showBadge: $("#popup-show-badge").checked
  };
  await chrome.storage.local.set({ settings: state.settings });
  const status = $("#popup-settings-status");
  status.textContent = "Saved";
  chrome.runtime.sendMessage({ type: "DAYBEAM_REFRESH" });
  setTimeout(() => { status.textContent = ""; }, 1500);
}

async function disconnectGoogleFromPopup(button = $("#popup-disconnect-button")) {
  button.disabled = true;
  try {
    await new Promise((resolve) => chrome.identity.clearAllCachedAuthTokens(resolve));
    await clearCalendarCache();
    await chrome.storage.local.remove(["notified", "snoozed"]);
    if (!settingsScreen.classList.contains("hidden")) $("#popup-settings-status").textContent = "Google disconnected";
    chrome.runtime.sendMessage({ type: "DAYBEAM_REFRESH" });
    showCalendar(null);
  } finally {
    button.disabled = false;
  }
}

function showCalendar(token = null) {
  calendarPanel.classList.remove("hidden");
  document.body.classList.add("calendar-ready");
  setAccountStatus(token ? { name: "Google account" } : null);
  if (token) loadGoogleProfile(token);
  updateHello();
  loadCalendar();
}

async function connectCalendar() {
  const button = $("#account-connect-button");
  const hint = $("#account-menu-hint");
  if (!hasOAuthClient()) {
    hint.textContent = "Google sync is optional. To enable it, configure your own OAuth client ID in manifest.json and reload this local build. See README.md.";
    return;
  }
  button.disabled = true;
  button.textContent = "Connecting…";
  try {
    const token = await getToken(true);
    await clearCalendarCache();
    showCalendar(token);
    chrome.runtime.sendMessage({ type: "DAYBEAM_REFRESH" });
    closeAccountMenu();
  } catch (error) {
    hint.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Connect Google Calendar";
  }
}

async function loadGoogleProfile(token) {
  try {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error("Google profile is unavailable.");
    const profile = await response.json();
    const name = profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(" ") || profile.email?.split("@")[0]?.replace(/[._-]+/g, " ") || "Google account";
    setAccountStatus({ ...profile, name });
  } catch {
    setAccountStatus({ name: "Google account" });
  }
}

function setAccountStatus(profile) {
  const chip = $("#account-status");
  const name = $("#account-name");
  const avatar = $("#account-avatar");
  const menuName = $("#account-menu-name");
  const menuEmail = $("#account-menu-email");
  if (!profile) {
    chip.disabled = false;
    chip.classList.add("disconnected");
    chip.classList.remove("connected");
    $("#account-state-dot").classList.add("disconnected-dot");
    name.textContent = "Not connected";
    avatar.textContent = "?";
    menuName.textContent = "Not connected";
    menuEmail.textContent = "";
    $("#account-menu-hint").textContent = "Events stay on this device until Google Calendar is connected.";
    $("#account-menu-hint").classList.remove("hidden");
    $("#account-connect-button").classList.remove("hidden");
    $("#account-logout-button").classList.add("hidden");
    chip.title = "Not connected to Google Calendar";
    chip.setAttribute("aria-label", "Not connected to Google Calendar");
    return;
  }
  const displayName = profile.name || "Google account";
  const initials = displayName.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]?.toUpperCase() || "").join("");
  chip.disabled = false;
  chip.classList.remove("disconnected");
  chip.classList.add("connected");
  $("#account-state-dot").classList.remove("disconnected-dot");
  name.textContent = displayName;
  avatar.textContent = initials || "G";
  menuName.textContent = displayName;
  menuEmail.textContent = profile.email || "Google Calendar account";
  $("#account-menu-hint").classList.add("hidden");
  $("#account-connect-button").classList.add("hidden");
  $("#account-logout-button").classList.remove("hidden");
  chip.title = profile.email ? `Connected as ${profile.email}` : "Connected to Google Calendar";
  chip.setAttribute("aria-label", chip.title);
}

function toggleAccountMenu() {
  const chip = $("#account-status");
  if (chip.disabled) return;
  closeViewMenu();
  closeHolidayMenu();
  closeDatePicker();
  const menu = $("#account-menu");
  const isOpen = menu.classList.toggle("hidden") === false;
  chip.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) $("#account-logout-button").focus({ preventScroll: true });
}

function closeAccountMenu() {
  $("#account-menu").classList.add("hidden");
  $("#account-status").setAttribute("aria-expanded", "false");
}

function onViewClick(event) {
  const button = event.target.closest("button[data-view]");
  if (!button) return;
  state.view = button.dataset.view;
  state.settings.defaultView = state.view;
  chrome.storage.local.set({ settings: state.settings });
  closeViewMenu();
  setActiveViewButton();
  loadCalendar({ instant: true });
}

function toggleViewMenu() {
  const menu = $("#view-switcher");
  const button = $("#view-menu-button");
  const isOpen = menu.classList.toggle("hidden") === false;
  button.setAttribute("aria-expanded", String(isOpen));
}

function closeViewMenu() {
  $("#view-switcher").classList.add("hidden");
  $("#view-menu-button").setAttribute("aria-expanded", "false");
}

function toggleHolidayMenu() {
  const isOpen = !$("#holiday-menu").classList.contains("hidden");
  closeViewMenu();
  if (isOpen) closeHolidayMenu();
  else {
    $("#holiday-menu").classList.remove("hidden");
    $("#holiday-menu").setAttribute("aria-hidden", "false");
    $("#holiday-menu-button").setAttribute("aria-expanded", "true");
  }
}

function closeHolidayMenu() {
  $("#holiday-menu").classList.add("hidden");
  $("#holiday-menu").setAttribute("aria-hidden", "true");
  $("#holiday-menu-button").setAttribute("aria-expanded", "false");
}

function syncHolidayMenu() {
  const selected = new Set(state.settings.holidayCalendars || []);
  document.querySelectorAll("[data-holiday-calendar]").forEach((input) => {
    input.checked = selected.has(input.dataset.holidayCalendar);
  });
  const count = selected.size;
  $("#holiday-menu-summary").textContent = count ? count + " " + (count === 1 ? "calendar" : "calendars") + " selected" : "None selected";
  $("#holiday-menu-button").classList.toggle("has-holidays", count > 0);
  $("#holiday-menu-button").title = count ? count + " holiday " + (count === 1 ? "calendar" : "calendars") + " selected" : "Choose holiday calendars";
}

async function onHolidayCalendarChange(event) {
  const input = event.target.closest("[data-holiday-calendar]");
  if (!input) return;
  state.settings.holidayCalendars = Array.from(
    document.querySelectorAll("[data-holiday-calendar]:checked"),
    (checkbox) => checkbox.dataset.holidayCalendar
  );
  syncHolidayMenu();
  await chrome.storage.local.set({ settings: state.settings });
  loadCalendar();
}

function toggleDatePicker() {
  if (datePicker.classList.contains("hidden")) openDatePicker();
  else closeDatePicker();
}

function openDatePicker() {
  $("#date-picker-year").value = String(state.activeDate.getFullYear());
  renderDatePickerMonths();
  datePicker.classList.remove("hidden");
  datePicker.setAttribute("aria-hidden", "false");
  $("#period-label").setAttribute("aria-expanded", "true");
}

function closeDatePicker() {
  datePicker.classList.add("hidden");
  datePicker.setAttribute("aria-hidden", "true");
  $("#period-label").setAttribute("aria-expanded", "false");
}

function readPickerYear() {
  const value = Number.parseInt($("#date-picker-year").value, 10);
  const fallback = state.activeDate.getFullYear();
  return Math.max(1900, Math.min(2100, Number.isFinite(value) ? value : fallback));
}

function normalizePickerYear() {
  $("#date-picker-year").value = String(readPickerYear());
}

function changePickerYear(amount) {
  $("#date-picker-year").value = String(Math.max(1900, Math.min(2100, readPickerYear() + amount)));
  renderDatePickerMonths();
}

function renderDatePickerMonths() {
  const year = readPickerYear();
  const months = $("#date-picker-months");
  months.replaceChildren();
  for (let month = 0; month < 12; month += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "date-picker-month";
    button.textContent = new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(year, month, 1));
    button.classList.toggle("selected", year === state.activeDate.getFullYear() && month === state.activeDate.getMonth());
    const now = new Date();
    button.classList.toggle("current", year === now.getFullYear() && month === now.getMonth());
    button.addEventListener("click", () => {
      const keepCurrentView = state.view === "agenda" || state.view === "month-scroll";
      state.activeDate = new Date(readPickerYear(), month, 1);
      if (!keepCurrentView) state.view = "month";
      setActiveViewButton();
      closeDatePicker();
      loadCalendar({ instant: true, preserveOnMiss: state.view === "month-scroll" });
    });
    months.append(button);
  }
}

function setActiveViewButton() {
  const period = state.view === "month" || state.view === "month-scroll" ? "month" : state.view === "year" ? "year" : state.view === "week" ? "week" : state.view === "day" ? "day" : "period";
  $("#previous-button").setAttribute("aria-label", `Previous ${period}`);
  $("#next-button").setAttribute("aria-label", `Next ${period}`);
  document.querySelectorAll("#view-switcher button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
}

function movePeriod(direction) {
  if (state.view === "month" || state.view === "month-scroll" || state.view === "year") {
    state.activeDate = new Date(state.activeDate.getFullYear() + (state.view === "year" ? direction : 0), state.activeDate.getMonth() + (state.view !== "year" ? direction : 0), 1);
  } else if (state.view === "week") {
    state.activeDate = addDays(state.activeDate, 7 * direction);
  } else if (state.view === "day") {
    state.activeDate = addDays(state.activeDate, direction);
  } else {
    state.activeDate = addDays(state.activeDate, 7 * direction);
  }
  loadCalendar({ instant: true, preserveOnMiss: state.view === "month-scroll" });
}

function getRange() {
  const date = state.activeDate;
  if (state.view === "month") {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    return { start, end: addDays(start, 42) };
  }
  if (state.view === "month-scroll") {
    const firstMonth = addMonths(new Date(date.getFullYear(), date.getMonth(), 1), -6);
    const lastMonth = addMonths(firstMonth, 12);
    const first = addDays(firstMonth, -firstMonth.getDay());
    const lastFirst = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
    const last = addDays(lastFirst, -lastFirst.getDay());
    return { start: first, end: addDays(last, 42) };
  }
  if (state.view === "week") {
    const start = addDays(startOfDay(date), -date.getDay());
    return { start, end: addDays(start, 7) };
  }
  if (state.view === "day") {
    const start = startOfDay(date);
    return { start, end: addDays(start, 1) };
  }
  if (state.view === "year") {
    return { start: new Date(date.getFullYear(), 0, 1), end: new Date(date.getFullYear() + 1, 0, 1) };
  }
  const start = startOfDay(state.activeDate);
  return { start, end: addDays(start, 15) };
}

async function loadCalendar({ instant = false, preserveOnMiss = false } = {}) {
  const loadId = ++state.loadId;
  const range = getRange();
  const cacheKey = state.view + "|" + range.start.getTime() + "|" + range.end.getTime() + "|" + state.settings.holidayCalendars.slice().sort().join(",");
  const cached = state.calendarCache.get(cacheKey);
  state.range = range;
  updateHello();
  updatePeriodLabel();
  $("#calendar-error").classList.add("hidden");
  $("#sync-indicator").textContent = "Syncing…";
  if (cached) {
    state.events = cached.events;
    state.holidayEvents = cached.holidayEvents;
    renderCalendar();
  } else if (instant) {
    if (!preserveOnMiss) {
      state.events = [];
      state.holidayEvents = [];
    }
    renderCalendar();
  } else {
    content.innerHTML = '<div class="empty-state"><div class="empty-orbit">✦</div><strong>Finding your plans</strong><p>One moment while we sync.</p></div>';
  }
  state.loading = true;
  try {
    const connected = await hasGoogleAccount();
    const [events, holidays] = await Promise.all([
      listEvents(range.start, range.end),
      listSelectedHolidayEvents(range.start, range.end)
    ]);
    if (loadId !== state.loadId) return;
    state.events = events;
    state.holidayEvents = holidays.events;
    state.calendarCache.set(cacheKey, { events, holidayEvents: holidays.events });
    state.loading = false;
    $("#sync-indicator").textContent = connected ? "Just synced" : "Not connected";
    $("#connection-label").textContent = connected ? "Synced with Google Calendar" : "Not connected · Local only";
    $("#connection-dot").classList.toggle("disconnected-dot", !connected);
    if (holidays.errors.length) {
      $("#calendar-error").textContent = "Some holiday calendars could not be loaded: " + holidays.errors.join(", ") + ".";
      $("#calendar-error").classList.remove("hidden");
    }
    renderCalendar();
  } catch (error) {
    if (loadId !== state.loadId) return;
    state.loading = false;
    $("#sync-indicator").textContent = "Offline";
    $("#connection-label").textContent = "Offline · Last data may be out of date";
    $("#connection-dot").classList.add("disconnected-dot");
    $("#calendar-error").textContent = error.message;
    $("#calendar-error").classList.remove("hidden");
    if (!instant && !cached) {
      content.innerHTML = '<div class="empty-state"><div class="empty-orbit">↻</div><strong>Calendar is unavailable</strong><p>Check your connection, then refresh.</p></div>';
    }
  }
}

async function listSelectedHolidayEvents(start, end) {
  const selectedCalendars = HOLIDAY_CALENDARS.filter((calendar) => state.settings.holidayCalendars.includes(calendar.key));
  const results = await Promise.all(selectedCalendars.map(async (calendar) => {
    try {
      const events = await listPublicHolidayEvents(start, end, calendar.calendarId, calendar.key);
      return {
        calendar,
        events: events.map((event) => ({ ...event, daybeamHolidayCategory: calendar.key })),
        error: null
      };
    } catch (error) {
      return { calendar, events: [], error };
    }
  }));
  return {
    events: results.flatMap((result) => result.events),
    errors: results.filter((result) => result.error).map((result) => result.calendar.name)
  };
}

function updateHello() {
  document.body.classList.toggle("month-mode", state.view === "month");
  document.body.classList.toggle("month-scroll-mode", state.view === "month-scroll");
  document.body.classList.toggle("week-mode", state.view === "week");
  document.body.classList.toggle("day-mode", state.view === "day");
  document.body.classList.toggle("agenda-mode", state.view === "agenda");
  const date = new Date();
  $("#hello-date").textContent = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(date).toUpperCase();
  $("#welcome-title").textContent = state.view === "agenda" ? "Coming up" : "Your day";
}

function updatePeriodLabel() {
  const date = state.activeDate;
  let label;
  if (state.view === "agenda") label = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
  else if (state.view === "year") label = String(date.getFullYear());
  else if (state.view === "month" || state.view === "month-scroll") label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
  else if (state.view === "week") {
    const start = addDays(startOfDay(date), -date.getDay());
    const end = addDays(start, 6);
    const startMonth = new Intl.DateTimeFormat("en-US", { month: "short" }).format(start);
    const endMonth = new Intl.DateTimeFormat("en-US", { month: "short" }).format(end);
    if (start.getFullYear() !== end.getFullYear()) {
      label = `${startMonth} ${start.getFullYear()} – ${endMonth} ${end.getFullYear()}`;
    } else {
      label = start.getMonth() === end.getMonth()
        ? new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(start)
        : `${startMonth} – ${endMonth} ${end.getFullYear()}`;
    }
  } else if (state.view === "day") {
    label = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(date);
  } else {
    label = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(date);
  }
  $("#period-label").textContent = label;
}

function renderCalendar() {
  updatePeriodLabel();
  content.replaceChildren();
  if (state.view === "month") renderMonth();
  else if (state.view === "month-scroll") renderMonthScroll();
  else if (state.view === "year") renderYear();
  else if (state.view === "day") renderDay();
  else if (state.view === "week") renderWeek();
  else renderAgenda();
}

function renderMonth() {
  content.append(buildMonthCalendar(state.activeDate));
}

function renderMonthScroll() {
  const list = document.createElement("div");
  list.className = "month-scroll-list";
  list.setAttribute("aria-label", "Months. Scroll up or down to change months.");
  const firstMonth = addMonths(new Date(state.activeDate.getFullYear(), state.activeDate.getMonth(), 1), -6);
  let activeSection = null;

  for (let index = 0; index < 13; index += 1) {
    const monthDate = addMonths(firstMonth, index);
    const section = document.createElement("section");
    section.className = "month-scroll-month";
    section.dataset.monthStart = String(monthDate.getTime());
    const heading = document.createElement("h2");
    heading.className = "month-scroll-heading";
    heading.textContent = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(monthDate);
    section.append(heading, buildMonthCalendar(monthDate, { monthScroll: true }));
    list.append(section);
    if (monthDate.getFullYear() === state.activeDate.getFullYear() && monthDate.getMonth() === state.activeDate.getMonth()) {
      activeSection = section;
    }
  }

  content.append(list);
  if (activeSection) {
    content.scrollTop += activeSection.getBoundingClientRect().top - content.getBoundingClientRect().top;
  }
}

function onMonthScroll() {
  if (state.view !== "month-scroll" || monthScrollFrame) return;
  monthScrollFrame = requestAnimationFrame(() => {
    monthScrollFrame = 0;
    if (state.view !== "month-scroll") return;
    const sections = Array.from(content.querySelectorAll(".month-scroll-month"));
    if (!sections.length) return;

    const top = content.getBoundingClientRect().top + 36;
    const index = Math.max(0, sections.findIndex((section) => section.getBoundingClientRect().bottom > top));
    const section = sections[index] || sections[sections.length - 1];
    const visibleMonth = new Date(Number(section.dataset.monthStart));
    if (visibleMonth.getFullYear() !== state.activeDate.getFullYear() || visibleMonth.getMonth() !== state.activeDate.getMonth()) {
      state.activeDate = visibleMonth;
      updatePeriodLabel();
    }

    if (!monthScrollRecenterPending && (index <= 1 || index >= sections.length - 2)) {
      monthScrollRecenterPending = true;
      requestAnimationFrame(() => {
        monthScrollRecenterPending = false;
        if (state.view === "month-scroll") loadCalendar({ instant: true, preserveOnMiss: true });
      });
    }
  });
}

function buildMonthCalendar(monthDate, { monthScroll = false } = {}) {
  const view = document.createElement("div");
  view.className = monthScroll ? "month-view month-scroll-calendar" : "month-view";
  const weekdays = document.createElement("div");
  weekdays.className = "month-weekdays";
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((day) => {
    const label = document.createElement("span");
    label.className = "weekday-label";
    label.textContent = day;
    weekdays.append(label);
  });
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  const grid = document.createElement("div");
  grid.className = "month-days-grid";
  for (let index = 0; index < 42; index += 1) {
    const date = addDays(start, index);
    const dayEvents = eventsForDate(date);
    const cell = document.createElement("article");
    cell.className = "month-day-cell";
    if (date.getMonth() !== monthDate.getMonth()) cell.classList.add("outside");
    if (sameLocalDay(date, new Date())) cell.classList.add("today");

    const heading = document.createElement("div");
    heading.className = "month-day-heading";
    const dayButton = document.createElement("button");
    dayButton.type = "button";
    dayButton.className = "month-day-number";
    dayButton.textContent = String(date.getDate());
    dayButton.setAttribute("aria-label", `Add an event on ${new Intl.DateTimeFormat("en-US", { dateStyle: "full" }).format(date)}`);
    dayButton.addEventListener("click", () => showQuickAdd("", date));
    heading.append(dayButton);
    cell.append(heading);
    cell.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      showQuickAdd("", date);
    });

    const events = document.createElement("div");
    events.className = "month-day-events";
    dayEvents.slice(0, 3).forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `month-event-chip ${eventTone(item)}`;
      chip.title = `${isAllDay(item) ? "" : `${formatTime(item)} `}${item.summary || "Untitled event"}`;
      chip.setAttribute("aria-label", chip.title);
      chip.textContent = `${isAllDay(item) ? "" : `${formatTime(item)} `}${item.summary || "Untitled event"}`;
      chip.addEventListener("click", () => openEvent(item));
      events.append(chip);
    });
    if (dayEvents.length > 3) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "month-more-events";
      more.textContent = `+ ${dayEvents.length - 3} more`;
      more.addEventListener("click", () => { state.activeDate = date; state.view = "day"; setActiveViewButton(); loadCalendar({ instant: true }); });
      events.append(more);
    }
    cell.append(events);
    grid.append(cell);
  }
  view.append(weekdays, grid);
  return view;
}

function renderDay() {
  const wrapper = document.createElement("section");
  wrapper.className = "day-view week-view";
  const date = startOfDay(state.activeDate);
  const today = startOfDay(new Date());

  const header = document.createElement("div");
  header.className = "week-header";
  header.append(document.createElement("div"));
  const dayButton = document.createElement("div");
  dayButton.className = "week-header-day is-selected";
  dayButton.setAttribute("role", "heading");
  dayButton.setAttribute("aria-level", "2");
  dayButton.setAttribute("aria-label", new Intl.DateTimeFormat("en-US", { dateStyle: "full" }).format(date));
  const dayNumber = document.createElement("span");
  dayNumber.className = "week-header-number";
  dayNumber.textContent = String(date.getDate());
  const weekday = document.createElement("span");
  weekday.className = "week-header-name";
  weekday.textContent = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
  dayButton.append(dayNumber, weekday);
  header.append(dayButton);

  const allDayRow = document.createElement("div");
  allDayRow.className = "week-all-day-row";
  const allDayLabel = document.createElement("div");
  allDayLabel.className = "week-all-day-label";
  allDayLabel.textContent = "All day";
  allDayRow.append(allDayLabel);
  const allDayCell = document.createElement("div");
  allDayCell.className = "week-all-day-cell";
  allDayCell.classList.toggle("is-today", sameLocalDay(date, today));
  const allDayEvents = eventsForDate(date).filter(isAllDay);
  allDayEvents.forEach((item) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `week-all-day-event ${eventTone(item)}`;
    chip.textContent = item.summary || "Untitled event";
    chip.title = item.summary || "Untitled event";
    chip.addEventListener("click", () => openEvent(item));
    allDayCell.append(chip);
  });
  allDayCell.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    showQuickAdd("", date);
  });
  allDayRow.append(allDayCell);

  const scrollArea = document.createElement("div");
  scrollArea.className = "week-scroll-area";
  scrollArea.setAttribute("aria-label", "Day schedule by hour");
  const timeGrid = document.createElement("div");
  timeGrid.className = "week-time-grid";
  const hourLabels = document.createElement("div");
  hourLabels.className = "week-hour-labels";
  for (let hour = 0; hour < 24; hour += 1) {
    const label = document.createElement("span");
    label.className = "week-hour-label";
    label.textContent = `${String(hour).padStart(2, "0")}:00`;
    label.style.top = `${hour * 50 + 4}px`;
    hourLabels.append(label);
  }
  timeGrid.append(hourLabels);

  const dayColumn = document.createElement("div");
  dayColumn.className = "week-day-column";
  dayColumn.classList.toggle("is-today", sameLocalDay(date, today));
  dayColumn.setAttribute("role", "group");
  dayColumn.setAttribute("aria-label", new Intl.DateTimeFormat("en-US", { dateStyle: "full" }).format(date));
  const dayEnd = addDays(date, 1);
  const timedEvents = eventsForDate(date).filter((item) => !isAllDay(item)).map((item) => ({
    item,
    start: new Date(Math.max(eventStart(item).getTime(), date.getTime())),
    end: new Date(Math.min(eventEnd(item).getTime(), dayEnd.getTime()))
  })).filter(({ start, end }) => end > start).sort((left, right) => left.start - right.start || left.end - right.end);

  let cluster = [];
  let clusterEnd = -Infinity;
  const clusters = [];
  for (const entry of timedEvents) {
    if (cluster.length && entry.start.getTime() >= clusterEnd) {
      clusters.push(cluster);
      cluster = [];
      clusterEnd = -Infinity;
    }
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.end.getTime());
  }
  if (cluster.length) clusters.push(cluster);
  for (const entries of clusters) {
    const laneEnds = [];
    for (const entry of entries) {
      let lane = laneEnds.findIndex((end) => end <= entry.start.getTime());
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = entry.end.getTime();
      entry.lane = lane;
    }
    entries.forEach((entry) => { entry.laneCount = laneEnds.length; });
  }

  timedEvents.forEach(({ item, start, end, lane, laneCount }) => {
    const eventButton = document.createElement("button");
    eventButton.type = "button";
    eventButton.className = `week-event ${eventTone(item)}`;
    const startMinutes = (start.getTime() - date.getTime()) / 60_000;
    const durationMinutes = Math.max(20, (end.getTime() - start.getTime()) / 60_000);
    eventButton.style.top = `${startMinutes * 50 / 60}px`;
    eventButton.style.height = `${Math.max(22, durationMinutes * 50 / 60)}px`;
    eventButton.style.left = `calc(${lane / laneCount * 100}% + 2px)`;
    eventButton.style.width = `calc(${100 / laneCount}% - 4px)`;
    const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(eventStart(item));
    const timeLabel = document.createElement("span");
    timeLabel.className = "week-event-time";
    timeLabel.textContent = time;
    const title = document.createElement("span");
    title.className = "week-event-title";
    title.textContent = item.summary || "Untitled event";
    eventButton.title = `${time} ${title.textContent}`;
    eventButton.append(timeLabel, title);
    eventButton.addEventListener("click", () => openEvent(item));
    dayColumn.append(eventButton);
  });

  if (sameLocalDay(date, today)) {
    const now = new Date();
    const line = document.createElement("div");
    line.className = "week-current-time-line";
    line.style.top = `${(now.getHours() * 60 + now.getMinutes()) * 50 / 60}px`;
    dayColumn.append(line);
    const marker = document.createElement("div");
    marker.className = "week-current-time-marker";
    marker.style.top = line.style.top;
    timeGrid.append(marker);
  }

  dayColumn.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    const minutes = Math.max(0, Math.min(1439, (event.clientY - dayColumn.getBoundingClientRect().top) * 60 / 50));
    const rounded = Math.round(minutes / 30) * 30;
    const hour = Math.min(23, Math.floor(rounded / 60));
    const minute = rounded >= 1440 ? 30 : rounded % 60;
    showQuickAdd("", date, `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  });
  dayColumn.addEventListener("pointermove", (event) => {
    const y = Math.max(0, Math.min(1199, event.clientY - dayColumn.getBoundingClientRect().top));
    const slotTop = `${Math.floor(y / 25) * 25}px`;
    if (dayColumn.style.getPropertyValue("--hover-slot-top") !== slotTop) {
      dayColumn.style.setProperty("--hover-slot-top", slotTop);
    }
    dayColumn.classList.add("is-hovered");
  });
  dayColumn.addEventListener("pointerleave", () => {
    dayColumn.classList.remove("is-hovered");
    dayColumn.style.removeProperty("--hover-slot-top");
  });
  timeGrid.append(dayColumn);
  scrollArea.append(timeGrid);
  const now = new Date();
  scrollArea.scrollTop = sameLocalDay(date, today) ? Math.max(0, now.getHours() - 1) * 50 : 8 * 50;
  wrapper.append(header, allDayRow, scrollArea);
  content.append(wrapper);
}

function renderWeek() {
  const wrapper = document.createElement("section");
  wrapper.className = "week-view";
  const first = addDays(startOfDay(state.activeDate), -state.activeDate.getDay());
  const today = startOfDay(new Date());
  const dates = Array.from({ length: 7 }, (_, index) => addDays(first, index));

  const header = document.createElement("div");
  header.className = "week-header";
  header.append(document.createElement("div"));
  for (const date of dates) {
    const dayButton = document.createElement("button");
    dayButton.type = "button";
    dayButton.className = "week-header-day";
    dayButton.classList.toggle("is-today", sameLocalDay(date, today));
    dayButton.setAttribute("aria-label", new Intl.DateTimeFormat("en-US", { dateStyle: "full" }).format(date));
    const dayNumber = document.createElement("span");
    dayNumber.className = "week-header-number";
    dayNumber.textContent = String(date.getDate());
    const weekday = document.createElement("span");
    weekday.className = "week-header-name";
    weekday.textContent = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
    dayButton.append(dayNumber, weekday);
    dayButton.addEventListener("click", () => {
      state.activeDate = date;
      state.view = "day";
      setActiveViewButton();
      loadCalendar({ instant: true });
    });
    header.append(dayButton);
  }

  const allDayRow = document.createElement("div");
  allDayRow.className = "week-all-day-row";
  const allDayLabel = document.createElement("div");
  allDayLabel.className = "week-all-day-label";
  allDayLabel.textContent = "All day";
  allDayRow.append(allDayLabel);
  for (const date of dates) {
    const cell = document.createElement("div");
    cell.className = "week-all-day-cell";
    cell.classList.toggle("is-today", sameLocalDay(date, today));
    const dayEvents = eventsForDate(date).filter(isAllDay);
    dayEvents.slice(0, 2).forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `week-all-day-event ${eventTone(item)}`;
      chip.textContent = item.summary || "Untitled event";
      chip.title = item.summary || "Untitled event";
      chip.addEventListener("click", () => openEvent(item));
      cell.append(chip);
    });
    if (dayEvents.length > 2) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "week-all-day-more";
      more.textContent = `+${dayEvents.length - 2} more`;
      more.addEventListener("click", () => {
        state.activeDate = date;
        state.view = "day";
        setActiveViewButton();
        loadCalendar({ instant: true });
      });
      cell.append(more);
    }
    cell.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      showQuickAdd("", date);
    });
    allDayRow.append(cell);
  }

  const scrollArea = document.createElement("div");
  scrollArea.className = "week-scroll-area";
  scrollArea.setAttribute("aria-label", "Week schedule by hour");
  const timeGrid = document.createElement("div");
  timeGrid.className = "week-time-grid";
  const hourLabels = document.createElement("div");
  hourLabels.className = "week-hour-labels";
  for (let hour = 0; hour < 24; hour += 1) {
    const label = document.createElement("span");
    label.className = "week-hour-label";
    label.textContent = `${String(hour).padStart(2, "0")}:00`;
    label.style.top = `${hour * 50 + 4}px`;
    hourLabels.append(label);
  }
  timeGrid.append(hourLabels);

  dates.forEach((date) => {
    const column = document.createElement("div");
    column.className = "week-day-column";
    column.classList.toggle("is-today", sameLocalDay(date, today));
    column.setAttribute("role", "group");
    column.setAttribute("aria-label", new Intl.DateTimeFormat("en-US", { dateStyle: "full" }).format(date));
    const dayStart = startOfDay(date);
    const dayEnd = addDays(dayStart, 1);
    const timedEvents = eventsForDate(date).filter((item) => !isAllDay(item)).map((item) => {
      const start = new Date(Math.max(eventStart(item).getTime(), dayStart.getTime()));
      const end = new Date(Math.min(eventEnd(item).getTime(), dayEnd.getTime()));
      return { item, start, end };
    }).filter(({ start, end }) => end > start).sort((left, right) => left.start - right.start || left.end - right.end);

    let cluster = [];
    let clusterEnd = -Infinity;
    const clusters = [];
    for (const entry of timedEvents) {
      if (cluster.length && entry.start.getTime() >= clusterEnd) {
        clusters.push(cluster);
        cluster = [];
        clusterEnd = -Infinity;
      }
      cluster.push(entry);
      clusterEnd = Math.max(clusterEnd, entry.end.getTime());
    }
    if (cluster.length) clusters.push(cluster);

    for (const entries of clusters) {
      const laneEnds = [];
      for (const entry of entries) {
        let lane = laneEnds.findIndex((end) => end <= entry.start.getTime());
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = entry.end.getTime();
        entry.lane = lane;
      }
      entries.forEach((entry) => { entry.laneCount = laneEnds.length; });
    }

    timedEvents.forEach(({ item, start, end, lane, laneCount }) => {
      const eventButton = document.createElement("button");
      eventButton.type = "button";
      eventButton.className = `week-event ${eventTone(item)}`;
      const startMinutes = (start.getTime() - dayStart.getTime()) / 60_000;
      const durationMinutes = Math.max(20, (end.getTime() - start.getTime()) / 60_000);
      eventButton.style.top = `${startMinutes * 50 / 60}px`;
      eventButton.style.height = `${Math.max(22, durationMinutes * 50 / 60)}px`;
      eventButton.style.left = `calc(${lane / laneCount * 100}% + 2px)`;
      eventButton.style.width = `calc(${100 / laneCount}% - 4px)`;
      const time = document.createElement("span");
      time.className = "week-event-time";
      const eventTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(eventStart(item));
      time.textContent = eventTime;
      const title = document.createElement("span");
      title.className = "week-event-title";
      title.textContent = item.summary || "Untitled event";
      eventButton.title = `${eventTime} ${title.textContent}`;
      eventButton.append(time, title);
      eventButton.addEventListener("click", () => openEvent(item));
      column.append(eventButton);
    });

    if (sameLocalDay(date, today)) {
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const line = document.createElement("div");
      line.className = "week-current-time-line";
      line.style.top = `${minutes * 50 / 60}px`;
      column.append(line);
    }

    column.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      const minutesFromMidnight = Math.max(0, Math.min(1439, (event.clientY - column.getBoundingClientRect().top) * 60 / 50));
      const roundedMinutes = Math.round(minutesFromMidnight / 30) * 30;
      const hour = Math.min(23, Math.floor(roundedMinutes / 60));
      const minute = roundedMinutes >= 1440 ? 30 : roundedMinutes % 60;
      showQuickAdd("", date, `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    });
    column.addEventListener("pointermove", (event) => {
      const y = Math.max(0, Math.min(1199, event.clientY - column.getBoundingClientRect().top));
      const slotTop = `${Math.floor(y / 25) * 25}px`;
      if (column.style.getPropertyValue("--hover-slot-top") !== slotTop) {
        column.style.setProperty("--hover-slot-top", slotTop);
      }
      column.classList.add("is-hovered");
    });
    column.addEventListener("pointerleave", () => {
      column.classList.remove("is-hovered");
      column.style.removeProperty("--hover-slot-top");
    });
    timeGrid.append(column);
  });

  const now = new Date();
  const weekEnd = addDays(first, 7);
  if (now >= first && now < weekEnd) {
    const marker = document.createElement("div");
    marker.className = "week-current-time-marker";
    marker.style.top = `${(now.getHours() * 60 + now.getMinutes()) * 50 / 60}px`;
    timeGrid.append(marker);
  }

  scrollArea.append(timeGrid);
  const scrollHour = now >= first && now < weekEnd ? Math.max(0, now.getHours() - 1) : 8;
  scrollArea.scrollTop = scrollHour * 50;
  wrapper.append(header, allDayRow, scrollArea);
  content.append(wrapper);
}

function renderAgenda() {
  const today = startOfDay(new Date());
  const start = startOfDay(state.activeDate);
  const end = state.range?.end || addDays(start, 15);
  const wrapper = document.createElement("div");
  wrapper.className = "agenda-list";
  let lastVisibleMonth = start.getMonth();
  let lastVisibleYear = start.getFullYear();
  let firstVisibleDay = true;

  for (let date = start; date < end; date = addDays(date, 1)) {
    const events = eventsForDate(date);
    const isStartDate = sameLocalDay(date, start);
    if (!isStartDate && !events.length) continue;

    if (!firstVisibleDay && (date.getMonth() !== lastVisibleMonth || date.getFullYear() !== lastVisibleYear)) {
      const divider = document.createElement("div");
      divider.className = "agenda-month-divider";
      const month = document.createElement("span");
      month.textContent = date.getFullYear() === lastVisibleYear
        ? new Intl.DateTimeFormat("en-US", { month: "short" }).format(date)
        : new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
      divider.append(month, document.createElement("span"));
      wrapper.append(divider);
    }

    const row = document.createElement("section");
    row.className = "agenda-day-row";
    row.classList.toggle("is-today", sameLocalDay(date, today));
    const dateButton = document.createElement("button");
    dateButton.type = "button";
    dateButton.className = "agenda-date-button";
    dateButton.setAttribute("aria-label", new Intl.DateTimeFormat("en-US", { dateStyle: "full" }).format(date));
    const number = document.createElement("span");
    number.className = "agenda-date-number";
    number.textContent = String(date.getDate());
    const weekday = document.createElement("span");
    weekday.className = "agenda-date-weekday";
    weekday.textContent = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
    dateButton.append(number, weekday);
    dateButton.addEventListener("click", () => {
      state.activeDate = date;
      state.view = "day";
      setActiveViewButton();
      loadCalendar({ instant: true });
    });

    const dayContent = document.createElement("div");
    dayContent.className = "agenda-day-content";
    if (!events.length) {
      const empty = document.createElement("div");
      empty.className = "agenda-empty";
      empty.textContent = "Nothing planned.";
      dayContent.append(empty);
    } else {
      const eventList = document.createElement("div");
      eventList.className = "agenda-events";
      events.forEach((item) => {
        const eventButton = document.createElement("button");
        eventButton.type = "button";
        eventButton.className = `agenda-event ${eventTone(item)}`;
        eventButton.textContent = item.summary || "Untitled event";
        eventButton.title = item.summary || "Untitled event";
        eventButton.addEventListener("click", () => openEvent(item));
        eventList.append(eventButton);
      });
      dayContent.append(eventList);
    }

    row.append(dateButton, dayContent);
    wrapper.append(row);
    lastVisibleMonth = date.getMonth();
    lastVisibleYear = date.getFullYear();
    firstVisibleDay = false;
  }
  content.append(wrapper);
}

function renderYear() {
  const grid = document.createElement("div");
  grid.className = "year-grid";
  const events = allCalendarEvents();
  for (let month = 0; month < 12; month += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "year-month";
    const title = document.createElement("strong");
    const date = new Date(state.activeDate.getFullYear(), month, 1);
    title.textContent = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
    const count = document.createElement("span");
    const number = events.filter((event) => eventStart(event).getFullYear() === state.activeDate.getFullYear() && eventStart(event).getMonth() === month).length;
    count.textContent = `${number} ${number === 1 ? "event" : "events"}`;
    button.append(title, count);
    button.addEventListener("click", () => { state.activeDate = date; state.view = "month"; setActiveViewButton(); loadCalendar(); });
    grid.append(button);
  }
  content.append(grid);
}

function eventsForDate(date) {
  const start = startOfDay(date);
  const end = addDays(start, 1);
  return allCalendarEvents().filter((event) => eventStart(event) < end && eventEnd(event) > start);
}

function allCalendarEvents() {
  return [...state.events, ...state.holidayEvents].sort((left, right) => eventStart(left) - eventStart(right));
}

function eventTone(event) {
  const palette = ["blue", "green", "purple", "coral", "gold", "teal"];
  const holidayTones = { jewish: "gold", christian: "blue", islamic: "green" };
  if (event.daybeamHolidayCategory) return "tone-" + (holidayTones[event.daybeamHolidayCategory] || "blue");
  if (event.colorId) {
    const colorIndex = Number.parseInt(event.colorId, 10);
    if (Number.isFinite(colorIndex)) return `tone-${palette[(colorIndex - 1) % palette.length]}`;
  }
  const title = event.summary || "";
  const hash = Array.from(title).reduce((value, character) => value + character.charCodeAt(0), 0);
  return `tone-${palette[hash % palette.length]}`;
}

function openEvent(event) {
  if (event.localOnly) {
    if (confirm(`“${event.summary || "Untitled event"}” is saved only on this device. Delete it?`)) {
      deleteLocalEvent(event.id).then(() => loadCalendar({ instant: true }));
    }
    return;
  }
  const destination = typeof event.htmlLink === "string" && event.htmlLink.startsWith("https://")
    ? event.htmlLink
    : "https://calendar.google.com/calendar/u/0/r";
  chrome.tabs.create({ url: destination });
}

function eventList(events, emptyMessage) {
  const list = document.createElement("div");
  list.className = "event-list";
  if (!events.length) {
    if (emptyMessage) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const icon = document.createElement("div");
      icon.className = "empty-orbit";
      icon.textContent = "✦";
      const title = document.createElement("strong");
      title.textContent = emptyMessage;
      const note = document.createElement("p");
      note.textContent = "Enjoy the breathing room, or add something new.";
      empty.append(icon, title, note);
      list.append(empty);
    }
    return list;
  }
  for (const item of events) list.append(eventCard(item));
  return list;
}

function eventCard(event) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "event-card";
  const accent = document.createElement("span");
  accent.className = "event-accent";
  const body = document.createElement("span");
  body.className = "event-body";
  const title = document.createElement("span");
  title.className = "event-title";
  title.textContent = event.summary || "Untitled event";
  const meta = document.createElement("span");
  meta.className = "event-meta";
  const time = document.createElement("span");
  time.textContent = formatTime(event);
  meta.append(time);
  if (event.localOnly) {
    const localTag = document.createElement("span");
    localTag.textContent = "· On this device";
    meta.append(localTag);
  }
  if (event.location) {
    const location = document.createElement("span");
    location.className = "event-location";
    location.textContent = `· ${event.location}`;
    meta.append(location);
  }
  body.append(title, meta);
  card.append(accent, body);
  card.addEventListener("click", () => openEvent(event));
  return card;
}

function showQuickAdd(title = "", date = state.activeDate, time = nextHalfHour()) {
  quickAddOverlay.classList.remove("hidden");
  quickAddOverlay.setAttribute("aria-hidden", "false");
  $("#event-title").value = title;
  $("#event-date").value = toDateInput(date || new Date());
  $("#event-time").value = time;
  $("#event-location").value = "";
  $("#add-status").textContent = "";
  $("#event-title").focus();
}

function hideQuickAdd() {
  quickAddOverlay.classList.add("hidden");
  quickAddOverlay.setAttribute("aria-hidden", "true");
}

async function saveEvent(event) {
  event.preventDefault();
  const status = $("#add-status");
  const button = $("#quick-add-form button[type=submit]");
  status.className = "form-status";
  status.textContent = "Saving…";
  button.disabled = true;
  try {
    const created = await createEvent({
      title: $("#event-title").value,
      date: $("#event-date").value,
      time: $("#event-time").value,
      duration: $("#event-duration").value,
      location: $("#event-location").value
    });
    status.textContent = created.localOnly ? "Saved on this device · Not synced" : "Added to Google Calendar";
    chrome.runtime.sendMessage({ type: "DAYBEAM_REFRESH" });
    setTimeout(() => {
      hideQuickAdd();
      loadCalendar();
    }, 450);
  } catch (error) {
    status.classList.add("error");
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextHalfHour() {
  const date = new Date();
  date.setMinutes(date.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (date.getMinutes() === 0) date.setHours(date.getHours() + 1);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
