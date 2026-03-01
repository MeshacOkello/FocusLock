import { getSettings, saveSettings, setOnboardingComplete } from '../scripts/storage.js';
import { getAuthTokenInteractive, fetchCalendars, fetchEvents, getFocusWindows, getNextFocusWindow } from '../scripts/calendar.js';

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

  if (stepNum === 5) {
    await updateNextFocusText();
  }
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
      settings.focusDetectionMode = document.querySelector('input[name="detection"]:checked')?.value || 'keywords';
      await saveSettings(settings);
    } else if (currentStep === 4) {
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

document.querySelector('input[name="detection"]:checked')?.addEventListener('change', () => {});
document.querySelectorAll('input[name="detection"]').forEach((r) => {
  r.addEventListener('change', async () => {
    const settings = await getSettings();
    settings.focusDetectionMode = document.querySelector('input[name="detection"]:checked').value;
    await saveSettings(settings);
  });
});

document.getElementById('keywords-input').addEventListener('blur', async () => {
  const settings = await getSettings();
  const text = document.getElementById('keywords-input').value;
  settings.focusKeywords = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
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
    document.getElementById('blocklist-input').value = (settings.blocklist || []).join('\n');
    document.getElementById('youtube-toggle').checked = settings.youtubeBlocked;
    document.getElementById('discord-toggle').checked = settings.discordBlocked;
    const detection = document.querySelector(`input[name="detection"][value="${settings.focusDetectionMode}"]`);
    if (detection) detection.checked = true;
  }
})();
