import React, { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';

type CoverflowProps = {
	itemCount: number;
	renderItem: (index: number, isFocal: boolean) => React.ReactNode;
	itemWidth: number;
	itemHeight: number;
	className?: string;
};

function clamp(v: number, min: number, max: number): number {
	return v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

const springTransition = {
	type: 'spring' as const,
	stiffness: 350,
	damping: 28,
	mass: 0.8,
};

export const Coverflow: React.FC<CoverflowProps> = ({
	itemCount,
	renderItem,
	itemWidth,
	itemHeight,
	className,
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const [focalIndex, setFocalIndex] = useState<number>(
		Math.max(0, Math.floor((itemCount - 1) / 2)),
	);

	const updateFocalFromX = useCallback(
		(clientX: number) => {
			const container = containerRef.current;
			if (!container || itemCount === 0) return;
			const rect = container.getBoundingClientRect();
			const relativeX = clientX - rect.left;
			const t = clamp(relativeX / rect.width, 0, 1);
			setFocalIndex(t * (itemCount - 1));
		},
		[itemCount],
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			updateFocalFromX(e.clientX);
		},
		[updateFocalFromX],
	);

	const handleTouchMove = useCallback(
		(e: React.TouchEvent) => {
			if (e.touches.length > 0) {
				updateFocalFromX(e.touches[0].clientX);
			}
		},
		[updateFocalFromX],
	);

	if (itemCount === 0) {
		return <div className={`coverflow ${className ?? ''}`} />;
	}

	const containerWidth = containerRef.current?.clientWidth ?? itemWidth * Math.min(itemCount, 8);

	// Pile margins — cards stack up at these boundaries.
	const pileMargin = itemWidth * 0.4;
	const minX = pileMargin;
	const maxX = containerWidth - pileMargin;

	const items: React.ReactNode[] = [];
	for (let i = 0; i < itemCount; i++) {
		const diff = i - focalIndex;
		const distance = Math.abs(diff);
		const sign = diff === 0 ? 0 : diff > 0 ? 1 : -1;

		// --- X position: spread near focal, compress toward edges ---
		const centerX = containerWidth / 2;
		const spreadSpacing = itemWidth * 0.75; // generous spacing near focal
		const pileSpacing = itemWidth * 0.04; // very tight in piles

		let offset = 0;
		if (distance > 0) {
			const dir = diff > 0 ? 1 : -1;
			const steps = Math.ceil(distance);
			for (let s = 0; s < steps; s++) {
				const stepDist = s + 0.5;
				const t = clamp(stepDist / 4, 0, 1);
				const spacing = lerp(spreadSpacing, pileSpacing, t);
				const fraction = s < steps - 1 ? 1 : distance - Math.floor(distance) || 1;
				offset += spacing * fraction * dir;
			}
		}

		const idealX = centerX + offset;
		const x = clamp(idealX, minX, maxX);

		// How far is this card clamped from its ideal position?
		// Cards in a pile get vertical stagger to show depth.
		const isClamped = Math.abs(idealX - x) > 2;
		const pileDepth = isClamped ? Math.abs(idealX - x) / (itemWidth * 0.3) : 0;
		const yStagger = Math.min(pileDepth * 1.5, 12) * (sign >= 0 ? 1 : -1) * 0.5;

		// --- Visual properties ---
		// Cards stay flat (no rotateY). Scale down slightly in piles.
		const scale = lerp(1.0, 0.85, clamp(distance / 6, 0, 1));
		const opacity = isClamped
			? lerp(0.7, 0.3, clamp(pileDepth / 3, 0, 1))
			: lerp(1.0, 0.7, clamp(distance / 5, 0, 1));

		// Z-index: focal on top, then outward. Clamped cards go below.
		const zIndex = isClamped
			? Math.max(1, Math.floor(itemCount * 0.3) - Math.floor(pileDepth * 2))
			: itemCount - Math.floor(distance);

		const isFocal = distance < 0.5;

		items.push(
			<motion.div
				key={i}
				className="coverflow__item"
				animate={{
					x: x - itemWidth / 2,
					y: yStagger,
					scale,
					opacity,
				}}
				transition={springTransition}
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					width: itemWidth,
					height: itemHeight,
					zIndex,
					transformOrigin: 'center center',
					willChange: 'transform, opacity',
				}}
			>
				{renderItem(i, isFocal)}
			</motion.div>,
		);
	}

	return (
		<div
			ref={containerRef}
			className={`coverflow ${className ?? ''}`}
			onMouseMove={handleMouseMove}
			onTouchMove={handleTouchMove}
			style={{
				position: 'relative',
				width: '100%',
				height: itemHeight + 24, // extra room for Y stagger
				overflow: 'visible',
				cursor: 'default',
			}}
		>
			{items}
		</div>
	);
};
