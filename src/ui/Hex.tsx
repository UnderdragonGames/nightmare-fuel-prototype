import React from 'react';

type Props = {
	center: { x: number; y: number };
	size: number;
	fill: string;
	splitFills?: [string, string];
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

export const Hex: React.FC<Props> = ({ center, size, fill, splitFills, fillOpacity = 1, stroke = '#111827', strokeWidth = 1, onClick, children }) => {
	const idBase = `hex-${Math.round(center.x)}-${Math.round(center.y)}`;
	const pts = polygonPoints(size);
	return (
		<g transform={`translate(${center.x}, ${center.y})`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
			{splitFills ? (
				<>
					<defs>
						<clipPath id={`${idBase}-left`}>
							<rect x={-size} y={-size * Math.sqrt(3) / 2} width={size} height={size * Math.sqrt(3)} />
						</clipPath>
						<clipPath id={`${idBase}-right`}>
							<rect x={0} y={-size * Math.sqrt(3) / 2} width={size} height={size * Math.sqrt(3)} />
						</clipPath>
					</defs>
					<polygon points={pts} fill={splitFills[0]} fillOpacity={fillOpacity} clipPath={`url(#${idBase}-left)`} />
					<polygon points={pts} fill={splitFills[1]} fillOpacity={fillOpacity} clipPath={`url(#${idBase}-right)`} />
					<polygon points={pts} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
				</>
			) : (
				<polygon points={pts} fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} />
			)}
			{children}
		</g>
	);
};


