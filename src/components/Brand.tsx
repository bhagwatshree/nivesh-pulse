export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'brand brand-compact' : 'brand'} aria-label="NiveshPulse">
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-bar bar-one" />
        <span className="brand-bar bar-two" />
        <span className="brand-bar bar-three" />
      </span>
      {!compact && (
        <span className="brand-name">
          Nivesh<span>Pulse</span>
        </span>
      )}
    </div>
  )
}
