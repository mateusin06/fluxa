export function Logo({ dark = false, size = 28 }: { dark?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
        <circle cx="6" cy="15" r="4" fill="#B8F34A" />
        <path d="M10 15h9" stroke="#B8F34A" strokeWidth="3" strokeLinecap="round" />
        <path d="M18 8l8 7-8 7z" fill="#B8F34A" />
      </svg>
      <span className={`font-display font-bold tracking-wider ${dark ? 'text-white' : 'text-ink'}`} style={{ fontSize: size * 0.9 }}>FLUXA</span>
    </span>
  );
}
