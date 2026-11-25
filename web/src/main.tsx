import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, BookOpen, Database, FlaskConical, Wind } from 'lucide-react'
import Designer from './Designer'
import RecordLab from './RecordLab'
import Methods from './Methods'
import RecordingPlan from './RecordingPlan'
import type { ObservedWindow } from './recording-plan'
import type { Recording } from './recordings'
import '@fontsource-variable/dm-sans/wght.css'
import '@fontsource/instrument-serif/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import './style.css'

const views = [
  { id: 'designer', name: 'Experiment designer', Icon: FlaskConical },
  { id: 'validation', name: 'Blind validation', Icon: Activity },
  { id: 'explorer', name: 'Data explorer', Icon: Database },
  { id: 'methods', name: 'Methods', Icon: BookOpen },
] as const
type View = (typeof views)[number]['id'] | 'plan'
const current = (): View =>
  window.location.hash === '#plan'
    ? 'plan'
    : (views.find((v) => '#' + v.id === window.location.hash)?.id ?? 'designer')
function App() {
  const [view, setView] = useState<View>(current),
    [custom, setCustom] = useState<Recording | null>(null)
  const [observed, setObserved] = useState<ObservedWindow | null>(null)
  useEffect(() => {
    const change = () => {
      setView(current())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  useEffect(() => {
    document.title =
      'VentLab · ' +
      (view === 'plan' ? 'Plan my next measurement' : views.find((v) => v.id === view)?.name)
  }, [view])
  return (
    <>
      <a
        className="skip"
        href="#workspace"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('workspace')?.focus()
        }}
      >
        Skip to workspace
      </a>
      <header className="top">
        <div className="top-inner">
          <a className="brand" href="#designer" aria-label="VentLab home">
            <span className="brand-mark">
              <Wind size={27} strokeWidth={2} />
            </span>
            VentLab
          </a>
          <nav aria-label="Workspaces">
            {views.map(({ id, name, Icon }) => (
              <a
                href={'#' + id}
                key={id}
                className={id === view ? 'active' : ''}
                aria-current={id === view ? 'page' : undefined}
              >
                <Icon size={16} />
                {name}
              </a>
            ))}
          </nav>
          <span className="local">
            <span className="badge-dot" />
            Browser local
          </span>
        </div>
      </header>
      <main id="workspace" tabIndex={-1}>
        {view === 'plan' ? (
          observed ? (
            <RecordingPlan window={observed} />
          ) : (
            <section className="panel details-box">
              <h1>Choose a recording window</h1>
              <p>Recording plans stay in tab memory. Select a window to start a plan.</p>
              <a href="#explorer">Open Data explorer</a>
            </section>
          )
        ) : view === 'designer' ? (
          <Designer />
        ) : view === 'methods' ? (
          <Methods />
        ) : (
          <RecordLab
            key={view}
            blind={view === 'validation'}
            onPlan={(w) => {
              setObserved(w)
              window.location.hash = 'plan'
            }}
            custom={custom}
            onCustom={setCustom}
            onBench={() => {
              window.location.hash = 'methods'
            }}
          />
        )}
      </main>
      <footer>
        <span>
          <Wind size={16} />
          VentLab
        </span>
        <p>Scientific measurement workspace</p>
        <a href="#methods">Methods & limitations</a>
      </footer>
    </>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
