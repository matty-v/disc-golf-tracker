/**
 * Disc Golf Tracker - Service Worker Registration
 *
 * Moved out of an inline <script> in index.html — a third inline block the
 * architecture's CSP plan didn't account for. Left inline, it would have
 * been blocked outright by script-src 'self' (no 'unsafe-inline'), silently
 * breaking offline support the moment the CSP shipped (finding 13).
 */

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registered:', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker registration failed:', error);
            });
    });
}
