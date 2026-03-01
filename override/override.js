import { getSettings } from '../scripts/storage.js';

const params = new URLSearchParams(window.location.search);
const returnUrl = params.get('returnUrl') || 'https://www.google.com';

const form = document.getElementById('override-form');
const durationSelect = document.getElementById('duration');
const reasonInput = document.getElementById('reason');
const reasonError = document.getElementById('reason-error');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const delayInfo = document.getElementById('delay-info');
const delayCountdown = document.getElementById('delay-countdown');

cancelBtn.addEventListener('click', () => {
  const blockParams = new URLSearchParams();
  blockParams.set('event', params.get('event') || 'Focus Mode');
  blockParams.set('end', params.get('end') || '');
  blockParams.set('url', params.get('returnUrl') || '');
  window.location.href = chrome.runtime.getURL('block/block.html') + '?' + blockParams.toString();
});

async function loadSettings() {
  const settings = await getSettings();
  const maxDuration = settings.maxOverrideDuration ?? 10;
  const durations = [1, 5, 10].filter((d) => d <= maxDuration);
  if (durations.length === 0) durations.push(5);

  durationSelect.innerHTML = durations
    .map((d) => `<option value="${d}">${d} minute${d > 1 ? 's' : ''}</option>`)
    .join('');

  if (settings.overrideDelaySeconds > 0) {
    delayInfo.classList.remove('hidden');
    let remaining = settings.overrideDelaySeconds;
    delayCountdown.textContent = remaining;
    submitBtn.disabled = true;

    const interval = setInterval(() => {
      remaining--;
      delayCountdown.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(interval);
        submitBtn.disabled = false;
      }
    }, 1000);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const settings = await getSettings();
  const reason = reasonInput.value.trim();
  const minLength = settings.minReasonLength ?? 10;

  if (settings.requireOverrideReason && reason.length < minLength) {
    reasonError.classList.remove('hidden');
    reasonInput.focus();
    return;
  }

  reasonError.classList.add('hidden');

  const duration = parseInt(durationSelect.value, 10);
  const res = await chrome.runtime.sendMessage({
    type: 'REQUEST_OVERRIDE',
    durationMinutes: duration,
    reason,
  });

  if (res?.ok) {
    window.location.href = returnUrl;
  } else {
    alert(res?.error || 'Could not grant override. You may have reached the max overrides for this session.');
  }
});

loadSettings();
