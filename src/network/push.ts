/**
 * Turn-alert web push: subscribe this device to server notifications for a
 * seat in a match ("your turn", Mystery Box picks).
 *
 * Subscriptions are stored in server memory and re-registered from here on
 * every app load (see resyncTurnAlerts) so a server restart self-heals the
 * next time the player opens the app.
 *
 * iOS: push only works when the app is added to the Home Screen (iOS 16.4+),
 * and the permission prompt must come from a tap — hence enableTurnAlerts is
 * only ever called from the toggle button.
 */
import { getServerURL } from './lobby';
import type { NetworkSession } from '../ui/useUIStore';

export type TurnAlertResult = 'on' | 'off' | 'denied' | 'unsupported' | 'failed';

export const pushSupported = (): boolean =>
	typeof navigator !== 'undefined' &&
	'serviceWorker' in navigator &&
	typeof window !== 'undefined' &&
	'PushManager' in window &&
	'Notification' in window;

const urlBase64ToUint8Array = (base64: string): Uint8Array => {
	const padding = '='.repeat((4 - (base64.length % 4)) % 4);
	const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const subscribeEndpoint = (serverURL: string, matchID: string, action: 'subscribe' | 'unsubscribe'): string =>
	`${serverURL}/games/hex-strings/${matchID}/push-${action}`;

export const enableTurnAlerts = async (session: NetworkSession): Promise<TurnAlertResult> => {
	if (!pushSupported()) return 'unsupported';
	try {
		const permission = await Notification.requestPermission();
		if (permission !== 'granted') return 'denied';
		const serverURL = getServerURL();
		const keyRes = await fetch(`${serverURL}/push/public-key`);
		if (!keyRes.ok) return 'failed';
		const { key } = (await keyRes.json()) as { key: string };
		const registration = await navigator.serviceWorker.ready;
		const subscription =
			(await registration.pushManager.getSubscription()) ??
			(await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
			}));
		const res = await fetch(subscribeEndpoint(serverURL, session.matchID, 'subscribe'), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				playerID: session.seat,
				credentials: session.credentials,
				subscription: subscription.toJSON(),
			}),
		});
		return res.ok ? 'on' : 'failed';
	} catch {
		return 'failed';
	}
};

export const disableTurnAlerts = async (session: NetworkSession): Promise<TurnAlertResult> => {
	try {
		const serverURL = getServerURL();
		await fetch(subscribeEndpoint(serverURL, session.matchID, 'unsubscribe'), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ playerID: session.seat, credentials: session.credentials }),
		}).catch(() => {});
		// Keep the browser-level subscription (other matches may use it);
		// the server simply stops sending for this seat.
		return 'off';
	} catch {
		return 'off';
	}
};

/**
 * Re-register a previously enabled subscription without prompting (server
 * memory is wiped on restart/deploy). No-op unless permission is already
 * granted and the device has a live push subscription.
 */
export const resyncTurnAlerts = async (session: NetworkSession): Promise<void> => {
	if (!pushSupported() || Notification.permission !== 'granted') return;
	try {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();
		if (!subscription) return;
		const serverURL = getServerURL();
		await fetch(subscribeEndpoint(serverURL, session.matchID, 'subscribe'), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				playerID: session.seat,
				credentials: session.credentials,
				subscription: subscription.toJSON(),
			}),
		});
	} catch {
		/* best effort */
	}
};
