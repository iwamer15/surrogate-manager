/**
 * 左のメニュー。画面を増やすときは navItems と App.tsx の Page に追加する。
 */
import type { Page } from '../App'
import styles from './Sidebar.module.css'

interface Props {
  current: Page
  onNavigate: (page: Page) => void
}

const navItems: { page: Page; label: string; icon: string }[] = [
  { page: 'samples',     label: 'データ管理',     icon: '📦' },
  { page: 'versions',    label: 'バージョン管理', icon: '🔖' },
  { page: 'predictions', label: '予測結果管理',    icon: '📊' },
  { page: 'fields',      label: 'フィールド可視化', icon: '🧊' },
  { page: 'todos',       label: 'TODO',           icon: '✅' },
]

export function Sidebar({ current, onNavigate }: Props) {
  return (
    <nav className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>⚙️</span>
        <span className={styles.logoText}>Surrogate Manager</span>
      </div>
      <ul className={styles.nav}>
        {navItems.map(({ page, label, icon }) => (
          <li key={page}>
            <button
              className={`${styles.navItem} ${current === page ? styles.active : ''}`}
              onClick={() => onNavigate(page)}
            >
              <span className={styles.icon}>{icon}</span>
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
