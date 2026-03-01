# FocusLock

A browser extension that automatically blocks distracting websites during your scheduled calendar focus times. No need to remember to turn anything on—your calendar drives focus.

## Features

- **Calendar-synced blocking** — Connects to Google Calendar and blocks sites during events with keywords like "Study", "Class", "Lecture"
- **Manual Lock-in** — Start a focus session anytime without a calendar event
- **Override with friction** — Emergency access with required reason and time limit
- **Stats** — Track blocked time, overrides, and focus streaks

## Setup

### 1. Google Cloud OAuth (required for calendar)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google Calendar API** (APIs & Services → Library)
4. Create OAuth 2.0 credentials (APIs & Services → Credentials → Create Credentials → OAuth client ID)
5. Choose **Chrome extension** as application type
6. Add your extension ID (from `chrome://extensions` when loaded unpacked)
7. Add scope: `https://www.googleapis.com/auth/calendar.readonly`
8. Copy the Client ID and update `manifest.json`:
   - Replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with your actual Client ID

### 2. Load the extension

1. Run `npm run icons` to generate icons (or they should already exist)
2. Open Chrome → `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select this folder

### 3. Complete onboarding

On first install, the onboarding page opens. Connect Google Calendar, choose focus detection (keywords/calendar/both), and configure your blocklist.

## Development

```bash
npm run icons   # Generate extension icons
```

## Privacy

All data stays local. We store:
- Settings (calendars, keywords, blocklist)
- Cached event metadata (times + titles only)
- Block attempts, overrides, focus sessions

No data is sent to external servers.

## License

MIT
