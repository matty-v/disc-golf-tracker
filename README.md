# Disc Golf Tracker

A mobile-first web application for tracking disc golf rounds with detailed scoring, historical statistics, and Google Sheets integration.

## Features

- **Round Scoring**: Record throws, approach shots, and putts for each hole
- **Course Management**: Create courses on-the-fly or select from saved courses
- **Historical Statistics**: View average scores, approaches, and putts for each hole
- **Offline Support**: Continue tracking rounds without internet connection
- **Google Sheets Sync**: All data backed up to your personal Google Sheet
- **Mobile-First Design**: Optimized for one-handed use on mobile devices
- **PWA Support**: Install as a standalone app on your phone

## Quick Start

### 1. Set Up Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Sheets API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"

### 2. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. If prompted, configure the OAuth consent screen first:
   - Choose "External" user type
   - Fill in the required fields (app name, user support email)
   - Add the Google Sheets API scope: `https://www.googleapis.com/auth/spreadsheets`
4. Create an OAuth 2.0 Client ID:
   - Application type: "Web application"
   - Name: "Disc Golf Tracker"
   - Authorized JavaScript origins: Add your domain (e.g., `http://localhost:8080` for development)
   - Authorized redirect URIs: Same as origins
5. Copy the Client ID

### 3. Configure the App

1. Open `js/config.js`
2. Replace `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com` with your actual Client ID

```javascript
google: {
    clientId: 'your-actual-client-id.apps.googleusercontent.com',
    // ... rest of config
}
```

### 4. Generate App Icons

The app includes an SVG icon at `icons/icon.svg`. Generate PNG icons using:

```bash
# Using ImageMagick
convert -resize 72x72 icons/icon.svg icons/icon-72.png
convert -resize 96x96 icons/icon.svg icons/icon-96.png
convert -resize 128x128 icons/icon.svg icons/icon-128.png
convert -resize 144x144 icons/icon.svg icons/icon-144.png
convert -resize 152x152 icons/icon.svg icons/icon-152.png
convert -resize 192x192 icons/icon.svg icons/icon-192.png
convert -resize 384x384 icons/icon.svg icons/icon-384.png
convert -resize 512x512 icons/icon.svg icons/icon-512.png
```

Or use an online SVG to PNG converter.

### 5. Serve the Application

The app requires a web server due to service worker and API requirements.

**Using Python:**
```bash
python -m http.server 8080
```

**Using Node.js (http-server):**
```bash
npx http-server -p 8080
```

**Using VS Code:**
Install the "Live Server" extension and click "Go Live"

### 6. Access the App

Open `http://localhost:8080` in your browser.

## Usage

### Starting a Round

1. Sign in with your Google account
2. Click "New Round"
3. Select an existing course or create a new one
4. Enter your score for each hole
5. Navigate between holes using the arrows or "Next Hole" button
6. View the summary when complete
7. Click "Save & Finish" to save to Google Sheets

### Creating a New Course

1. Click "New Round" > "Create New Course"
2. Enter the course name and number of holes
3. As you play each hole, enter the par and optional distance
4. Course details are saved automatically for future rounds

### Viewing Statistics

When playing a saved course, you'll see:
- Average score for each hole
- Average approaches (if you've tracked 3+ rounds)
- Average putts (if you've tracked 3+ rounds)

## Technical Details

### Data Model

The app uses four data tables stored in Google Sheets:

- **Courses**: Course ID, name, hole count, dates
- **Holes**: Hole definitions (par, distance) for each course
- **Rounds**: Round metadata (date, total score, completion status)
- **Scores**: Individual hole scores with approaches and putts

### Offline Support

- Course and score data is cached locally using IndexedDB
- Pending syncs are queued and processed when online
- The service worker caches the app shell for offline access

### File Structure

```
disc-golf/
├── index.html          # Main HTML file
├── manifest.json       # PWA manifest
├── sw.js              # Service worker
├── css/
│   └── styles.css     # All styles
├── js/
│   ├── config.js      # Configuration (Google API, validation rules)
│   ├── utils.js       # Utility functions
│   ├── storage.js     # Local storage (IndexedDB + localStorage)
│   ├── sheets-api.js  # Google Sheets API integration
│   ├── statistics.js  # Statistics calculations
│   └── app.js         # Main application logic
├── icons/
│   ├── icon.svg       # Source icon
│   └── icon-*.png     # Generated PNG icons
└── README.md          # This file
```

## Browser Support

- Chrome (latest)
- Safari iOS (latest)
- Samsung Internet (latest)
- Edge (latest)

## Privacy

- All your data is stored in your own Google Sheet
- The app only requests access to create and edit spreadsheets
- No data is sent to any third-party servers

## License

MIT License - feel free to use and modify as needed.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.
