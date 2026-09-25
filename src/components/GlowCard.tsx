import React, { useRef } from 'react';
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
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cardRef.current.style.setProperty('--mouse-x', `${x}px`);
    cardRef.current.style.setProperty('--mouse-y', `${y}px`);
  };

  return (
    <motion.div
      ref={cardRef}
      id={id}
      key={`${id || ''}_${vehicleKey}`}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`relative overflow-hidden group select-none ${className}`}
      style={{
        ['--mouse-x' as any]: '50%',
        ['--mouse-y' as any]: '50%',
      }}
    >
      {/* Subtle radial glow adhering to cursor using CSS variables (zero React re-renders) */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-300 opacity-0 group-hover:opacity-100 rounded-[inherit] hidden sm:block"
        style={{
          background: `radial-gradient(180px circle at var(--mouse-x) var(--mouse-y), ${
            isSelected 
              ? 'rgba(16, 185, 129, 0.12)' 
              : 'rgba(16, 185, 129, 0.06)'
          }, transparent 70%)`,
          zIndex: 1,
        }}
      />

      {/* Content wrapper */}
      <div className="relative z-10 w-full h-full flex flex-col justify-between">
        {children}
      </div>
    </motion.div>
  );
};
