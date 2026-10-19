/**
 * モデルの版の状態を色付きのラベルで表示する。
 */
import type { ModelVersionStatus } from '../api/types'
import styles from './ModelVersionStatusBadge.module.css'

const config: Record<ModelVersionStatus, { label: string; cls: string }> = {
  draft:     { label: '下書き',   cls: 'draft' },
  training:  { label: '学習中',   cls: 'training' },
  trained:   { label: '学習済み', cls: 'trained' },
  validated: { label: '検証済み', cls: 'validated' },
  deployed:  { label: '運用中',   cls: 'deployed' },
}

export function ModelVersionStatusBadge({ status }: { status: ModelVersionStatus }) {
  const { label, cls } = config[status]
  return <span className={`${styles.badge} ${styles[cls]}`}>{label}</span>
}
