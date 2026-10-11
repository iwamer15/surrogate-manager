const BASE = '/api/v1'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  samples: {
    list: () => request<import('./types').Sample[]>('/samples/'),
    get: (id: number) => request<import('./types').Sample>(`/samples/${id}`),
    create: (body: import('./types').SampleCreate) =>
      request<import('./types').Sample>('/samples/', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: import('./types').SampleUpdate) =>
      request<import('./types').Sample>(`/samples/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: number) => request<void>(`/samples/${id}`, { method: 'DELETE' }),
  },
  modelVersions: {
    list: () => request<import('./types').ModelVersion[]>('/model-versions/'),
    get: (id: number) => request<import('./types').ModelVersion>(`/model-versions/${id}`),
    create: (body: import('./types').ModelVersionCreate) =>
      request<import('./types').ModelVersion>('/model-versions/', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: import('./types').ModelVersionUpdate) =>
      request<import('./types').ModelVersion>(`/model-versions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: number) => request<void>(`/model-versions/${id}`, { method: 'DELETE' }),
    addSamples: (id: number, samples: { sample_id: number; split: string }[]) =>
      request<import('./types').ModelVersion>(`/model-versions/${id}/samples`, {
        method: 'POST',
        body: JSON.stringify({ samples }),
      }),
    removeSample: (versionId: number, sampleId: number) =>
      request<void>(`/model-versions/${versionId}/samples/${sampleId}`, { method: 'DELETE' }),
  },
  predictions: {
    list: (params?: { sample_id?: number; model_version_id?: number }) => {
      const q = new URLSearchParams()
      if (params?.sample_id != null) q.set('sample_id', String(params.sample_id))
      if (params?.model_version_id != null) q.set('model_version_id', String(params.model_version_id))
      const qs = q.toString()
      return request<import('./types').Prediction[]>(`/predictions/${qs ? `?${qs}` : ''}`)
    },
    get: (id: number) => request<import('./types').Prediction>(`/predictions/${id}`),
    create: (body: import('./types').PredictionCreate) =>
      request<import('./types').Prediction>('/predictions/', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: number) => request<void>(`/predictions/${id}`, { method: 'DELETE' }),
  },
  todos: {
    list: () => request<import('./types').Todo[]>('/todos/'),
    create: (body: import('./types').TodoCreate) =>
      request<import('./types').Todo>('/todos/', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: import('./types').TodoUpdate) =>
      request<import('./types').Todo>(`/todos/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: number) => request<void>(`/todos/${id}`, { method: 'DELETE' }),
  },
  users: {
    list: () => request<import('./types').User[]>('/users/'),
    create: (body: { name: string; email: string; role?: string }) =>
      request<import('./types').User>('/users/', { method: 'POST', body: JSON.stringify(body) }),
  },
  fields: {
    list: () => request<import('./types').FieldInfo[]>('/fields/'),
    files: () => request<import('./types').FieldFile[]>('/fields/files'),
    demo: () => request<import('./types').FieldInfo>('/fields/demo', { method: 'POST' }),
    load: (path: string, pitch?: number) =>
      request<import('./types').FieldInfo>('/fields/load', {
        method: 'POST', body: JSON.stringify({ path, pitch: pitch ?? null }),
      }),
    upload: async (file: File, pitch?: number) => {
      const fd = new FormData()
      fd.append('file', file)
      if (pitch) fd.append('pitch', String(pitch))
      const res = await fetch(`${BASE}/fields/upload`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
      return res.json() as Promise<import('./types').FieldInfo>
    },
    /** [x, y, z, value] × N の Float32Array */
    points: async (id: string) => {
      const res = await fetch(`${BASE}/fields/${id}/points`)
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
      return new Float32Array(await res.arrayBuffer())
    },
    analyze: (id: string, body: import('./types').AnalyzeParams) =>
      request<import('./types').AnalyzeResult>(`/fields/${id}/analyze`, {
        method: 'POST', body: JSON.stringify(body),
      }),
    exportUrl: (id: string) => `${BASE}/fields/${id}/export.csv`,
  },
}
