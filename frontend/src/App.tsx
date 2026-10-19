import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { SamplesPage } from './pages/SamplesPage'
import { ModelVersionsPage } from './pages/ModelVersionsPage'
import { PredictionsPage } from './pages/PredictionsPage'
import { TodosPage } from './pages/TodosPage'
import { FieldViewerPage } from './pages/FieldViewerPage'
import styles from './App.module.css'

export type Page = 'samples' | 'versions' | 'predictions' | 'fields' | 'todos'

export default function App() {
  const [page, setPage] = useState<Page>('samples')

  return (
    <div className={styles.layout}>
      <Sidebar current={page} onNavigate={setPage} />
      <main className={styles.main}>
        {page === 'samples'     && <SamplesPage />}
        {page === 'versions'    && <ModelVersionsPage />}
        {page === 'predictions' && <PredictionsPage />}
        {page === 'fields'      && <FieldViewerPage />}
        {page === 'todos'       && <TodosPage />}
      </main>
    </div>
  )
}
