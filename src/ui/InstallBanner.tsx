import React from 'react';
import { Icon } from './Icon';

/**
 * Mobile "install the app" banner. Shows only when the page is NOT already
 * running as an installed PWA (display-mode: standalone / iOS navigator
 * .standalone). Dismissal is remembered per device.
 *
 * On Chromium the browser fires `beforeinstallprompt` — we stash it (captured
 * in main.tsx before React mounts, since it can fire that early) and tapping
 * the banner triggers the real install prompt. Everywhere else (notably iOS
 * Safari, which has no install API) the tap opens step-by-step instructions.
 * Installing matters beyond convenience: iOS only delivers push notifications
 * to Home-Screen apps.
 */

declare global {
	interface Window {
		/** Stashed beforeinstallprompt event (set in main.tsx). */
		__pwaInstallPrompt?: { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
	}
}

const DISMISS_KEY = 'pwa-banner-dismissed';

export const isStandalone = (): boolean => {
	if (typeof window === 'undefined') return true;
	if (window.matchMedia('(display-mode: standalone)').matches) return true;
	// iOS Safari's pre-standard flag, still the reliable signal there.
	return (navigator as Navigator & { standalone?: boolean }).standalone === true;
};

const isIOS = (): boolean =>
	/iPad|iPhone|iPod/.test(navigator.userAgent)
	// iPadOS 13+ reports as Mac; touch support tells them apart.
	|| (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);

export const InstallBanner: React.FC = () => {
	const [dismissed, setDismissed] = React.useState(
		() => typeof localStorage !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1',
	);
	const [showHelp, setShowHelp] = React.useState(false);
	const [installed, setInstalled] = React.useState(isStandalone);

	// If the user installs from the native prompt, hide the banner live.
	React.useEffect(() => {
		const onInstalled = (): void => setInstalled(true);
		window.addEventListener('appinstalled', onInstalled);
		return () => window.removeEventListener('appinstalled', onInstalled);
	}, []);

	if (installed || dismissed) return null;

	const dismiss = (): void => {
		setDismissed(true);
		try {
			localStorage.setItem(DISMISS_KEY, '1');
		} catch { /* private mode — session-only dismissal still works */ }
	};

	const handleInstall = async (): Promise<void> => {
		const stashed = window.__pwaInstallPrompt;
		if (stashed) {
			// Chromium: real install prompt.
			await stashed.prompt();
			const { outcome } = await stashed.userChoice;
			window.__pwaInstallPrompt = undefined;
			if (outcome === 'accepted') dismiss();
			return;
		}
		setShowHelp(true);
	};

	return (
		<>
			<div className="install-banner">
				<button className="install-banner__body" onClick={handleInstall}>
					<Icon name="share" size={14} />
					<span>
						<b>Add to Home Screen</b> for the full game — and turn alerts.
					</span>
				</button>
				<button className="install-banner__close" onClick={dismiss} aria-label="Dismiss">
					<Icon name="x" size={14} />
				</button>
			</div>

			{showHelp && (
				<div className="modal-overlay" onClick={() => setShowHelp(false)}>
					<div className="modal-content install-help" onClick={(e) => e.stopPropagation()}>
						<div className="modal-header">
							<h2>Install the app</h2>
							<button className="modal-close" onClick={() => setShowHelp(false)}>×</button>
						</div>
						<div className="modal-body install-help__body">
							{isIOS() ? (
								<ol className="install-help__steps">
									<li>Tap the <b>Share</b> button <span className="install-help__glyph">⎋</span> in Safari&rsquo;s toolbar.</li>
									<li>Scroll down and tap <b>Add to Home Screen</b>.</li>
									<li>Tap <b>Add</b>, then open the game from its new icon.</li>
								</ol>
							) : (
								<ol className="install-help__steps">
									<li>Open the browser <b>menu</b> (⋮).</li>
									<li>Tap <b>Add to Home screen</b> (or <b>Install app</b>).</li>
									<li>Confirm, then open the game from its new icon.</li>
								</ol>
							)}
							<p className="install-help__note">
								Installed, the game runs full-screen and can send turn alerts
								{isIOS() ? ' (iPhones only allow notifications for installed apps)' : ''}.
							</p>
							<button className="btn btn--primary install-help__done" onClick={() => setShowHelp(false)}>
								Got it
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
};
