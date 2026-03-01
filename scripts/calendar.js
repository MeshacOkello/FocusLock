/**
 * FocusLock - Google Calendar integration
 * Fetches and parses calendar events for focus detection
 */

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const SYNC_INTERVAL_MS = 60 * 1000; // 1 minute

export async function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

export async function getAuthTokenInteractive() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

export async function fetchCalendars(token) {
  const res = await fetch(`${CALENDAR_API}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch calendars');
  const data = await res.json();
  return data.items || [];
}

export async function fetchEvents(token, calendarIds, timeMin, timeMax) {
  const allEvents = [];
  
  for (const calId of calendarIds) {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
    });
    
    const res = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    if (!res.ok) continue;
    
    const data = await res.json();
    const events = (data.items || []).map((e) => ({
      id: e.id,
      summary: e.summary || '(No title)',
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      isAllDay: !!e.start?.date,
      calendarId: calId,
    }));
    
    allEvents.push(...events);
  }
  
  return allEvents;
}

export function isFocusEvent(event, settings) {
  const { focusKeywords, focusCalendarIds, focusDetectionMode } = settings;
  const title = (event.summary || '').toLowerCase();
  
  // All-day events: skip by default
  if (event.isAllDay) return false;
  
  // Check focus calendar
  if (focusDetectionMode === 'focus_calendar' || focusDetectionMode === 'both') {
    if (focusCalendarIds.includes(event.calendarId)) {
      return true;
    }
  }
  
  // Check keywords
  if (focusDetectionMode === 'keywords' || focusDetectionMode === 'both') {
    const keywords = focusKeywords.map((k) => k.toLowerCase().trim()).filter(Boolean);
    if (keywords.some((kw) => title.includes(kw))) {
      return true;
    }
  }
  
  return false;
}

export function getFocusWindows(events, settings) {
  const now = new Date();
  const focusWindows = [];
  
  for (const event of events) {
    if (!isFocusEvent(event, settings)) continue;
    
    const start = new Date(event.start);
    const end = new Date(event.end);
    
    // Skip past events
    if (end <= now) continue;
    
    focusWindows.push({
      start,
      end,
      title: event.summary,
      source: 'calendar',
    });
  }
  
  // Sort by start, merge overlapping
  focusWindows.sort((a, b) => a.start - b.start);
  
  const merged = [];
  for (const w of focusWindows) {
    if (merged.length === 0) {
      merged.push({ ...w });
    } else {
      const last = merged[merged.length - 1];
      if (w.start <= last.end) {
        last.end = new Date(Math.max(last.end.getTime(), w.end.getTime()));
        last.title = last.title + ', ' + w.title;
      } else {
        merged.push({ ...w });
      }
    }
  }
  
  return merged;
}

export function getCurrentFocusWindow(focusWindows) {
  const now = new Date();
  return focusWindows.find((w) => w.start <= now && w.end > now) || null;
}

export function getNextFocusWindow(focusWindows) {
  const now = new Date();
  return focusWindows.find((w) => w.start > now) || null;
}
