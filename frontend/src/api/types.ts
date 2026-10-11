export type SampleStatus = 'registered' | 'processing' | 'completed' | 'error'
export type FileType = 'conditions' | 'results' | 'other'

export interface SampleFile {
  id: number
  sample_id: number
  file_type: FileType
  filename: string
  path: string
  created_at: string
}

export interface Sample {
  id: number
  name: string
  description: string | null
  stl_path: string | null
  status: SampleStatus
  dvc_rev: string | null
  git_commit: string | null
  created_at: string
  updated_at: string
  files: SampleFile[]
}

export interface SampleCreate {
  name: string
  description?: string
}

export interface SampleUpdate {
  name?: string
  description?: string
  status?: SampleStatus
}

// ── Model Versions ──────────────────────────────────────────
export type ModelVersionStatus = 'draft' | 'training' | 'trained' | 'validated' | 'deployed'
export type SampleSplit = 'train' | 'validation' | 'test'

export interface PerOutputMetric {
  mae: number
  rmse: number
  r2: number
}

export interface ModelVersionSampleRef {
  id: number
  sample_id: number
  split: SampleSplit
  sample_name: string
}

export interface ModelVersion {
  id: number
  version_name: string
  description: string | null
  algorithm: string | null
  status: ModelVersionStatus
  hyperparameters: Record<string, unknown> | null
  input_features: string[] | null
  target_outputs: string[] | null
  dvc_data_rev: string | null
  git_commit: string | null
  artifact_path: string | null
  mae: number | null
  rmse: number | null
  r2: number | null
  per_output_metrics: Record<string, PerOutputMetric> | null
  trained_at: string | null
  created_at: string
  updated_at: string
  version_samples: ModelVersionSampleRef[]
}

export interface ModelVersionCreate {
  version_name: string
  description?: string
  algorithm?: string
  hyperparameters?: Record<string, unknown>
  input_features?: string[]
  target_outputs?: string[]
  dvc_data_rev?: string
  artifact_path?: string
}

export interface ModelVersionUpdate {
  description?: string
  algorithm?: string
  status?: ModelVersionStatus
  hyperparameters?: Record<string, unknown>
  input_features?: string[]
  target_outputs?: string[]
  mae?: number
  rmse?: number
  r2?: number
  per_output_metrics?: Record<string, PerOutputMetric>
  artifact_path?: string
}

// ── Predictions ──────────────────────────────────────────────
export interface OutputComparison {
  predicted: number
  actual: number
  error: number
  abs_error: number
  rel_error_pct: number | null
}

export interface Prediction {
  id: number
  sample_id: number
  model_version_id: number | null
  predicted_values: Record<string, number> | null
  actual_values: Record<string, number> | null
  mae: number | null
  rmse: number | null
  r2: number | null
  per_output_metrics: Record<string, OutputComparison> | null
  note: string | null
  predicted_at: string
  sample_name: string
  model_version_name: string
}

export interface PredictionCreate {
  sample_id: number
  model_version_id?: number
  predicted_values: Record<string, number>
  actual_values?: Record<string, number>
  note?: string
}

// ── Todos ────────────────────────────────────────────────────
export type TodoStatus = 'open' | 'in_progress' | 'done'
export type TodoPriority = 'low' | 'medium' | 'high'

export interface Todo {
  id: number
  title: string
  description: string | null
  status: TodoStatus
  priority: TodoPriority
  assignee_id: number | null
  assignee_name: string
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface TodoCreate {
  title: string
  description?: string
  priority?: TodoPriority
  assignee_id?: number
  due_date?: string
}

export interface TodoUpdate {
  title?: string
  description?: string
  status?: TodoStatus
  priority?: TodoPriority
  assignee_id?: number | null
  due_date?: string | null
}

// ── Users ─────────────────────────────────────────────────────
export type UserRole = 'admin' | 'member'

export interface User {
  id: number
  name: string
  email: string
  role: UserRole
  created_at: string
}

// ── フィールド（点群）閉ループ解析 ─────────────────────────
export interface FieldInfo {
  id: string
  name: string
  points: number
  columns: string[]
  pitch: number[]
  shape: number[]
  bounds_min: number[]
  bounds_max: number[]
  value_min: number
  value_max: number
}

export interface FieldFile { path: string; size: number }

export interface AnalyzeParams {
  connectivity: 6 | 18 | 26
  radius: number
  custom_offsets: number[][] | null
  min_delta_t: number
  min_voxels: number
  max_loops?: number
}

export interface ClosedLoop {
  id: number
  peak_time: number
  isolation_time: number
  delta_t: number
  voxels: number
  volume_mm3: number
  centroid: number[]
  peak_xyz: number[]
  bbox_min: number[]
  bbox_max: number[]
}

export interface AnalyzeResult {
  loops: ClosedLoop[]
  final_regions: { peak_time: number; peak_xyz: number[] }[]
  candidates: number
  offsets: number[][]
  elapsed_sec: number
  labels_b64: string
}
