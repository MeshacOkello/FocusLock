import { getSettings, saveSettings } from '../scripts/storage.js';
import { getAuthTokenInteractive, fetchEvents, isFocusEvent, wouldBeFocusEventByRules } from '../scripts/calendar.js';

function formatEventTime(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const dateStr = s.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' – ' + e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${dateStr}, ${timeStr}`;
}

async function loadEvents() {
  const loading = document.getElementById('loading');
  const eventsList = document.getElementById('events-list');
  const emptyState = document.getElementById('empty-state');

  const settings = await getSettings();
  if (!settings.selectedCalendars?.length) {
    loading.classList.add('hidden');
    emptyState.classList.remove('hidden');
    emptyState.innerHTML = '<p>Connect a calendar in Settings first.</p>';
    return;
  }

  try {
    const token = await getAuthTokenInteractive();
    const now = new Date();
    const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const events = await fetchEvents(token, settings.selectedCalendars, now, timeMax);

    loading.classList.add('hidden');

    if (events.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    const overrides = { ...(settings.eventOverrides || {}) };

    eventsList.innerHTML = events.map((event) => {
      const rulesFocus = wouldBeFocusEventByRules(event, settings);
      const effectiveFocus = event.id in overrides ? overrides[event.id] : rulesFocus;

      return `
        <div class="event-row ${effectiveFocus ? 'focus-event' : ''}" data-event-id="${event.id}">
          <div class="event-info">
            <div class="event-title">${escapeHtml(event.summary || '(No title)')}</div>
            <div class="event-time">${formatEventTime(event.start, event.end)}</div>
          </div>
          <div class="event-toggle">
            <div class="toggle-switch ${effectiveFocus ? 'on' : ''}" data-event-id="${event.id}" role="button" tabindex="0" aria-label="Toggle focus for ${escapeHtml(event.summary || 'event')}"></div>
          </div>
        </div>
      `;
    }).join('');

    eventsList.classList.remove('hidden');

    eventsList.querySelectorAll('.toggle-switch').forEach((el) => {
      el.addEventListener('click', () => {
        const eventId = el.dataset.eventId;
        const current = eventId in overrides ? overrides[eventId] : wouldBeFocusEventByRules(events.find((e) => e.id === eventId), settings);
        overrides[eventId] = !current;
        el.classList.toggle('on', overrides[eventId]);
        el.closest('.event-row').classList.toggle('focus-event', overrides[eventId]);
      });
    });

    document.getElementById('save-btn').onclick = async () => {
      settings.eventOverrides = overrides;
      await saveSettings(settings);
      document.getElementById('save-btn').textContent = 'Saved';
      setTimeout(() => {
        document.getElementById('save-btn').textContent = 'Save changes';
      }, 1500);
    };
  } catch (err) {
    loading.classList.add('hidden');
    emptyState.classList.remove('hidden');
    emptyState.innerHTML = '<p>Could not load events. Check your calendar connection.</p>';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById('back-link').href = chrome.runtime.getURL('settings/settings.html');

loadEvents();
