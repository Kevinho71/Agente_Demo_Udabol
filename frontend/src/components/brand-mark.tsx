export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.5 9.5h17M3.5 14.5h17" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 4.5v15M17 4.5v15" stroke="currentColor" strokeWidth="1.4" opacity="0.45" />
      <rect x="9.5" y="11.5" width="5" height="3" fill="currentColor" />
    </svg>
  )
}
