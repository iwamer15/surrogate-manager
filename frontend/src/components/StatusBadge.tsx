import type { SampleStatus } from '../api/types'
import styles from './StatusBadge.module.css'

const labelMap: Record<SampleStatus, string> = {
  registered: '登録済み',
  processing: '処理中',
  completed: '完了',
  error: 'エラー',
}

export function StatusBadge({ status }: { status: SampleStatus }) {
  return (
    <span className={`${styles.badge} ${styles[status]}`}>
      {labelMap[status]}
    </span>
  )
}
