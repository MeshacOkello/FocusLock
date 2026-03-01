const params = new URLSearchParams(window.location.search);
const blockedUrl = params.get('url') || '';

let domain = 'unknown';
try {
  if (blockedUrl) {
    const url = blockedUrl.startsWith('http') ? blockedUrl : 'https://' + blockedUrl;
    domain = new URL(url).hostname.replace(/^www\./, '');
  }
} catch (_) {}
chrome.runtime.sendMessage({ type: 'RECORD_BLOCK', domain });
const eventName = params.get('event') || 'Focus Mode';
const endParam = params.get('end') || '';

document.getElementById('event-name').textContent = decodeURIComponent(eventName);

const endTime = endParam ? parseInt(endParam, 10) : null;
if (endTime) {
  const endDate = new Date(endTime);
  document.getElementById('end-time').textContent = endDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  const updateCountdown = () => {
    const remaining = endTime - Date.now();
    const el = document.getElementById('countdown');
    if (remaining <= 0) {
      el.textContent = 'soon';
      return;
    }
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    el.textContent = m > 0 ? `${m}m ${s}s` : `${s}s`;
    setTimeout(updateCountdown, 1000);
  };
  updateCountdown();
} else {
  document.getElementById('end-time').textContent = '—';
  document.getElementById('countdown').textContent = '—';
}

document.getElementById('back-btn').addEventListener('click', () => {
  if (document.referrer && !document.referrer.startsWith('chrome-extension://')) {
    window.history.back();
  } else {
    window.location.href = 'https://www.google.com';
  }
});

document.getElementById('override-btn').addEventListener('click', () => {
  const overrideUrl = chrome.runtime.getURL('override/override.html');
  const searchParams = new URLSearchParams({
    returnUrl: blockedUrl || document.referrer || 'https://www.google.com',
    event: eventName,
    end: endParam,
  });
  window.location.href = `${overrideUrl}?${searchParams.toString()}`;
});

document.getElementById('settings-link').href = chrome.runtime.getURL('settings/settings.html');
