import { createEvent, hasGoogleAccount, hasOAuthClient } from "./shared/calendar.js";

const $ = (selector) => document.querySelector(selector);
const form = $("#quick-add-form");
const params = new URLSearchParams(location.search);

document.addEventListener("DOMContentLoaded", initialize);
form.addEventListener("submit", save);

async function initialize() {
  const now = new Date();
  const rounded = new Date(now);
  rounded.setMinutes(now.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (now.getMinutes() >= 30) rounded.setHours(rounded.getHours() + 1);
  $("#event-date").value = dateInput(now);
  $("#event-time").value = `${String(rounded.getHours()).padStart(2, "0")}:${String(rounded.getMinutes()).padStart(2, "0")}`;
  const draft = params.get("title") || "";
  if (draft) {
    const parsed = parseDraft(draft, now);
    $("#event-title").value = parsed.title || draft;
    if (parsed.date) $("#event-date").value = dateInput(parsed.date);
    if (parsed.time) $("#event-time").value = parsed.time;
  } else {
    $("#event-title").focus();
  }
  if (draft) $("#event-date").focus();
  const connected = await hasGoogleAccount();
  if (!connected && !hasOAuthClient()) {
    $("#add-status").textContent = "Not connected · saving here will stay on this device.";
  } else if (!connected) {
    $("#add-status").textContent = "Google will ask you to connect when you save.";
  }
}

async function save(event) {
  event.preventDefault();
  const button = $("#save-button");
  const status = $("#add-status");
  button.disabled = true;
  status.className = "form-status";
  status.textContent = "Saving…";
  try {
    const created = await createEvent({
      title: $("#event-title").value,
      date: $("#event-date").value,
      time: $("#event-time").value,
      duration: $("#event-duration").value,
      location: $("#event-location").value
    });
    status.textContent = created.localOnly ? "Saved on this device · Not synced" : "Added to Google Calendar";
    if (created.htmlLink) setTimeout(() => { location.href = created.htmlLink; }, 650);
    chrome.runtime.sendMessage({ type: "DAYBEAM_REFRESH" });
  } catch (error) {
    status.classList.add("error");
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function dateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDraft(raw, now) {
  let title = raw;
  let date = null;
  let time = null;

  const relativeHours = raw.match(/\bin\s+(\d{1,2})\s*(hours?|hrs?)\b/i);
  if (relativeHours) {
    const start = new Date(now.getTime() + Number(relativeHours[1]) * 60 * 60_000);
    date = start;
    time = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
    title = title.replace(relativeHours[0], " ");
  }

  const isoDate = title.match(/\b20\d{2}-\d{1,2}-\d{1,2}\b/);
  if (isoDate) {
    const candidate = new Date(`${isoDate[0]}T00:00:00`);
    if (!Number.isNaN(candidate.getTime())) date = candidate;
    title = title.replace(isoDate[0], " ");
  } else {
    const relativeDay = title.match(/\b(today|tomorrow)\b/i);
    if (relativeDay) {
      date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (relativeDay[1].toLowerCase() === "tomorrow" ? 1 : 0));
      title = title.replace(relativeDay[0], " ");
    } else {
      const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const weekday = title.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
      if (weekday) {
        const target = weekdays.indexOf(weekday[1].toLowerCase());
        const offset = (target - now.getDay() + 7) % 7 || 7;
        date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
        title = title.replace(weekday[0], " ");
      }
    }
  }

  const clock = title.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i)
    || title.match(/\b(?:at\s*)?([01]?\d|2[0-3]):([0-5]\d)\b/i);
  if (clock) {
    let hour = Number(clock[1]);
    const minute = Number(clock[2] || 0);
    const meridiem = clock[3]?.toLowerCase().replaceAll(".", "");
    if (meridiem) {
      if (meridiem.startsWith("p") && hour < 12) hour += 12;
      if (meridiem.startsWith("a") && hour === 12) hour = 0;
    }
    time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    title = title.replace(clock[0], " ");
  }

  title = title.replace(/\b(at|on)\b/gi, " ").replace(/[\s,]+/g, " ").trim();
  return { title, date, time };
}
