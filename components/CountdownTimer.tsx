import React, { useState, useEffect } from 'react';

interface CountdownTimerProps {
  promotionEnd: number;
  discountPrice: number;
  originalPrice: number;
  currency: string;
}

function formatTimeUnit(n: number): string {
  return n.toString().padStart(2, '0');
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  promotionEnd,
  discountPrice,
  originalPrice,
  currency,
}) => {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(promotionEnd));

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = getTimeLeft(promotionEnd);
      setTimeLeft(remaining);
      if (remaining.total <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [promotionEnd]);

  if (timeLeft.total <= 0) return null;

  const discount = Math.round(((originalPrice - discountPrice) / originalPrice) * 100);

  return (
    <div className="relative overflow-hidden rounded-xl border border-red-500/30 bg-gradient-to-r from-red-500/10 via-orange-500/10 to-yellow-500/10 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-2xl">&#x23F3;</span>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">
              Promotion se termine dans
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              {timeLeft.days > 0 && (
                <TimeBox value={timeLeft.days} label="j" />
              )}
              <TimeBox value={timeLeft.hours} label="h" />
              <span className="text-red-400 font-bold text-lg animate-pulse">:</span>
              <TimeBox value={timeLeft.minutes} label="m" />
              <span className="text-red-400 font-bold text-lg animate-pulse">:</span>
              <TimeBox value={timeLeft.seconds} label="s" />
            </div>
          </div>
        </div>
        <div className="bg-red-500 text-white text-sm font-bold px-3 py-1.5 rounded-full shadow-lg shadow-red-500/30">
          -{discount}%
        </div>
      </div>
    </div>
  );
};

function TimeBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-0.5">
      <span className="bg-gray-800 text-white font-mono font-bold text-lg px-2 py-1 rounded-md min-w-[2.5rem] text-center border border-gray-700">
        {formatTimeUnit(value)}
      </span>
      <span className="text-gray-500 text-[10px] font-medium">{label}</span>
    </div>
  );
}

function getTimeLeft(endTime: number) {
  const total = Math.max(0, endTime - Date.now());
  return {
    total,
    days: Math.floor(total / (1000 * 60 * 60 * 24)),
    hours: Math.floor((total / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((total / (1000 * 60)) % 60),
    seconds: Math.floor((total / 1000) % 60),
  };
}
