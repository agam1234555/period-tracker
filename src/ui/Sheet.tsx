import { useEffect, useRef, type ReactNode } from 'react'

interface Props { open: boolean; title: string; onClose: () => void; children: ReactNode }

/** Bottom sheet: slides up over a dimmed backdrop. Closes on Done, backdrop tap, or Escape. */
export function Sheet({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null // give focus back here on close
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden' // the page behind must not scroll
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener('keydown', onKey); opener?.focus?.() }
  }, [open, onClose])
  if (!open) return null
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="grab" aria-hidden="true" />
        <div className="sheet-head">
          <strong>{title}</strong>
          <button className="link" onClick={onClose}>Done</button>
        </div>
        {children}
      </div>
    </>
  )
}
