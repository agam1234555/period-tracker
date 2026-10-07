import { tap } from './haptics'

// Toggle button used for flow, symptoms and mood. State is conveyed by a check mark and aria-pressed,
// never by colour alone.
export function Chip({ on, onClick, disabled, emoji, children, role }: {
  on: boolean; onClick: () => void; disabled?: boolean; emoji?: string; children: React.ReactNode; role?: 'radio'
}) {
  const aria = role === 'radio' ? { role, 'aria-checked': on } : { 'aria-pressed': on }
  return (
    <button type="button" className={'chip tog' + (on ? ' on' : '')} disabled={disabled} onClick={() => { tap(); onClick() }} {...aria}>
      <span className="tick" aria-hidden="true">{on ? '✓' : emoji ?? ''}</span>
      {children}
    </button>
  )
}
