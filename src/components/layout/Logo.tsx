import React from 'react';

interface LogoProps {
  className?: string;
  variant?: 'full' | 'icon' | 'badge';
  theme?: 'light' | 'dark';
}

export default function ScoutMasterLogo({ 
  className = "h-9 w-auto", 
  variant = 'full',
  theme = 'light'
}: LogoProps) {
  if (variant === 'icon') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" fill="none" className={className}>
        <defs>
          <linearGradient id="agesciBlueIcon" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0B3B60" />
            <stop offset="100%" stopColor="#002B49" />
          </linearGradient>
          <linearGradient id="scoutGoldIcon" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFC72C" />
            <stop offset="100%" stopColor="#FFB81C" />
          </linearGradient>
        </defs>
        <circle cx="40" cy="40" r="38" fill="url(#agesciBlueIcon)" />
        <circle cx="40" cy="40" r="35" stroke="#FFB81C" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
        <g transform="translate(40, 40) scale(0.65) translate(-40, -42)">
          <path d="M40 8 L48 34 C48 34 44 38 40 40 C36 38 32 34 32 34 Z" fill="url(#scoutGoldIcon)" />
          <path d="M40 8 L40 40 L48 34 Z" fill="#FFA000" opacity="0.35" />
          <path d="M30 36 C22 32 14 38 16 48 C18 56 26 56 31 52 C33 46 34 40 34 40 Z" fill="url(#scoutGoldIcon)" />
          <path d="M50 36 C58 32 66 38 64 48 C62 56 54 56 49 52 C47 46 46 40 46 40 Z" fill="url(#scoutGoldFull)" />
          <rect x="27" y="52" width="26" height="5" rx="2.5" fill="#FFFFFF" />
          <path d="M33 58 C33 66 40 70 40 70 C40 70 47 66 47 58 Z" fill="url(#scoutGoldIcon)" />
          <circle cx="40" cy="28" r="2.2" fill="#FFFFFF" />
        </g>
      </svg>
    );
  }

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 100" fill="none" className={className}>
      <defs>
        <linearGradient id="agesciBlueFull" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0B3B60" />
          <stop offset="100%" stopColor="#002B49" />
        </linearGradient>
        <linearGradient id="scoutGoldFull" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFC72C" />
          <stop offset="100%" stopColor="#FFB81C" />
        </linearGradient>
      </defs>
      <g transform="translate(10, 10)">
        <circle cx="40" cy="40" r="38" fill="url(#agesciBlueFull)" />
        <circle cx="40" cy="40" r="35" stroke="#FFB81C" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
        <g transform="translate(40, 40) scale(0.65) translate(-40, -42)">
          <path d="M40 8 L48 34 C48 34 44 38 40 40 C36 38 32 34 32 34 Z" fill="url(#scoutGoldFull)" />
          <path d="M40 8 L40 40 L48 34 Z" fill="#FFA000" opacity="0.35" />
          <path d="M30 36 C22 32 14 38 16 48 C18 56 26 56 31 52 C33 46 34 40 34 40 Z" fill="url(#scoutGoldFull)" />
          <path d="M50 36 C58 32 66 38 64 48 C62 56 54 56 49 52 C47 46 46 40 46 40 Z" fill="url(#scoutGoldFull)" />
          <rect x="27" y="52" width="26" height="5" rx="2.5" fill="#FFFFFF" />
          <path d="M33 58 C33 66 40 70 40 70 C40 70 47 66 47 58 Z" fill="url(#scoutGoldFull)" />
          <circle cx="40" cy="28" r="2.2" fill="#FFFFFF" />
        </g>
      </g>
      <g transform="translate(105, 0)">
        <text x="0" y="56" fill={theme === 'dark' ? '#FFFFFF' : '#002B49'} fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="36" letterSpacing="1">
          SCOUT
        </text>
        <text x="128" y="56" fill={theme === 'dark' ? '#93C5FD' : '#0B3B60'} fontFamily="system-ui, sans-serif" fontWeight="400" fontSize="36" letterSpacing="1">
          MASTER
        </text>
        <rect x="282" y="32" width="46" height="22" rx="6" fill="#2E7D32" />
        <text x="305" y="47" fill="#FFFFFF" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="12" textAnchor="middle">
          3.0
        </text>
        <text x="2" y="76" fill={theme === 'dark' ? '#94A3B8' : '#64748B'} fontFamily="system-ui, sans-serif" fontWeight="600" fontSize="11" letterSpacing="2.8">
          GESTIONALE BRANCA E/G • AGESCI
        </text>
      </g>
    </svg>
  );
}
