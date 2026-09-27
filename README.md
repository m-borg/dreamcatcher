<img width="3404" height="1858" alt="Screenshot 2026-09-05 at 09 14 35 copy" src="https://github.com/user-attachments/assets/9be580a4-dd9b-4b36-8a11-bc3f74b1a8c2" />


# Dreamcatcher

Turns a Chrome bookmarks folder of pixeldrain movie links into a Plex-style library with posters and metadata from TMDB.

## Setup

1. **Load the extension**: Go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select this folder.
2. **Make a bookmarks folder**: Create a folder named `mv` (or `Movies`) in your Chrome bookmarks bar and drop your `pixeldrain.com` movie links inside.
3. **Add your TMDB key**: Click the extension icon and enter a free v3 API key from [themoviedb.org](https://www.themoviedb.org/settings/api).

That's it. It'll scan your folder and build the library.

## How it works & features

- **Title matching**: Strips scene tags (`1080p`, `x264`, `BluRay`, etc.) and extracts release years from your bookmark titles to query TMDB.
- **Genre filter**: 3-state buttons — click once to filter by genre (orange), click again to exclude it (red), click again to reset.
- **Japanese posters**: Toggle in the header fetches theatrical Japanese release posters and localized titles.
- **Overlays**: Checkboxes to show file sizes (pulled directly from Pixeldrain) and runtimes on posters.
- **Sorting**: Added date, release year (grouped by decade), rating, popularity, file size, duration, or A-Z.
- **Settings & Refresh**: The `↺` button re-scans bookmarks if you add new links. The `⚙` button lets you change your API key or wipe the cache.
- **Local cache**: Cached in `chrome.storage.local` so it doesn't hammer TMDB every time you open it.
