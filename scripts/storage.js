/**
 * FocusLock - Storage module
 * Manages all extension data with sensible defaults
 */

const STORAGE_KEYS = {
  SETTINGS: 'focuslock_settings',
  STATE: 'focuslock_state',
  STATS: 'focuslock_stats',
  ONBOARDING_COMPLETE: 'focuslock_onboarding_complete',
};

const DEFAULT_SETTINGS = {
  // Calendar
  connectedAccount: null,
  selectedCalendars: [],
  focusDetectionMode: 'all_events', // 'all_events' | 'keywords' | 'focus_calendar' | 'both'
  focusKeywords: [
    'study', 'studying', 'lockin', 'lock-in', 'class', 'lecture', 'lab',
    'precept', 'discussion', 'office hours', 'revision', 'midterm', 'finals',
    'seminar', 'tutorial', 'recitation', 'section', 'exam', 'quiz', 'review',
    'cs', 'math', 'phys', 'chem', 'bio', 'eng', 'ece', 'econ'
  ],
  negativeKeywords: [
    'lunch', 'lunch break', 'dinner', 'breakfast', 'brunch', 'coffee', 'coffee break',
    'meal', 'eat', 'food', 'snack', 'catering', 'team lunch', 'team dinner',
    'break', 'rest', 'pause', 'downtime', 'off', 'off day', 'nap', 'sleep', 'recovery',
    'gym', 'workout', 'run', 'running', 'yoga', 'exercise', 'fitness', 'swimming',
    'tennis', 'cycling', 'bike', 'sports', 'soccer', 'basketball', 'football',
    'party', 'social', 'hangout', 'drinks', 'happy hour', 'meetup', 'friends',
    'family time', 'date', 'birthday', 'celebration', 'game night', 'networking',
    'personal', 'errands', 'appointment', 'doctor', 'dentist', 'therapy',
    'shopping', 'haircut', 'vet', 'dmv',
    'vacation', 'travel', 'trip', 'away', 'commute', 'travel day', 'sick day',
    'pto', 'paternity', 'maternity', 'holiday', 'holidays',
    'free', 'available', 'open', 'ooo', 'out of office', 'out of the office',
    'buffer', 'optional', 'tbd', 'tentative', 'flexible',
    'busy', 'blocked', 'hold', 'placeholder',
    'movie', 'netflix', 'gaming', 'games',
    'chore', 'laundry', 'cleaning', 'cooking'
  ],
  focusCalendarIds: [],
  eventOverrides: {}, // { [eventId]: true (force focus) | false (force exclude) }
  
  // Blocking
  blocklist: [
    'x.com', 'twitter.com', 'instagram.com', 'tiktok.com', 'reddit.com',
    'facebook.com'
  ],
  youtubeBlocked: false,
  discordBlocked: false,
  whitelist: ['docs.google.com'],
  
  // Overrides
  maxOverridesPerSession: 2,
  maxOverrideDuration: 10,
  requireOverrideReason: true,
  minReasonLength: 10,
  overrideDelaySeconds: 0,
};

const DEFAULT_STATE = {
  focusMode: false,
  activeEvent: null,
  activeEventEnd: null,
  overrideActive: false,
  overrideEndsAt: null,
  overridesUsedThisSession: 0,
  calendarStale: false,
  lastCalendarSync: null,
};

export async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

export async function getState() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.STATE);
  return { ...DEFAULT_STATE, ...result[STORAGE_KEYS.STATE] };
}

export async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEYS.STATE]: state });
}

export async function getStats() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.STATS);
  return result[STORAGE_KEYS.STATS] || {
    blockAttempts: [],
    overrides: [],
    focusSessions: [],
    dailyMinutes: {},
  };
}

export async function saveStats(stats) {
  await chrome.storage.local.set({ [STORAGE_KEYS.STATS]: stats });
}

export async function isOnboardingComplete() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ONBOARDING_COMPLETE);
  return result[STORAGE_KEYS.ONBOARDING_COMPLETE] === true;
}

export async function setOnboardingComplete() {
  await chrome.storage.local.set({ [STORAGE_KEYS.ONBOARDING_COMPLETE]: true });
}

export async function addBlockAttempt(domain) {
  const stats = await getStats();
  stats.blockAttempts = stats.blockAttempts || [];
  stats.blockAttempts.push({ domain, timestamp: Date.now() });
  // Keep last 1000 for stats
  if (stats.blockAttempts.length > 1000) {
    stats.blockAttempts = stats.blockAttempts.slice(-1000);
  }
  await saveStats(stats);
}

export async function addOverride(duration, reason) {
  const stats = await getStats();
  stats.overrides = stats.overrides || [];
  stats.overrides.push({ duration, reason, timestamp: Date.now() });
  if (stats.overrides.length > 500) {
    stats.overrides = stats.overrides.slice(-500);
  }
  await saveStats(stats);
}

export async function addFocusSession(start, end, source) {
  const stats = await getStats();
  stats.focusSessions = stats.focusSessions || [];
  stats.focusSessions.push({ start, end, source });
  if (stats.focusSessions.length > 500) {
    stats.focusSessions = stats.focusSessions.slice(-500);
  }
  await saveStats(stats);
}

export async function addDailyMinutes(dateKey, minutes) {
  const stats = await getStats();
  stats.dailyMinutes = stats.dailyMinutes || {};
  stats.dailyMinutes[dateKey] = (stats.dailyMinutes[dateKey] || 0) + minutes;
  await saveStats(stats);
}

export async function clearAllData() {
  await chrome.storage.local.clear();
}

export async function exportData() {
  const [settings, state, stats] = await Promise.all([
    getSettings(),
    getState(),
    getStats(),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    stats,
    state,
  };
}

export async function importSettings(settingsJson) {
  const data = JSON.parse(settingsJson);
  if (data.settings) {
    await saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
    return true;
  }
  return false;
}
