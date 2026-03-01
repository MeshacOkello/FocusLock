/**
 * FocusLock - Background Service Worker
 * Orchestrates calendar sync, focus detection, and blocking
 */

import { getSettings, getState, saveState, getStats, addBlockAttempt, addOverride, addFocusSession, addDailyMinutes } from './storage.js';
import { getAuthToken, fetchEvents, getFocusWindows, getCurrentFocusWindow, getNextFocusWindow } from './calendar.js';
import { updateBlockingRules, clearBlockingRules } from './blocking.js';

const SYNC_ALARM = 'focuslock_sync';
const CHECK_ALARM = 'focuslock_check';
const OVERRIDE_ALARM = 'focuslock_override_end';
const LOCKIN_END_ALARM = 'focuslock_lockin_end';

// Sync calendar every minute
chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 1 });
chrome.alarms.create(CHECK_ALARM, { periodInMinutes: 0.5 }); // Check every 30s for precise transitions

chrome.alarms.onAlarm.addListener(handleAlarm);

async function handleAlarm(alarm) {
  if (alarm.name === SYNC_ALARM) {
    await syncAndUpdate();
  } else if (alarm.name === CHECK_ALARM) {
    await checkFocusState();
  } else if (alarm.name === OVERRIDE_ALARM) {
    await handleOverrideEnd();
  } else if (alarm.name === LOCKIN_END_ALARM) {
    await handleLockinEnd();
  }
}

async function syncAndUpdate() {
  const settings = await getSettings();
  const state = await getState();

  if (!settings.selectedCalendars?.length && !state.focusMode) {
    return;
  }

  let focusWindows = [];
  let calendarStale = false;

  if (settings.selectedCalendars?.length > 0) {
    try {
      const token = await getAuthToken();
      const now = new Date();
      const timeMin = new Date(now.getTime() - 30 * 60 * 1000);
      const timeMax = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const events = await fetchEvents(
        token,
        settings.selectedCalendars,
        timeMin,
        timeMax
      );

      focusWindows = getFocusWindows(events, settings);

      await saveState({
        ...state,
        calendarStale: false,
        lastCalendarSync: Date.now(),
      });
    } catch (err) {
      console.warn('FocusLock: Calendar sync failed', err);
      calendarStale = true;
      await saveState({
        ...state,
        calendarStale: true,
      });
    }
  }

  await applyFocusState(focusWindows, state, settings);
}

async function checkFocusState() {
  const state = await getState();

  if (state.overrideActive && state.overrideEndsAt) {
    if (Date.now() >= state.overrideEndsAt) {
      await handleOverrideEnd();
      return;
    }
  }

  await syncAndUpdate();
}

async function applyFocusState(focusWindows, state, settings) {
  const now = Date.now();
  const currentWindow = getCurrentFocusWindow(focusWindows);

  // Manual lock-in: preserve until alarm fires
  if (state.focusSource === 'manual' && state.activeEventEnd > now) {
    return;
  }

  let focusMode = !!currentWindow;
  let activeEvent = currentWindow?.title || null;
  let activeEventEnd = currentWindow?.end?.getTime() || null;

  if (state.focusMode && state.activeEvent && !currentWindow && !state.overrideActive && state.focusSource !== 'manual') {
    const sessionEnd = state.activeEventEnd || now;
    const sessionStart = state.focusSessionStart || sessionEnd - 3600000;
    await addFocusSession(sessionStart, sessionEnd, state.focusSource || 'calendar');
    const dateKey = new Date().toISOString().slice(0, 10);
    const minutes = Math.round((sessionEnd - sessionStart) / 60000);
    await addDailyMinutes(dateKey, minutes);
  }

  const blocklist = getEffectiveBlocklist(settings);

  if (focusMode && !state.overrideActive) {
    await updateBlockingRules(blocklist, settings.whitelist || [], {
      eventName: activeEvent,
      endTime: activeEventEnd,
    });

    if (!state.focusMode) {
      await saveState({
        ...state,
        focusMode: true,
        activeEvent,
        activeEventEnd,
        focusSessionStart: Date.now(),
        focusSource: 'calendar',
        overridesUsedThisSession: 0,
      });
    } else {
      await saveState({
        ...state,
        activeEvent,
        activeEventEnd,
      });
    }
  } else if (state.overrideActive && state.overrideEndsAt && Date.now() < state.overrideEndsAt) {
    await clearBlockingRules();
    await saveState(state);
  } else if (!focusMode && !state.overrideActive) {
    await clearBlockingRules();
    await saveState({
      ...state,
      focusMode: false,
      activeEvent: null,
      activeEventEnd: null,
      overrideActive: false,
      overrideEndsAt: null,
      overridesUsedThisSession: 0,
    });
  }
}

