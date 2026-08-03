/**
 * Service worker: web push only (no offline caching — the game is live).
 * iOS shows push ONLY for PWAs added to the Home Screen (iOS 16.4+).
 */

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		data = { body: event.data ? event.data.text() : '' };
	}
	event.waitUntil(
		self.registration.showNotification(data.title || 'Nightmare Fuel', {
			body: data.body || '',
			icon: '/icons/icon-192.png',
			badge: '/icons/icon-192.png',
			// One notification per match — a newer one replaces the older.
			tag: data.tag || 'nightmare-fuel',
			data: { url: data.url || '/' },
		}),
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || '/';
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
			for (const client of list) {
				if ('focus' in client) return client.focus();
			}
			return self.clients.openWindow(url);
		}),
	);
});
