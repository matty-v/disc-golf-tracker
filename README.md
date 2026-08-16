# Disc Golf Tracker

A mobile-first PWA for tracking disc golf rounds with Google Sheets storage.

## Features

- Track throws, approaches, and putts per hole
- Create and save courses
- View historical statistics per hole
- Offline support with automatic sync
- Installable as a mobile app

## Live App

https://disc-golf-voget.web.app

## Development

Serve locally with any static file server:

```bash
python -m http.server 8080
# or
npx http-server -p 8080
```

### Running Tests

```bash
npm test
# or directly:
node tests/run-tests.js
```

## Deployment

The app deploys automatically to Firebase Hosting when changes are merged to
`main`, gated on the test suite passing (`.github/workflows/deploy.yml`).

Manual deployment:

```bash
firebase deploy
```

## CI/CD

- **Pull Requests**: Tests run automatically, plus a Firebase Hosting preview channel (7-day expiry)
- **Merge to main**: Tests run again, then auto-deploys to Firebase Hosting (`disc-golf-voget.web.app`)

## License

MIT
