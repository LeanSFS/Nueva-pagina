import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  id?: string;
  delay?: number;
  vehicleKey?: string;
  isSelected?: boolean;
  type?: 'card' | 'panel';
}

export const GlowCard: React.FC<GlowCardProps> = ({
  children,
  className = '',
  onClick,
  id,
  delay = 0,
  vehicleKey = '',
  isSelected = false
}) => {
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setCoords({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <motion.div
      ref={cardRef}
      id={id}
      key={`${id || ''}_${vehicleKey}`}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`relative overflow-hidden group select-none ${className}`}
    >
      {/* Subtle radial glow adhering to cursor, only on desktop/devices with fine pointer */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-300 opacity-0 group-hover:opacity-100 rounded-[inherit] hidden sm:block"
        style={{
          background: `radial-gradient(180px circle at ${coords.x}px ${coords.y}px, ${
            isSelected 
              ? 'rgba(16, 185, 129, 0.12)' 
              : 'rgba(16, 185, 129, 0.06)'
          }, transparent 70%)`,
          zIndex: 1,
        }}
      />
      
      {/* Premium accent border highlighting cursor glow vector on mousemove (fine pointers only) */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-300 opacity-0 group-hover:opacity-100 rounded-[inherit] border border-emerald-500/15 hidden sm:block"
        style={{
          maskImage: `radial-gradient(180px circle at ${coords.x}px ${coords.y}px, black, transparent 70%)`,
          WebkitMaskImage: `radial-gradient(180px circle at ${coords.x}px ${coords.y}px, black, transparent 70%)`,
          zIndex: 2,
        }}
      />
      
      {/* Content wrapper to preserve z-indexing and layout hierarchy */}
      <div className="relative z-10 w-full h-full flex flex-col justify-between">
        {children}
      </div>
    </motion.div>
  );
};
