import { getSettings, saveSettings, setOnboardingComplete } from '../scripts/storage.js';
import { getAuthTokenInteractive, fetchCalendars, fetchEvents, getFocusWindows, getNextFocusWindow, wouldBeFocusEventByRules } from '../scripts/calendar.js';

let verifyOverrides = {};

let currentStep = 1;

async function showStep(stepNum) {
  document.querySelectorAll('.step').forEach((el) => el.classList.add('hidden'));
  const step = document.getElementById(`step-${stepNum}`);
  if (step) step.classList.remove('hidden');
  currentStep = stepNum;

  document.querySelectorAll('.progress-step').forEach((el, i) => {
    el.classList.remove('active', 'completed');
    const stepIdx = i + 1;
    if (stepIdx < stepNum) el.classList.add('completed');
    else if (stepIdx === stepNum) el.classList.add('active');
  });

  if (stepNum === 4) {
    await loadVerifyEvents();
  }
  if (stepNum === 6) {
    await updateNextFocusText();
  }
}

function formatEventTime(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const dateStr = s.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' – ' + e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${dateStr}, ${timeStr}`;
}

async function loadVerifyEvents() {
  const loading = document.getElementById('verify-loading');
  const list = document.getElementById('verify-events-list');
  const empty = document.getElementById('verify-empty');

  const settings = await getSettings();
  if (!settings.selectedCalendars?.length) {
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
    empty.textContent = 'Connect a calendar first.';
    return;
  }

  try {
    const token = await getAuthTokenInteractive();
    const now = new Date();
    const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const events = await fetchEvents(token, settings.selectedCalendars, now, timeMax);

    loading.classList.add('hidden');
    verifyOverrides = { ...(settings.eventOverrides || {}) };

    if (events.length === 0) {
      empty.classList.remove('hidden');
      return;
    }

    list.innerHTML = events.map((event) => {
      const rulesFocus = wouldBeFocusEventByRules(event, settings);
      const effectiveFocus = event.id in verifyOverrides ? verifyOverrides[event.id] : rulesFocus;

      return `
        <div class="verify-event-row ${effectiveFocus ? 'focus-event' : ''}" data-event-id="${event.id}">
          <div class="verify-event-info">
            <div class="verify-event-title">${(event.summary || '(No title)').replace(/</g, '&lt;')}</div>
            <div class="verify-event-time">${formatEventTime(event.start, event.end)}</div>
          </div>
          <div class="verify-event-toggle toggle-switch ${effectiveFocus ? 'on' : ''}" data-event-id="${event.id}" role="button" tabindex="0"></div>
        </div>
      `;
    }).join('');

    list.classList.remove('hidden');

    list.querySelectorAll('.toggle-switch').forEach((el) => {
      el.addEventListener('click', () => {
        const eventId = el.dataset.eventId;
        const event = events.find((e) => e.id === eventId);
        const current = eventId in verifyOverrides ? verifyOverrides[eventId] : wouldBeFocusEventByRules(event, settings);
        verifyOverrides[eventId] = !current;
        el.classList.toggle('on', verifyOverrides[eventId]);
        el.closest('.verify-event-row').classList.toggle('focus-event', verifyOverrides[eventId]);
      });
    });
  } catch {
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
    empty.textContent = 'Could not load events.';
  }
}

async function saveVerifyOverrides() {
  const settings = await getSettings();
  settings.eventOverrides = { ...verifyOverrides };
  await saveSettings(settings);
}

async function updateNextFocusText() {
  const settings = await getSettings();
  const nextEl = document.getElementById('next-focus-text');
  if (settings.selectedCalendars?.length > 0) {
    try {
      const token = await getAuthTokenInteractive();
      const now = new Date();
      const timeMin = now;
      const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const events = await fetchEvents(token, settings.selectedCalendars, timeMin, timeMax);
      const focusWindows = getFocusWindows(events, settings);
      const next = getNextFocusWindow(focusWindows);
      if (next) {
        nextEl.textContent = `Next focus: ${next.title}, starts ${next.start.toLocaleString()}`;
      } else {
        nextEl.textContent = 'No upcoming focus events in the next 7 days.';
      }
    } catch {
      nextEl.textContent = 'Could not fetch calendar. You can still use Manual Lock-in.';
    }
  } else {
    nextEl.textContent = 'Connect a calendar to see your next focus time, or use Manual Lock-in.';
  }
}

document.querySelectorAll('[data-next]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const next = parseInt(btn.dataset.next, 10);
    if (!next) return;

    const settings = await getSettings();
    if (currentStep === 3) {
      const text = document.getElementById('keywords-input').value;
      settings.focusKeywords = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
      const negText = document.getElementById('negative-keywords-input').value;
      settings.negativeKeywords = negText.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
      settings.focusDetectionMode = document.querySelector('input[name="detection"]:checked')?.value || 'all_events';
      await saveSettings(settings);
    } else if (currentStep === 4) {
      await saveVerifyOverrides();
    } else if (currentStep === 5) {
      const text = document.getElementById('blocklist-input').value;
      settings.blocklist = text.split(/[,\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
      settings.youtubeBlocked = document.getElementById('youtube-toggle').checked;
      settings.discordBlocked = document.getElementById('discord-toggle').checked;
      await saveSettings(settings);
    }

    showStep(next);
  });
});

document.getElementById('connect-calendar').addEventListener('click', async () => {
  try {
    const token = await getAuthTokenInteractive();
    const calendars = await fetchCalendars(token);
    const settings = await getSettings();
    settings.connectedAccount = 'connected';
    settings.selectedCalendars = calendars.map((c) => c.id).filter((id) => id.includes('@'));
    await saveSettings(settings);

    const listEl = document.getElementById('calendar-list');
    const checkboxes = document.getElementById('calendar-checkboxes');
    checkboxes.innerHTML = calendars.map((cal) => `
      <label>
        <input type="checkbox" value="${cal.id}" ${settings.selectedCalendars.includes(cal.id) ? 'checked' : ''}>
        ${cal.summary || cal.id}
      </label>
    `).join('');

    listEl.classList.remove('hidden');
    document.getElementById('calendar-status').innerHTML = '<span class="connected">Connected</span>';
    document.getElementById('next-from-calendar').classList.remove('hidden');

    checkboxes.querySelectorAll('input').forEach((cb) => {
      cb.addEventListener('change', async () => {
        const settings = await getSettings();
        if (cb.checked) {
          settings.selectedCalendars.push(cb.value);
        } else {
          settings.selectedCalendars = settings.selectedCalendars.filter((id) => id !== cb.value);
        }
        await saveSettings(settings);
      });
    });
  } catch (err) {
    alert('Could not connect to Google. Please try again.');
    console.error(err);
  }
});

document.querySelectorAll('input[name="detection"]').forEach((r) => {
  r.addEventListener('change', async () => {
    const settings = await getSettings();
    const mode = document.querySelector('input[name="detection"]:checked').value;
    settings.focusDetectionMode = mode;
    await saveSettings(settings);
    document.getElementById('keywords-editor').classList.toggle('hidden', !['keywords', 'both'].includes(mode));
  });
});

document.getElementById('keywords-input').addEventListener('blur', async () => {
  const settings = await getSettings();
  const text = document.getElementById('keywords-input').value;
  settings.focusKeywords = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  await saveSettings(settings);
});

document.getElementById('negative-keywords-input').addEventListener('blur', async () => {
  const settings = await getSettings();
  const text = document.getElementById('negative-keywords-input').value;
  settings.negativeKeywords = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  await saveSettings(settings);
});

document.getElementById('blocklist-input').addEventListener('blur', async () => {
  const settings = await getSettings();
  const text = document.getElementById('blocklist-input').value;
  settings.blocklist = text.split(/[,\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  await saveSettings(settings);
});

document.getElementById('youtube-toggle').addEventListener('change', async (e) => {
  const settings = await getSettings();
  settings.youtubeBlocked = e.target.checked;
  await saveSettings(settings);
});

document.getElementById('discord-toggle').addEventListener('change', async (e) => {
  const settings = await getSettings();
  settings.discordBlocked = e.target.checked;
  await saveSettings(settings);
});

document.getElementById('test-block').addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'START_LOCKIN', durationMinutes: 1 });
  if (res?.ok) {
    alert('Test block active for 60 seconds. Try visiting a blocked site!');
    window.close();
  }
});

document.getElementById('finish-btn').addEventListener('click', async () => {
  await setOnboardingComplete();
  window.close();
});

showStep(1);

(async () => {
  const settings = await getSettings();
  if (settings.connectedAccount && settings.selectedCalendars?.length > 0) {
    document.getElementById('keywords-input').value = (settings.focusKeywords || []).join(', ');
    document.getElementById('negative-keywords-input').value = (settings.negativeKeywords || []).join(', ');
    document.getElementById('blocklist-input').value = (settings.blocklist || []).join('\n');
    document.getElementById('youtube-toggle').checked = settings.youtubeBlocked;
    document.getElementById('discord-toggle').checked = settings.discordBlocked;
    const detection = document.querySelector(`input[name="detection"][value="${settings.focusDetectionMode || 'all_events'}"]`);
    if (detection) detection.checked = true;
    document.getElementById('keywords-editor').classList.toggle('hidden', !['keywords', 'both'].includes(settings.focusDetectionMode));
  }
})();
