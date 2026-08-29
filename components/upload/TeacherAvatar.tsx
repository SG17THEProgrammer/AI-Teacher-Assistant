export function TeacherAvatar() {
  return (
    <div className="relative flex h-[120px] w-[120px] items-center justify-center">
      <span className="absolute inset-0 rounded-full bg-brand-100 animate-pulse-ring" />
      <span className="absolute inset-[10px] rounded-full bg-brand-200/70" />
      <div className="relative flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-white bg-canvas-200 shadow-floating">
        <svg viewBox="0 0 64 64" className="h-10 w-10 text-ink-500" fill="none">
          <circle cx="32" cy="22" r="12" fill="currentColor" opacity="0.85" />
          <path
            d="M10 58c0-13 9.8-22 22-22s22 9 22 22"
            fill="currentColor"
            opacity="0.85"
          />
          <rect x="24" y="30" width="16" height="12" rx="3" fill="white" opacity="0.9" />
        </svg>
      </div>
      {[
        { top: '-2px', right: '10px' },
        { bottom: '4px', left: '-4px' },
        { bottom: '-2px', right: '18px' },
      ].map((pos, i) => (
        <span
          key={i}
          style={pos}
          className="absolute flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white shadow-floating"
        >
          {i === 0 ? '✓' : i === 1 ? '$' : '✎'}
        </span>
      ))}
    </div>
  );
}
