import React from 'react';
import { FEEDBACK_QUESTIONS, QUESTIONS_VERSION, type FeedbackAnswers, type FeedbackSubmission, type TapQuestion } from '../feedback/questions';
import { submitFeedback } from '../feedback/submit';

/**
 * Post-game playtest form. Taps first (required), free text below — always
 * visible, never collapsed (2026-08 playtest: "the additional text feedback…
 * that's the most important feedback"). Text stays optional: submitting with
 * only the taps answered is still a valid data point.
 */
export const FeedbackForm: React.FC<{
	context: Omit<FeedbackSubmission, 'questionsVersion' | 'answers'>;
	onDone: (submitted: boolean) => void;
}> = ({ context, onDone }) => {
	const [answers, setAnswers] = React.useState<FeedbackAnswers>({});
	const [busy, setBusy] = React.useState(false);

	const tapQuestions = FEEDBACK_QUESTIONS.filter((q): q is TapQuestion => q.kind === 'tap');
	const textQuestions = FEEDBACK_QUESTIONS.filter((q) => q.kind === 'text');

	const toggleTap = (q: TapQuestion, value: string): void => {
		setAnswers((prev) => {
			const current = (prev[q.id] as string[] | undefined) ?? [];
			if (current.includes(value)) {
				return { ...prev, [q.id]: current.filter((v) => v !== value) };
			}
			const max = q.maxPicks ?? 1;
			const next = max === 1 ? [value] : [...current, value].slice(-max);
			return { ...prev, [q.id]: next };
		});
	};

	const tapsComplete = tapQuestions.every((q) => ((answers[q.id] as string[] | undefined) ?? []).length > 0);

	const handleSubmit = async (): Promise<void> => {
		setBusy(true);
		// Drop empty text answers so the row stores only what was actually said.
		const cleaned: FeedbackAnswers = {};
		for (const [id, value] of Object.entries(answers)) {
			if (typeof value === 'string' ? value.trim().length > 0 : value.length > 0) {
				cleaned[id] = typeof value === 'string' ? value.trim().slice(0, 2000) : value;
			}
		}
		await submitFeedback({ ...context, questionsVersion: QUESTIONS_VERSION, answers: cleaned });
		onDone(true);
	};

	return (
		<div className="feedback-form">
			<div className="feedback-form__title">How was this game?</div>

			{tapQuestions.map((q) => {
				const picked = (answers[q.id] as string[] | undefined) ?? [];
				return (
					<div key={q.id} className="feedback-form__q">
						<div className="feedback-form__prompt">
							{q.prompt}
							{(q.maxPicks ?? 1) > 1 && <span className="feedback-form__hint"> (pick up to {q.maxPicks})</span>}
						</div>
						<div className="feedback-form__options">
							{q.options.map((opt) => (
								<button
									key={opt.value}
									className={`feedback-form__pill ${picked.includes(opt.value) ? 'feedback-form__pill--on' : ''}`}
									onClick={() => toggleTap(q, opt.value)}
								>
									{opt.label}
								</button>
							))}
						</div>
					</div>
				);
			})}

			{textQuestions.map((q) => (
				<div key={q.id} className="feedback-form__q">
					<div className="feedback-form__prompt">
						{q.prompt}
						<span className="feedback-form__hint"> (optional)</span>
					</div>
					<textarea
						className="feedback-form__text"
						rows={2}
						placeholder={'placeholder' in q ? q.placeholder ?? '' : ''}
						value={(answers[q.id] as string | undefined) ?? ''}
						onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
					/>
				</div>
			))}

			<div className="feedback-form__actions">
				<button className="btn" onClick={() => onDone(false)} disabled={busy}>
					Skip
				</button>
				<button className="btn btn--primary" onClick={handleSubmit} disabled={!tapsComplete || busy}>
					{busy ? 'Sending…' : 'Send feedback'}
				</button>
			</div>
		</div>
	);
};
