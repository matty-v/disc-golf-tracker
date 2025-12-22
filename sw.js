/**
 * Disc Golf Tracker - Service Worker
 *
 * Provides offline functionality by caching app shell and static assets.
 * Implements a cache-first strategy for static resources and network-first
 * for API calls.
 */

const CACHE_NAME = 'disc-golf-tracker-v1';
const STATIC_CACHE_NAME = 'disc-golf-static-v1';
const DATA_CACHE_NAME = 'disc-golf-data-v1';

// Files to cache for offline use
const STATIC_FILES = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/config.js',
    '/js/utils.js',
    '/js/storage.js',
    '/js/sheets-api.js',
    '/js/statistics.js',
    '/js/app.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// External resources that should be cached
const EXTERNAL_RESOURCES = [
    'https://apis.google.com/js/api.js',
    'https://accounts.google.com/gsi/client'
];

/**
 * Install event - cache static files
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');

    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static files');
                return cache.addAll(STATIC_FILES);
            })
            .then(() => {
                console.log('[SW] Static files cached');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Cache installation failed:', error);
            })
    );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((cacheName) => {
                            return cacheName !== STATIC_CACHE_NAME &&
                                   cacheName !== DATA_CACHE_NAME &&
                                   cacheName.startsWith('disc-golf-');
                        })
                        .map((cacheName) => {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Service worker activated');
                return self.clients.claim();
            })
    );
});

/**
 * Fetch event - serve from cache or network
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip Chrome extension requests
    if (url.protocol === 'chrome-extension:') {
        return;
    }

    // Handle Google API requests - network first with cache fallback
    if (url.hostname.includes('googleapis.com') ||
        url.hostname.includes('google.com') ||
        url.hostname.includes('gstatic.com')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // Handle app requests - cache first with network fallback
    event.respondWith(cacheFirst(request));
});

/**
 * Cache-first strategy
 * Try cache first, fall back to network if not found
 */
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
        // Return cached response and update cache in background
        updateCache(request);
        return cachedResponse;
    }

    // Not in cache, fetch from network
    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.error('[SW] Fetch failed:', error);

        // Return offline fallback for navigation requests
        if (request.mode === 'navigate') {
            return caches.match('/index.html');
        }

        throw error;
    }
}

/**
 * Network-first strategy
 * Try network first, fall back to cache if offline
 */
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            const cache = await caches.open(DATA_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log('[SW] Network request failed, trying cache:', request.url);
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
            return cachedResponse;
        }

        throw error;
    }
}

/**
 * Update cache in background
 */
async function updateCache(request) {
    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
    } catch (error) {
        // Silent fail - we already have a cached version
    }
}

/**
 * Background sync for pending data
 */
self.addEventListener('sync', (event) => {
    console.log('[SW] Sync event:', event.tag);

    if (event.tag === 'sync-pending-data') {
        event.waitUntil(syncPendingData());
    }
});

/**
 * Sync pending data to Google Sheets
 */
async function syncPendingData() {
    // This would be implemented with the actual sync logic
    // For now, we just notify the client to handle sync
    const clients = await self.clients.matchAll();

    clients.forEach((client) => {
        client.postMessage({
            type: 'SYNC_REQUESTED'
        });
    });
}

/**
 * Handle messages from the client
 */
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);

    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data.type === 'CLEAR_CACHE') {
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => caches.delete(cacheName))
            );
        });
    }
});

/**
 * Push notification handler (for future use)
 */
self.addEventListener('push', (event) => {
    console.log('[SW] Push event received');

    if (event.data) {
        const data = event.data.json();

        const options = {
            body: data.body || 'New notification',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-72.png',
            vibrate: [100, 50, 100],
            data: {
                url: data.url || '/'
            }
        };

        event.waitUntil(
            self.registration.showNotification(data.title || 'Disc Golf Tracker', options)
        );
    }
});

/**
 * Notification click handler
 */
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');

    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window' })
            .then((clientList) => {
                // If a window is already open, focus it
                for (const client of clientList) {
                    if ('focus' in client) {
                        return client.focus();
                    }
                }

                // Otherwise, open a new window
                if (clients.openWindow) {
                    return clients.openWindow(event.notification.data.url || '/');
                }
            })
    );
});
