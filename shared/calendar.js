const API_ROOT = "https://www.googleapis.com/calendar/v3";
const CALENDAR_CACHE_PREFIX = "daybeam.calendar.cache.v1:";
const CALENDAR_CACHE_EPOCH_KEY = "daybeam.calendar.cache.epoch";
const CALENDAR_CACHE_TTL_MS = 5 * 60_000;
const MAX_CALENDAR_CACHE_ENTRIES = 20;
const MAX_CALENDAR_CACHE_BYTES = 4 * 1024 * 1024;
const MAX_CALENDAR_CACHE_ENTRY_BYTES = 512 * 1024;
const LOCAL_EVENTS_KEY = "daybeam.localEvents";
const PUBLIC_HOLIDAY_CACHE_PREFIX = "daybeam.publicHoliday.ics.v1:";
const PUBLIC_HOLIDAY_CACHE_TTL_MS = 24 * 60 * 60_000;
const pendingCalendarRequests = new Map();
const memoryCalendarCache = new Map();
const memoryHolidayFeedCache = new Map();
let localCalendarCacheEpoch = 0;

export function getToken(interactive = false) {
  if (!hasOAuthClient()) {
    return Promise.reject(new Error("Google sync is not configured for this build. Add your own OAuth client ID to manifest.json."));
  }
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      const error = chrome.runtime.lastError;
      if (error || !token) {
        reject(new Error(error?.message || "Google sign-in is required."));
        return;
      }
      resolve(token);
    });
  });
}

export function hasOAuthClient() {
  return Boolean(chrome.runtime.getManifest().oauth2?.client_id);
}

export async function hasGoogleAccount() {
  if (!hasOAuthClient()) return false;
  try {
    await getToken(false);
    return true;
  } catch {
    return false;
  }
}

async function calendarFetch(path, options = {}, interactive = false) {
  const token = await getToken(interactive);
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (response.status === 401) {
    chrome.identity.removeCachedAuthToken({ token });
    throw new Error("Your Google session expired. Reconnect and try again.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error?.message || `Calendar request failed (${response.status}).`);
  }
  return response.json();
}

export async function listEvents(start, end, interactive = false) {
  const localEvents = await getLocalEvents(start, end);
  if (!await hasGoogleAccount()) return localEvents;
  const googleEvents = await listCalendarEvents(start, end, "primary", interactive);
  return [...googleEvents, ...localEvents].sort((left, right) => eventStart(left) - eventStart(right));
}

export async function getLocalEvents(start, end) {
  const stored = await chrome.storage.local.get(LOCAL_EVENTS_KEY);
  return (stored[LOCAL_EVENTS_KEY] || []).filter((event) => {
    const date = eventStart(event);
    return date >= start && date < end;
  });
}

export async function deleteLocalEvent(eventId) {
  const stored = await chrome.storage.local.get(LOCAL_EVENTS_KEY);
  const events = (stored[LOCAL_EVENTS_KEY] || []).filter((event) => event.id !== eventId);
  await chrome.storage.local.set({ [LOCAL_EVENTS_KEY]: events });
}

export async function listPublicHolidayEvents(start, end, calendarId, category) {
  const ical = await getPublicHolidayFeed(calendarId);
  return parsePublicHolidayFeed(ical, category).filter((event) => {
    const date = eventStart(event);
    return date >= start && date < end;
  });
}

async function getPublicHolidayFeed(calendarId) {
  const key = PUBLIC_HOLIDAY_CACHE_PREFIX + encodeURIComponent(calendarId);
  const now = Date.now();
  const memoryEntry = memoryHolidayFeedCache.get(key);
  if (memoryEntry && now - memoryEntry.cachedAt < PUBLIC_HOLIDAY_CACHE_TTL_MS) return memoryEntry.ical;

  if (chrome.storage.session) {
    try {
      const stored = await chrome.storage.session.get(key);
      const entry = stored[key];
      if (entry?.ical && now - entry.cachedAt < PUBLIC_HOLIDAY_CACHE_TTL_MS) {
        memoryHolidayFeedCache.set(key, entry);
        return entry.ical;
      }
    } catch {
      // Continue to the public feed if temporary storage is unavailable.
    }
  }

  const url = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`Public holiday calendar unavailable (${response.status}).`);
  const ical = await response.text();
  const entry = { cachedAt: now, ical };
  memoryHolidayFeedCache.set(key, entry);
  if (chrome.storage.session && ical.length <= 1_500_000) {
    try {
      await chrome.storage.session.set({ [key]: entry });
    } catch {
      // The feed remains usable for this extension context.
    }
  }
  return ical;
}