function getEffectiveBlocklist(settings) {
  let list = [...(settings.blocklist || [])];
  if (settings.youtubeBlocked) list.push('youtube.com');
  if (settings.discordBlocked) list.push('discord.com');
  return list;
}

async function handleOverrideEnd() {
  const state = await getState();

  await saveState({
    ...state,
    overrideActive: false,
    overrideEndsAt: null,
  });

  await syncAndUpdate();
}

async function handleLockinEnd() {
  const state = await getState();
  if (state.focusSource !== 'manual') return;

  chrome.alarms.clear(LOCKIN_END_ALARM);

  await addFocusSession(
    state.focusSessionStart || Date.now(),
    Date.now(),
    'manual'
  );

  const dateKey = new Date().toISOString().slice(0, 10);
  const minutes = Math.round((Date.now() - (state.focusSessionStart || Date.now())) / 60000);
  await addDailyMinutes(dateKey, Math.max(0, minutes));

  await clearBlockingRules();
  await saveState({
    ...state,
    focusMode: false,
    activeEvent: null,
    activeEventEnd: null,
    focusSource: null,
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'RECORD_BLOCK') {
    addBlockAttempt(msg.domain).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'GET_STATE') {
    getState().then(sendResponse);
    return true;
  }
  if (msg.type === 'GET_NEXT_FOCUS') {
    getNextFocusWindowFromStorage().then(sendResponse);
    return true;
  }
  if (msg.type === 'START_LOCKIN') {
    startManualLockin(msg.durationMinutes).then(sendResponse);
    return true;
  }
  if (msg.type === 'END_LOCKIN') {
    endManualLockin().then(sendResponse);
    return true;
  }
  if (msg.type === 'REQUEST_OVERRIDE') {
    requestOverride(msg.durationMinutes, msg.reason).then(sendResponse);
    return true;
  }
  if (msg.type === 'SYNC_NOW') {
    syncAndUpdate().then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function getNextFocusWindowFromStorage() {
  const settings = await getSettings();
  if (!settings.selectedCalendars?.length) return null;

  try {
    const token = await getAuthToken();
    const now = new Date();
    const timeMin = now;
    const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const events = await fetchEvents(token, settings.selectedCalendars, timeMin, timeMax);
    const focusWindows = getFocusWindows(events, settings);
    return getNextFocusWindow(focusWindows);
  } catch {
    return null;
  }
}

async function startManualLockin(durationMinutes) {
  const state = await getState();
  const settings = await getSettings();

  const start = Date.now();
  const end = start + durationMinutes * 60 * 1000;

  const blocklist = getEffectiveBlocklist(settings);

  await updateBlockingRules(blocklist, settings.whitelist || [], {
    eventName: 'Manual Lock-in',
    endTime: end,
  });

  chrome.alarms.create(LOCKIN_END_ALARM, { when: end });

  await saveState({
    ...state,
    focusMode: true,
    activeEvent: 'Manual Lock-in',
    activeEventEnd: end,
    focusSessionStart: start,
    focusSource: 'manual',
    overridesUsedThisSession: 0,
  });

  return { ok: true, end };
}

async function endManualLockin() {
  const state = await getState();
  if (state.focusSource !== 'manual') {
    return { ok: false, error: 'Not in manual lock-in' };
  }

  chrome.alarms.clear(LOCKIN_END_ALARM);

  await addFocusSession(
    state.focusSessionStart || Date.now(),
    Date.now(),
    'manual'
  );

  await clearBlockingRules();
  await saveState({
    ...state,
    focusMode: false,
    activeEvent: null,
    activeEventEnd: null,
    overrideActive: false,
    overrideEndsAt: null,
    focusSource: null,
  });

  await syncAndUpdate();
  return { ok: true };
}

async function requestOverride(durationMinutes, reason) {
  const state = await getState();
  const settings = await getSettings();

  if (!state.focusMode) {
    return { ok: false, error: 'Not in focus mode' };
  }

  const maxOverrides = settings.maxOverridesPerSession ?? 2;
  if (state.overridesUsedThisSession >= maxOverrides) {
    return { ok: false, error: 'Max overrides reached for this session' };
  }

  if (settings.requireOverrideReason && (!reason || reason.length < (settings.minReasonLength || 10))) {
    return { ok: false, error: 'Reason required (min 10 characters)' };
  }

  await addOverride(durationMinutes, reason || '');

  const overrideEnd = Date.now() + durationMinutes * 60 * 1000;

  chrome.alarms.create(OVERRIDE_ALARM, { when: overrideEnd });

  await clearBlockingRules();
  await saveState({
    ...state,
    overrideActive: true,
    overrideEndsAt: overrideEnd,
    overridesUsedThisSession: (state.overridesUsedThisSession || 0) + 1,
  });

  return { ok: true, end: overrideEnd };
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  }
  await syncAndUpdate();
});
