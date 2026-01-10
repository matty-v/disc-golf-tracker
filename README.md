# Disc Golf Tracker

A mobile-first PWA for tracking disc golf rounds with Google Sheets storage.

## Features

- Track throws, approaches, and putts per hole
- Create and save courses
- View historical statistics per hole
- Offline support with automatic sync
- Installable as a mobile app

## Live App

https://storage.googleapis.com/disc-golf-tracker/index.html

## Development

Serve locally with any static file server:

```bash
python -m http.server 8080
# or
npx http-server -p 8080
```

### Running Tests

```bash
node tests/run-tests.js
```

## Deployment

The app deploys automatically to GCS when changes are merged to `main`.

Manual deployment:

```bash
./scripts/deploy-gcs.sh disc-golf-tracker
```

## CI/CD

- **Pull Requests**: Tests run automatically
- **Merge to main**: Auto-deploys to GCS

## License

MIT
