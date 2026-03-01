/**
 * FocusLock - Blocking rules management
 * Uses declarativeNetRequest to redirect blocked domains to Focus Block Page
 */

const RULE_ID_BASE = 1000;

function buildRedirectUrl(params) {
  const blockPageUrl = chrome.runtime.getURL('block/block.html');
  const searchParams = new URLSearchParams(params);
  return `${blockPageUrl}?${searchParams.toString()}`;
}

function domainToUrlFilter(domain) {
  domain = domain.trim().toLowerCase();
  if (!domain) return null;
  // Match domain and all subdomains: ||domain.com
  return `||${domain.replace(/^\./, '')}`;
}

export async function updateBlockingRules(blocklist, whitelist, focusInfo) {
  const whitelistSet = new Set(
    (whitelist || []).map((d) => d.trim().toLowerCase()).filter(Boolean)
  );

  const rules = [];
  let ruleId = RULE_ID_BASE;

  for (const domain of blocklist) {
    const cleanDomain = domain.trim().toLowerCase();
    if (!cleanDomain || whitelistSet.has(cleanDomain)) continue;

    const urlFilter = domainToUrlFilter(cleanDomain);
    if (!urlFilter) continue;

    const redirectUrl = buildRedirectUrl({
      url: `https://${cleanDomain}`,
      event: focusInfo?.eventName || 'Focus Mode',
      end: focusInfo?.endTime?.toString() || '',
    });

    rules.push({
      id: ruleId++,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: { url: redirectUrl },
      },
      condition: {
        urlFilter,
        resourceTypes: ['main_frame'],
      },
    });
  }

  // Remove existing rules and add new ones
  const existingRules = await chrome.declarativeNetRequest.getSessionRules();
  const idsToRemove = existingRules
    .filter((r) => r.id >= RULE_ID_BASE)
    .map((r) => r.id);

  if (idsToRemove.length > 0) {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: idsToRemove,
    });
  }

  if (rules.length > 0) {
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: rules,
    });
  }
}

export async function clearBlockingRules() {
  const existingRules = await chrome.declarativeNetRequest.getSessionRules();
  const idsToRemove = existingRules
    .filter((r) => r.id >= RULE_ID_BASE)
    .map((r) => r.id);

  if (idsToRemove.length > 0) {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: idsToRemove,
    });
  }
}
