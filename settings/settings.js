import { getSettings, saveSettings, exportData, importSettings, clearAllData } from '../scripts/storage.js';
import { getAuthTokenInteractive, fetchCalendars } from '../scripts/calendar.js';

async function load() {
  const settings = await getSettings();

  document.getElementById('keywords').value = (settings.focusKeywords || []).join(', ');
  document.getElementById('negative-keywords').value = (settings.negativeKeywords || []).join(', ');
  document.getElementById('blocklist').value = (settings.blocklist || []).join('\n');
  document.getElementById('whitelist').value = (settings.whitelist || []).join('\n');
  document.getElementById('youtube').checked = settings.youtubeBlocked;
  document.getElementById('discord').checked = settings.discordBlocked;
  document.getElementById('detection-mode').value = settings.focusDetectionMode || 'all_events';
  document.getElementById('max-overrides').value = settings.maxOverridesPerSession ?? 2;
  document.getElementById('max-override-duration').value = settings.maxOverrideDuration ?? 10;
  document.getElementById('require-reason').checked = settings.requireOverrideReason !== false;
  document.getElementById('override-delay').checked = (settings.overrideDelaySeconds || 0) >= 30;

  if (settings.connectedAccount && settings.selectedCalendars?.length > 0) {
    document.getElementById('calendar-status-text').textContent = 'Connected';
    document.getElementById('calendar-status-text').classList.add('connected');
    document.getElementById('connect-btn').textContent = 'Reconnect';
    try {
      const token = await getAuthTokenInteractive();
      const calendars = await fetchCalendars(token);
      const listEl = document.getElementById('calendar-list');
      listEl.innerHTML = calendars.map((cal) => `
        <label>
          <input type="checkbox" value="${cal.id}" ${(settings.selectedCalendars || []).includes(cal.id) ? 'checked' : ''}>
          ${cal.summary || cal.id}
        </label>
      `).join('');
      listEl.classList.remove('hidden');
      listEl.querySelectorAll('input').forEach((cb) => {
        cb.addEventListener('change', async () => {
          const s = await getSettings();
          if (cb.checked) {
            s.selectedCalendars = s.selectedCalendars || [];
            s.selectedCalendars.push(cb.value);
          } else {
            s.selectedCalendars = (s.selectedCalendars || []).filter((id) => id !== cb.value);
          }
          await saveSettings(s);
        });
      });
      updateDetectionSections(calendars, settings);
    } catch {
      document.getElementById('calendar-status-text').textContent = 'Connection expired';
      document.getElementById('calendar-status-text').classList.remove('connected');
      updateDetectionSections([], settings);
    }
  } else {
    document.getElementById('calendar-status-text').classList.remove('connected');
  }
  updateDetectionSections([], settings);
}

document.getElementById('connect-btn').addEventListener('click', async () => {
  try {
    const token = await getAuthTokenInteractive();
    const calendars = await fetchCalendars(token);
    const settings = await getSettings();
    settings.connectedAccount = 'connected';
    settings.selectedCalendars = calendars.map((c) => c.id).filter((id) => id.includes('@'));
    await saveSettings(settings);
    await load();
  } catch (err) {
    alert('Could not connect to Google.');
  }
});

document.getElementById('keywords').addEventListener('blur', async () => {
  const s = await getSettings();
  s.focusKeywords = document.getElementById('keywords').value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  await saveSettings(s);
});

document.getElementById('negative-keywords').addEventListener('blur', async () => {
  const s = await getSettings();
  s.negativeKeywords = document.getElementById('negative-keywords').value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  await saveSettings(s);
});

document.getElementById('blocklist').addEventListener('blur', async () => {
  const s = await getSettings();
  s.blocklist = document.getElementById('blocklist').value.split(/[,\n]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  await saveSettings(s);
});

document.getElementById('whitelist').addEventListener('blur', async () => {
  const s = await getSettings();
  s.whitelist = document.getElementById('whitelist').value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  await saveSettings(s);
});

document.getElementById('youtube').addEventListener('change', async (e) => {
  const s = await getSettings();
  s.youtubeBlocked = e.target.checked;
  await saveSettings(s);
});

document.getElementById('discord').addEventListener('change', async (e) => {
  const s = await getSettings();
  s.discordBlocked = e.target.checked;
  await saveSettings(s);
});

document.getElementById('max-overrides').addEventListener('change', async () => {
  const s = await getSettings();
  s.maxOverridesPerSession = parseInt(document.getElementById('max-overrides').value, 10) || 2;
  await saveSettings(s);
});

document.getElementById('max-override-duration').addEventListener('change', async () => {
  const s = await getSettings();
  s.maxOverrideDuration = parseInt(document.getElementById('max-override-duration').value, 10) || 10;
  await saveSettings(s);
});

document.getElementById('require-reason').addEventListener('change', async (e) => {
  const s = await getSettings();
  s.requireOverrideReason = e.target.checked;
  await saveSettings(s);
});

document.getElementById('override-delay').addEventListener('change', async (e) => {
  const s = await getSettings();
  s.overrideDelaySeconds = e.target.checked ? 30 : 0;
  await saveSettings(s);
});

document.getElementById('export-btn').addEventListener('click', async () => {
  const data = await exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `focuslock-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById('import-btn').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const ok = await importSettings(text);
  if (ok) {
    alert('Settings imported.');
    await load();
  } else {
    alert('Invalid import file.');
  }
  e.target.value = '';
});

document.getElementById('clear-btn').addEventListener('click', async () => {
  if (confirm('Clear all data? This cannot be undone.')) {
    await clearAllData();
    alert('All data cleared.');
    await load();
  }
});

document.getElementById('onboarding-link').href = chrome.runtime.getURL('onboarding/onboarding.html');

function updateDetectionSections(calendars, settings) {
  const mode = document.getElementById('detection-mode').value;
  const keywordsSection = document.getElementById('keywords-section');
  const focusSection = document.getElementById('focus-calendar-section');
  const focusCheckboxes = document.getElementById('focus-calendar-checkboxes');

  keywordsSection.classList.toggle('hidden', mode === 'all_events' || mode === 'focus_calendar');

  if ((mode === 'focus_calendar' || mode === 'both') && calendars?.length > 0) {
    focusSection.classList.remove('hidden');
    focusCheckboxes.innerHTML = calendars.map((cal) => `
      <label><input type="checkbox" value="${cal.id}" ${(settings.focusCalendarIds || []).includes(cal.id) ? 'checked' : ''}> ${cal.summary || cal.id}</label>
    `).join('');
    focusCheckboxes.querySelectorAll('input').forEach((cb) => {
      cb.addEventListener('change', async () => {
        const s = await getSettings();
        s.focusCalendarIds = s.focusCalendarIds || [];
        if (cb.checked) s.focusCalendarIds.push(cb.value);
        else s.focusCalendarIds = s.focusCalendarIds.filter((id) => id !== cb.value);
        await saveSettings(s);
      });
    });
  } else {
    focusSection.classList.add('hidden');
  }
}

document.getElementById('detection-mode').addEventListener('change', async () => {
  const s = await getSettings();
  s.focusDetectionMode = document.getElementById('detection-mode').value;
  await saveSettings(s);
  try {
    const token = await getAuthTokenInteractive();
    const calendars = await fetchCalendars(token);
    updateDetectionSections(calendars, s);
  } catch (_) {
    updateDetectionSections([], s);
  }
});

load();