function parsePublicHolidayFeed(ical, category) {
  const lines = [];
  for (const line of ical.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && lines.length) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }

  const events = [];
  let current = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current?.start) {
        const end = current.end || addDays(current.start, 1);
        events.push({
          id: `${category}-${current.uid || `${localDateKey(current.start)}-${events.length}`}`,
          summary: current.summary || "Holiday",
          start: { date: localDateKey(current.start) },
          end: { date: localDateKey(end) },
          daybeamHolidayCategory: category,
          daybeamPublicHoliday: true
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const property = line.slice(0, separator).split(";", 1)[0].toUpperCase();
    const value = line.slice(separator + 1);
    if (property === "DTSTART") current.start = parseIcalDate(value);
    else if (property === "DTEND") current.end = parseIcalDate(value);
    else if (property === "UID") current.uid = value;
    else if (property === "SUMMARY") current.summary = unescapeIcalText(value);
  }
  return events;
}

function parseIcalDate(value) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function unescapeIcalText(value) {
  return value.replace(/\\([nN,;\\])/g, (_match, character) => {
    if (character.toLowerCase() === "n") return "\n";
    return character;
  });
}

export async function listCalendarEvents(start, end, calendarId, interactive = false) {
  const generation = await getCalendarCacheEpoch();
  const cacheKey = `${CALENDAR_CACHE_PREFIX}${generation}:${encodeURIComponent(calendarId)}:${start.getTime()}:${end.getTime()}`;
  const cached = await readCalendarCache(cacheKey);
  if (generation !== await getCalendarCacheEpoch()) return listCalendarEvents(start, end, calendarId, interactive);
  if (cached) return cached;

  if (pendingCalendarRequests.has(cacheKey)) return pendingCalendarRequests.get(cacheKey);

  const request = fetchCalendarEvents(start, end, calendarId, interactive, cacheKey, generation);
  pendingCalendarRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    pendingCalendarRequests.delete(cacheKey);
  }
}

