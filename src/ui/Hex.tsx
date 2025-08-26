import React from 'react';

type Props = {
	center: { x: number; y: number };
	size: number;
	fill: string;
	fillOpacity?: number;
	stroke?: string;
	strokeWidth?: number;
	onClick?: () => void;
	children?: React.ReactNode;
};

const polygonPoints = (size: number): string => {
	const pts: string[] = [];
	for (let i = 0; i < 6; i += 1) {
		const angle = Math.PI / 180 * (60 * i);
		const x = size * Math.cos(angle);
		const y = size * Math.sin(angle);
		pts.push(`${x},${y}`);
	}
	return pts.join(' ');
};

export const Hex: React.FC<Props> = ({ center, size, fill, fillOpacity = 1, stroke = '#111827', strokeWidth = 1, onClick, children }) => {
	return (
		<g transform={`translate(${center.x}, ${center.y})`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
			<polygon points={polygonPoints(size)} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} />
			{children}
		</g>
	);
};


