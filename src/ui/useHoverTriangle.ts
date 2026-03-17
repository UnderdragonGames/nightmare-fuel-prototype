import { useState, useRef, useEffect, useCallback } from 'react';
import type { RefObject, MouseEvent as ReactMouseEvent } from 'react';

type Corner = 'bottom-right' | 'top-right' | 'top-left';

interface Point {
	x: number;
	y: number;
}

/**
 * Returns the two corners of the expanded rect that form the base of the
 * safe-zone triangle. Which corners depend on the zone's anchor corner:
 *   bottom-right → expanded fans left/up   → top-left & bottom-left of expanded
 *   top-right    → expanded fans left/down  → bottom-left & top-left of expanded
 *   top-left     → expanded fans right/down → bottom-right & top-right of expanded
 */
function getTriangleBase(rect: DOMRect, corner: Corner): [Point, Point] {
	switch (corner) {
		case 'bottom-right':
			return [
				{ x: rect.left, y: rect.top },
				{ x: rect.left, y: rect.bottom },
			];
		case 'top-right':
			return [
				{ x: rect.left, y: rect.bottom },
				{ x: rect.left, y: rect.top },
			];
		case 'top-left':
			return [
				{ x: rect.right, y: rect.bottom },
				{ x: rect.right, y: rect.top },
			];
	}
}

/**
 * Cross-product sign test: returns true if point P is inside triangle ABC.
 * Uses the consistent-winding / same-sign cross product method.
 */
function pointInTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
	const d1 = cross(p, a, b);
	const d2 = cross(p, b, c);
	const d3 = cross(p, c, a);

	const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
	const hasPos = d1 > 0 || d2 > 0 || d3 > 0;

	return !(hasNeg && hasPos);
}

function cross(p: Point, a: Point, b: Point): number {
	return (a.x - p.x) * (b.y - p.y) - (a.y - p.y) * (b.x - p.x);
}

function pointInRect(p: Point, rect: DOMRect): boolean {
	return p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
}

export function useHoverTriangle(opts: {
	collapsedRef: RefObject<HTMLElement | null>;
	expandedRef: RefObject<HTMLElement | null>;
	corner: Corner;
	gracePeriod?: number;
	enabled?: boolean;
}): {
	isHovered: boolean;
	/** Force-reset hover state (e.g. when parent collapses the zone via mutual exclusion) */
	reset: () => void;
	handlers: {
		onMouseEnter: () => void;
		onMouseLeave: (e: ReactMouseEvent) => void;
		onMouseMove: (e: ReactMouseEvent) => void;
	};
} {
	const { collapsedRef, expandedRef, corner, gracePeriod = 150, enabled = true } = opts;

	const [isHovered, setIsHovered] = useState(false);

	const exitPoint = useRef<Point | null>(null);
	const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const tracking = useRef(false);

	const clearGrace = useCallback(() => {
		if (graceTimer.current !== null) {
			clearTimeout(graceTimer.current);
			graceTimer.current = null;
		}
	}, []);

	const reset = useCallback(() => {
		clearGrace();
		setIsHovered(false);
		exitPoint.current = null;
		tracking.current = false;
	}, [clearGrace]);

	const startGrace = useCallback(() => {
		clearGrace();
		graceTimer.current = setTimeout(() => {
			reset();
		}, gracePeriod);
	}, [gracePeriod, clearGrace, reset]);

	// Document-level mousemove listener for tracking the cursor while it's
	// inside the safe triangle (the cursor may not be over either element).
	useEffect(() => {
		if (!enabled) return;

		function onDocumentMouseMove(e: globalThis.MouseEvent) {
			if (!tracking.current) return;

			const apex = exitPoint.current;
			if (!apex) return;

			const expandedEl = expandedRef.current;
			if (!expandedEl) return;

			const expandedRect = expandedEl.getBoundingClientRect();
			const cursor: Point = { x: e.clientX, y: e.clientY };

			// Inside expanded area — definitely safe.
			if (pointInRect(cursor, expandedRect)) {
				clearGrace();
				setIsHovered(true);
				return;
			}

			// Inside the safe triangle — also safe.
			const [base1, base2] = getTriangleBase(expandedRect, corner);
			if (pointInTriangle(cursor, apex, base1, base2)) {
				clearGrace();
				setIsHovered(true);
				return;
			}

			// Check if cursor is back inside collapsed area.
			const collapsedEl = collapsedRef.current;
			if (collapsedEl) {
				const collapsedRect = collapsedEl.getBoundingClientRect();
				if (pointInRect(cursor, collapsedRect)) {
					clearGrace();
					exitPoint.current = null;
					setIsHovered(true);
					return;
				}
			}

			// Outside everything — start the grace period (if not already started).
			if (graceTimer.current === null) {
				startGrace();
			}
		}

		document.addEventListener('mousemove', onDocumentMouseMove);
		return () => {
			document.removeEventListener('mousemove', onDocumentMouseMove);
		};
	}, [enabled, expandedRef, collapsedRef, corner, clearGrace, startGrace]);

	// Clean up timer on unmount.
	useEffect(() => {
		return () => {
			clearGrace();
		};
	}, [clearGrace]);

	// --- Handlers to spread onto the collapsed element ---

	const onMouseEnter = useCallback(() => {
		if (!enabled) return;
		clearGrace();
		exitPoint.current = null;
		tracking.current = false;
		setIsHovered(true);
	}, [enabled, clearGrace]);

	const onMouseLeave = useCallback(
		(e: ReactMouseEvent) => {
			if (!enabled) return;

			// Record exit point and start tracking via document listener.
			exitPoint.current = { x: e.clientX, y: e.clientY };
			tracking.current = true;

			// Check immediately whether cursor landed inside expanded area.
			const expandedEl = expandedRef.current;
			if (expandedEl) {
				const expandedRect = expandedEl.getBoundingClientRect();
				if (pointInRect(exitPoint.current, expandedRect)) {
					return; // Still safe, document listener will keep tracking.
				}
			}

			// Start grace — the document listener may cancel it if the cursor
			// enters the triangle or the expanded area in time.
			startGrace();
		},
		[enabled, expandedRef, startGrace],
	);

	const onMouseMove = useCallback(
		(_e: ReactMouseEvent) => {
			// While the mouse is inside the collapsed area, keep things alive.
			// This is intentionally a no-op beyond ensuring hover stays true,
			// since onMouseEnter already set isHovered. The heavy lifting
			// happens in the document-level listener after the mouse leaves.
			if (!enabled) return;
			clearGrace();
		},
		[enabled, clearGrace],
	);

	// When disabled, always report not hovered.
	if (!enabled) {
		return {
			isHovered: false,
			reset: () => {},
			handlers: {
				onMouseEnter: () => {},
				onMouseLeave: () => {},
				onMouseMove: () => {},
			},
		};
	}

	return {
		isHovered,
		reset,
		handlers: { onMouseEnter, onMouseLeave, onMouseMove },
	};
}
