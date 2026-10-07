import { TABS, type Tab } from './tabs'
import { tap } from './haptics'

export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="tabs" aria-label="Main">
      <div className="tabs-in" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls="panel" className="tab" onClick={() => { tap(); onTab(id) }}>
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
