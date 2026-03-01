import { getState, isOnboardingComplete } from '../scripts/storage.js';
import { getNextFocusWindow } from '../scripts/calendar.js';
import { getSettings } from '../scripts/storage.js';

const LOCKIN_DURATIONS = [15, 30, 60, 90, 120];

function formatCountdown(ms) {
  if (ms <= 0) return 'soon';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

async function loadState() {
  const onboardingComplete = await isOnboardingComplete();
  if (!onboardingComplete) {
    document.querySelector('.popup-main').innerHTML = `
      <div class="setup-prompt">
        <p>Complete setup to start blocking distractions during your focus times.</p>
        <button id="open-onboarding" class="btn-primary btn-full">Complete setup</button>
      </div>
    `;
    document.getElementById('status-badge').classList.add('hidden');
    document.getElementById('open-onboarding').addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
      window.close();
    });
    return;
  }

  const state = await getState();
  const settings = await getSettings();

  const statusBadge = document.getElementById('status-badge');
  const focusInfo = document.getElementById('focus-info');
  const eventName = document.getElementById('event-name');
  const countdown = document.getElementById('countdown');
  const nextFocus = document.getElementById('next-focus');
  const nextFocusText = document.getElementById('next-focus-text');
  const calendarStale = document.getElementById('calendar-stale');
  const primaryAction = document.getElementById('primary-action');
  const secondaryAction = document.getElementById('secondary-action');

  if (state.focusMode || state.overrideActive) {
    statusBadge.textContent = state.overrideActive ? 'Override' : 'Focus ON';
    statusBadge.className = 'status-badge ' + (state.overrideActive ? 'status-override' : 'status-on');
    focusInfo.classList.remove('hidden');
    eventName.textContent = state.activeEvent || 'Focus Mode';

    const endTime = state.overrideActive ? state.overrideEndsAt : state.activeEventEnd;
    const updateCountdown = () => {
      const remaining = (endTime || 0) - Date.now();
      countdown.textContent = formatCountdown(remaining);
      if (remaining > 0) {
        setTimeout(updateCountdown, 1000);
      }
    };
    updateCountdown();

    primaryAction.textContent = state.focusSource === 'manual' ? 'End Lock-in' : 'End focus early';
    primaryAction.dataset.action = 'end';
  } else {
    statusBadge.textContent = 'Focus OFF';
    statusBadge.className = 'status-badge status-off';
    focusInfo.classList.add('hidden');
    primaryAction.textContent = 'Start Lock-in';
    primaryAction.dataset.action = 'lockin';
  }

  if (state.calendarStale) {
    calendarStale.classList.remove('hidden');
  } else {
    calendarStale.classList.add('hidden');
  }

  if (!state.focusMode && settings.selectedCalendars?.length > 0) {
    try {
      const token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: false }, (t) => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(t);
        });
      });
      if (token) {
        const now = new Date();
        const timeMin = now;
        const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const { fetchEvents } = await import('../scripts/calendar.js');
        const events = await fetchEvents(token, settings.selectedCalendars, timeMin, timeMax);
        const { getFocusWindows } = await import('../scripts/calendar.js');
        const focusWindows = getFocusWindows(events, settings);
        const next = getNextFocusWindow(focusWindows);
        if (next) {
          nextFocus.classList.remove('hidden');
          nextFocusText.textContent = `${next.title} at ${formatTime(next.start)}`;
        } else {
          nextFocus.classList.add('hidden');
        }
      }
    } catch {
      nextFocus.classList.add('hidden');
    }
  } else {
    nextFocus.classList.add('hidden');
  }

  secondaryAction.onclick = () => chrome.runtime.openOptionsPage();
  document.getElementById('stats-btn').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('stats/stats.html') });
  };
}

async function handlePrimaryAction() {
  const action = document.getElementById('primary-action').dataset.action;

  if (action === 'lockin') {
    const duration = await showLockinPicker();
    if (duration) {
      const res = await chrome.runtime.sendMessage({ type: 'START_LOCKIN', durationMinutes: duration });
      if (res?.ok) {
        window.close();
      }
    }
  } else if (action === 'end') {
    const confirmed = confirm('End focus early? Your session will be recorded.');
    if (confirmed) {
      const res = await chrome.runtime.sendMessage({ type: 'END_LOCKIN' });
      if (res?.ok) {
        window.close();
      }
    }
  }
}

function showLockinPicker() {
  return new Promise((resolve) => {
    const choice = prompt(
      `Start Lock-in for how many minutes?\n\nOptions: ${LOCKIN_DURATIONS.join(', ')}`,
      '60'
    );
    if (choice === null) {
      resolve(null);
      return;
    }
    const mins = parseInt(choice, 10);
    if (LOCKIN_DURATIONS.includes(mins)) {
      resolve(mins);
    } else if (mins >= 5 && mins <= 240) {
      resolve(mins);
    } else {
      resolve(60);
    }
  });
}

document.getElementById('primary-action').addEventListener('click', handlePrimaryAction);

loadState();
