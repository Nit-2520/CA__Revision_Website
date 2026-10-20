# CA Inter Law Revision Tracker — Full Stack

A responsive revision website with a Node.js backend and SQLite database. The frontend uses plain HTML/CSS/JavaScript (no frontend libraries). The backend stores chapters, sections, notes, keywords, revision status and compressed images in a local SQLite database.

## Requirements
- Node.js 18 or newer
- Internet is only needed once to install the server packages. The app itself runs on your computer afterward.

## Run locally
1. Unzip this folder.
2. Open Terminal in the `ca-law-fullstack` folder.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open http://localhost:3000 in your browser.

## Features
- Chapter list and progress bars
- Search section number/name across chapters
- Add/delete chapters and add sections
- Bulk import lines such as `12 | Registered office`
- Revision toggle, keywords, long notes and compressed images
- Previous/Next navigation
- SQLite persistence on the server
- Export and restore JSON backup
- Responsive layout, dark mode and phone safe-area padding

## Storage and privacy
By default, data is saved in `data/revision.sqlite` on the computer running the server. This is private to that machine/account unless you deliberately expose or deploy the server. Anyone who can access the running server can access its data: this starter does not include accounts, login, encryption, or per-user separation. Do not deploy it publicly with personal notes until authentication and authorization have been added. Keep backups.

Three pages of notes are supported; there is no artificial notes-length limit. Actual storage depends on the disk and SQLite limits. Images are resized to max 1000px and compressed as JPEG data URLs. For many large images, a production version should store images as separate files or object storage.

## Load your syllabus
Use the chapter UI to create chapters, then paste one line per section:
`12 | Registered office`

The actual chapter-wise CA Intermediate section list was not present in the request, so no syllabus has been fabricated.

## Mobile app
This project is a mobile-friendly website/PWA-style starting point, not a compiled Android/iOS native app. A production Android/iOS release would need a wrapper (e.g. Capacitor) and app-specific testing. Before public hosting, add authentication, per-user data isolation, HTTPS, rate limiting and automated backups.
