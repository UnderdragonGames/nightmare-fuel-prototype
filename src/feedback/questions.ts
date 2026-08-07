/**
 * Playtest feedback question set — v1.
 *
 * Design rationale (see docs/playtest-log.md, 2026-08-02):
 * - Qualitative categories instead of numeric scales: picking a descriptive
 *   word doesn't feel like grading the designer, and negative options listed
 *   in the grid are "allowed" in a way a 2/5 never is (Microsoft Product
 *   Reaction Cards; Benedek & Miner 2002 — deliberately mixed valence).
 * - Free-text questions ask about EXPERIENCES, not solutions (Schell Games
 *   FFWWDD): frustrating/favorite moments, the magic wand, and "what were
 *   you doing" (comprehension check — most valuable from new players).
 *
 * QUESTIONS_VERSION is stored with every submission so the set can evolve
 * without corrupting comparisons across sessions.
 */

export const QUESTIONS_VERSION = 1;

export type TapQuestion = {
	kind: 'tap';
	id: string;
	prompt: string;
	options: { value: string; label: string }[];
	/** How many options may be selected (default 1). */
	maxPicks?: number;
	optional?: boolean;
};

export type TextQuestion = {
	kind: 'text';
	id: string;
	prompt: string;
	placeholder?: string;
	optional?: boolean;
};

export type FeedbackQuestion = TapQuestion | TextQuestion;

export const FEEDBACK_QUESTIONS: FeedbackQuestion[] = [
	{
		kind: 'tap',
		id: 'posture',
		prompt: 'How were you playing?',
		options: [
			{ value: 'zoning-out', label: 'Zoning out' },
			{ value: 'casual', label: 'Casual' },
			{ value: 'invested', label: 'Invested' },
			{ value: 'scheming', label: 'Scheming' },
		],
	},
	{
		kind: 'tap',
		id: 'feeling',
		prompt: 'What was the primary feeling of your experience?',
		maxPicks: 2,
		options: [
			{ value: 'absorbed', label: 'Absorbed' },
			{ value: 'clever', label: 'Clever' },
			{ value: 'tense', label: 'Tense' },
			{ value: 'surprised', label: 'Surprised' },
			{ value: 'satisfied', label: 'Satisfied' },
			{ value: 'amused', label: 'Amused' },
			{ value: 'confused', label: 'Confused' },
			{ value: 'frustrated', label: 'Frustrated' },
			{ value: 'bored', label: 'Bored' },
			{ value: 'rushed', label: 'Rushed' },
		],
	},
	{
		kind: 'tap',
		id: 'length',
		prompt: 'Did the game feel too short, about right, or too long?',
		options: [
			{ value: 'too-short', label: 'Too short' },
			{ value: 'about-right', label: 'About right' },
			{ value: 'too-long', label: 'Too long' },
		],
	},
	{
		kind: 'tap',
		id: 'play-again',
		prompt: 'Do you want to play again right away?',
		options: [
			{ value: 'yes', label: 'Yes' },
			{ value: 'maybe', label: 'Maybe' },
			{ value: 'no', label: 'No' },
		],
	},
	{
		kind: 'text',
		id: 'play-again-why',
		prompt: 'Why?',
		placeholder: 'What makes you want to (or not)?',
		optional: true,
	},
	{
		kind: 'text',
		id: 'painful',
		prompt: 'What was the most painful or frustrating moment?',
		optional: true,
	},
	{
		kind: 'text',
		id: 'delightful',
		prompt: 'What was the most delightful or exciting moment?',
		optional: true,
	},
	{
		kind: 'text',
		id: 'wand',
		prompt: 'Magic wand: change, add, or remove one thing. What is it?',
		optional: true,
	},
	{
		kind: 'text',
		id: 'doing',
		prompt: 'In your own words — what were you doing in this game?',
		placeholder: 'What was the goal, as you understood it?',
		optional: true,
	},
];

/** Answers keyed by question id; tap answers are arrays for uniformity. */
export type FeedbackAnswers = Record<string, string | string[]>;

export type FeedbackSubmission = {
	questionsVersion: number;
	answers: FeedbackAnswers;
	appVersion: string;
	matchID: string | null;
	seat: string | null;
	playerName: string | null;
	networked: boolean;
	rules: unknown;
	scores: Record<string, number> | null;
	turns: number | null;
	durationSeconds: number | null;
	gameover: boolean;
};
