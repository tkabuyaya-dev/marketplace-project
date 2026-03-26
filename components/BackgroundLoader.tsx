import React from 'react';

/**
 * Thin animated gold bar at the top of the screen.
 * Shows when data is syncing in the background (2G/3G friendly).
 */
export const BackgroundLoader: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[2px] overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-gold-400 via-gold-500 to-gold-400 animate-pulse"
        style={{
          animation: 'bgloader 1.5s ease-in-out infinite',
          backgroundSize: '200% 100%',
        }}
      />
      <style>{`
        @keyframes bgloader {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};
