import styles from './PlaceholderPage.module.css'

interface Props {
  title: string
  icon: string
}

export function PlaceholderPage({ title, icon }: Props) {
  return (
    <div className={styles.page}>
      <span className={styles.icon}>{icon}</span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.msg}>この機能は現在開発中です</p>
    </div>
  )
}
