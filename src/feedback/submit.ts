/**
 * Feedback delivery with an offline outbox: if the POST fails (local game
 * with no server, flaky network), the submission is queued in localStorage
 * and retried on the next app load. Losing playtest feedback is worse than
 * storing it twice late.
 */
import { getServerURL } from '../network/lobby';
import type { FeedbackSubmission } from './questions';

const OUTBOX_KEY = 'feedback-outbox';

const readOutbox = (): FeedbackSubmission[] => {
	try {
		return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]') as FeedbackSubmission[];
	} catch {
		return [];
	}
};

const writeOutbox = (items: FeedbackSubmission[]): void => {
	try {
		localStorage.setItem(OUTBOX_KEY, JSON.stringify(items.slice(-20)));
	} catch {
		/* storage full — drop */
	}
};

const post = async (submission: FeedbackSubmission): Promise<boolean> => {
	try {
		const res = await fetch(`${getServerURL()}/feedback`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(submission),
		});
		return res.ok;
	} catch {
		return false;
	}
};

/** Returns true when delivered now; false when queued for retry. */
export const submitFeedback = async (submission: FeedbackSubmission): Promise<boolean> => {
	if (await post(submission)) return true;
	writeOutbox([...readOutbox(), submission]);
	return false;
};

/** Retry queued submissions (call once on app load). */
export const flushFeedbackOutbox = async (): Promise<void> => {
	const items = readOutbox();
	if (items.length === 0) return;
	const remaining: FeedbackSubmission[] = [];
	for (const item of items) {
		if (!(await post(item))) remaining.push(item);
	}
	writeOutbox(remaining);
};
