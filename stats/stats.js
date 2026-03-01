import { getStats } from '../scripts/storage.js';

function getDateKey(d) {
  return d.toISOString().slice(0, 10);
}

function getStartOfWeek(d) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

async function loadStats() {
  const stats = await getStats();
  const today = new Date();
  const todayKey = getDateKey(today);

  const dailyMinutes = stats.dailyMinutes || {};
  const todayMinutes = dailyMinutes[todayKey] || 0;
  const todayOverrides = (stats.overrides || []).filter((o) => getDateKey(new Date(o.timestamp)) === todayKey).length;

  const weekStart = getStartOfWeek(today);
  let weekMinutes = 0;
  let weekDays = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const key = getDateKey(d);
    const mins = dailyMinutes[key] || 0;
    weekMinutes += mins;
    if (mins > 0) weekDays++;
  }
  const weekDaily = weekDays > 0 ? Math.round(weekMinutes / weekDays) : 0;

  document.getElementById('today-minutes').textContent = todayMinutes;
  document.getElementById('today-overrides').textContent = todayOverrides;
  document.getElementById('week-minutes').textContent = weekMinutes;
  document.getElementById('week-daily').textContent = weekDaily;

  let streak = 0;
  const checkDate = new Date(today);
  for (let i = 0; i < 365; i++) {
    const key = getDateKey(checkDate);
    if ((dailyMinutes[key] || 0) > 0) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  document.getElementById('streak-days').textContent = streak;

  const blockAttempts = stats.blockAttempts || [];
  const domainCounts = {};
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  blockAttempts
    .filter((a) => a.timestamp > oneWeekAgo)
    .forEach((a) => {
      const domain = a.domain || 'unknown';
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    });

  const topSites = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const topSitesEl = document.getElementById('top-sites');
  if (topSites.length === 0) {
    topSitesEl.innerHTML = '<p class="empty">No block attempts yet</p>';
  } else {
    topSitesEl.innerHTML = topSites
      .map(([domain, count]) => `<div class="site-row"><span class="site-domain">${domain}</span><span class="site-count">${count} attempts</span></div>`)
      .join('');
  }
}

document.getElementById('settings-link').href = chrome.runtime.getURL('settings/settings.html');

loadStats();