async function fetchCalendarEvents(start, end, calendarId, interactive, cacheKey, generation) {
  const events = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      fields: "items(id,summary,start,end,htmlLink,location,colorId),nextPageToken"
    });
    if (pageToken) query.set("pageToken", pageToken);
    const data = await calendarFetch("/calendars/" + encodeURIComponent(calendarId) + "/events?" + query, {}, interactive);
    events.push(...(data.items || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  await writeCalendarCache(cacheKey, events, generation);
  return events;
}

export async function clearCalendarCache() {
  pendingCalendarRequests.clear();
  memoryCalendarCache.clear();
  if (!chrome.storage.session) {
    localCalendarCacheEpoch += 1;
    return;
  }
  try {
    const storedEpoch = await chrome.storage.session.get(CALENDAR_CACHE_EPOCH_KEY);
    localCalendarCacheEpoch = Math.max(localCalendarCacheEpoch, Number(storedEpoch[CALENDAR_CACHE_EPOCH_KEY]) || 0) + 1;
    await chrome.storage.session.set({ [CALENDAR_CACHE_EPOCH_KEY]: localCalendarCacheEpoch });
    const stored = await chrome.storage.session.get(null);
    const keys = Object.keys(stored).filter((key) => key.startsWith(CALENDAR_CACHE_PREFIX));
    if (keys.length) await chrome.storage.session.remove(keys);
  } catch {
    localCalendarCacheEpoch += 1;
  }
}

async function getCalendarCacheEpoch() {
  if (!chrome.storage.session) return localCalendarCacheEpoch;
  try {
    const stored = await chrome.storage.session.get(CALENDAR_CACHE_EPOCH_KEY);
    localCalendarCacheEpoch = Math.max(localCalendarCacheEpoch, Number(stored[CALENDAR_CACHE_EPOCH_KEY]) || 0);
  } catch {
    // Use the extension context's local epoch if session storage is unavailable.
  }
  return localCalendarCacheEpoch;
}

async function readCalendarCache(key) {
  const now = Date.now();
  if (!chrome.storage.session) {
    const memoryEntry = memoryCalendarCache.get(key);
    if (memoryEntry && now - memoryEntry.cachedAt < CALENDAR_CACHE_TTL_MS) return memoryEntry.events;
    if (memoryEntry) memoryCalendarCache.delete(key);
    return undefined;
  }
  try {
    const stored = await chrome.storage.session.get(key);
    const entry = stored[key];
    if (entry && Array.isArray(entry.events) && now - entry.cachedAt < CALENDAR_CACHE_TTL_MS) {
      memoryCalendarCache.set(key, entry);
      return entry.events;
    }
    memoryCalendarCache.delete(key);
    if (entry) await chrome.storage.session.remove(key);
  } catch {
    // Fall back to this extension context's memory cache.
    const memoryEntry = memoryCalendarCache.get(key);
    if (memoryEntry && now - memoryEntry.cachedAt < CALENDAR_CACHE_TTL_MS) return memoryEntry.events;
    if (memoryEntry) memoryCalendarCache.delete(key);
  }
  return undefined;
}

async function writeCalendarCache(key, events, generation) {
  if (generation !== await getCalendarCacheEpoch()) return;
  const cachedAt = Date.now();
  const serializedBytes = JSON.stringify(events).length * 2;
  if (serializedBytes > MAX_CALENDAR_CACHE_ENTRY_BYTES) return;

  const entry = { cachedAt, events, approxBytes: serializedBytes };
  memoryCalendarCache.set(key, entry);

  if (!chrome.storage.session) return;
  try {
    const stored = await chrome.storage.session.get(null);
    const entries = Object.entries(stored)
      .filter(([entryKey, value]) => entryKey.startsWith(CALENDAR_CACHE_PREFIX) && value && Array.isArray(value.events))
      .filter(([entryKey]) => entryKey !== key)
      .map(([entryKey, value]) => ({
        key: entryKey,
        cachedAt: Number(value.cachedAt) || 0,
        bytes: Number(value.approxBytes) || JSON.stringify(value.events).length * 2
      }));

    const expired = entries.filter((item) => cachedAt - item.cachedAt >= CALENDAR_CACHE_TTL_MS);
    const retained = entries.filter((item) => cachedAt - item.cachedAt < CALENDAR_CACHE_TTL_MS)
      .sort((left, right) => left.cachedAt - right.cachedAt);
    const removeKeys = expired.map((item) => item.key);
    let totalBytes = retained.reduce((sum, item) => sum + item.bytes, serializedBytes);

    while (retained.length >= MAX_CALENDAR_CACHE_ENTRIES || totalBytes > MAX_CALENDAR_CACHE_BYTES) {
      const oldest = retained.shift();
      if (!oldest) break;
      totalBytes -= oldest.bytes;
      removeKeys.push(oldest.key);
    }

    if (removeKeys.length) await chrome.storage.session.remove(removeKeys);
    if (generation !== await getCalendarCacheEpoch()) return;
    await chrome.storage.session.set({ [key]: entry });
  } catch {
    // Keep the current result usable even if the temporary cache is full.
  }
}

export async function createEvent({ title, date, time, duration = 30, location = "" }) {
  const start = new Date(`${date}T${time}`);
  if (!title.trim() || Number.isNaN(start.getTime())) {
    throw new Error("Add an event title and a valid date and time.");
  }
  const end = new Date(start.getTime() + Number(duration || 30) * 60_000);
  const eventDetails = {
    summary: title.trim(),
    location: location.trim() || undefined,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() }
  };
  if (!hasOAuthClient()) {
    const stored = await chrome.storage.local.get(LOCAL_EVENTS_KEY);
    const created = {
      id: `local-${crypto.randomUUID()}`,
      ...eventDetails,
      localOnly: true
    };
    await chrome.storage.local.set({ [LOCAL_EVENTS_KEY]: [...(stored[LOCAL_EVENTS_KEY] || []), created] });
    return created;
  }
  return calendarFetch("/calendars/primary/events", {
    method: "POST",
    body: JSON.stringify(eventDetails)
  }, true).then(async (created) => {
    await clearCalendarCache();
    return created;
  });
}

export function eventStart(event) {
  return event.start?.dateTime ? new Date(event.start.dateTime) : new Date(`${event.start?.date}T00:00:00`);
}

export function eventEnd(event) {
  return event.end?.dateTime ? new Date(event.end.dateTime) : new Date(`${event.end?.date}T00:00:00`);
}

export function isAllDay(event) {
  return Boolean(event.start?.date && !event.start?.dateTime);
}

export function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date, count) {
  const result = new Date(date);
  result.setDate(result.getDate() + count);
  return result;
}

export function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

export function dayBounds(date) {
  const start = startOfDay(date);
  return { start, end: addDays(start, 1) };
}

export function formatTime(event, locale = undefined) {
  if (isAllDay(event)) return "All day";
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(eventStart(event));
}

export function sameLocalDay(left, right) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}
