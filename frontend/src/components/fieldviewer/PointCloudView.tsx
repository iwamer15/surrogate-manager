import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export interface CloudData {
  /** 中心を原点に寄せた xyz（3N） */
  pos: Float32Array
  value: Float32Array
  /** 閉ループ番号（0 = なし） */
  label: Float32Array
  /** 属する閉ループの孤立時刻（なしは大きな値） */
  iso: Float32Array
  /** 頂点色（3N） */
  color: Float32Array
  pitch: number
  radius: number
}

export interface ViewUniforms {
  clipMin: [number, number, number]
  clipMax: [number, number, number]
  valueMin: number
  selected: number
  contextAlpha: number
  hideContext: boolean
  /** 凝固進行の再生時刻。null なら通常表示 */
  playTime: number | null
  sizeScale: number
}

interface Props {
  data: CloudData | null
  uniforms: ViewUniforms
  focus: { center: number[]; size: number; seq: number } | null
  onPick?: (index: number | null) => void
}

const vertexShader = /* glsl */ `
  attribute vec3 color;
  attribute float value;
  attribute float label;
  attribute float iso;
  uniform float uPointWorld;
  uniform float uProj;
  uniform vec3 uClipMin;
  uniform vec3 uClipMax;
  uniform float uValueMin;
  uniform float uSelected;
  uniform float uCtxAlpha;
  uniform float uHideCtx;
  uniform float uPlay;
  uniform float uPlayTime;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    bool clipped = any(lessThan(position, uClipMin)) || any(greaterThan(position, uClipMax))
                   || value < uValueMin;
    vec3 c = color;
    float a = label > 0.5 ? 1.0 : uCtxAlpha;
    if (uHideCtx > 0.5 && label < 0.5) clipped = true;
    if (uPlay > 0.5) {
      if (value <= uPlayTime) {            // 凝固済み
        c = vec3(0.62, 0.65, 0.70); a = uCtxAlpha;
        if (uHideCtx > 0.5) clipped = true;
      } else if (uPlayTime >= iso) {       // 周囲から孤立した液相 = 閉ループ
        c = vec3(0.92, 0.16, 0.16); a = 1.0;
      } else {                             // つながっている液相
        c = vec3(0.20, 0.55, 0.95); a = 1.0;
      }
    }
    if (uSelected > 0.5 && abs(label - uSelected) > 0.5) a *= 0.12;
    if (clipped || a < 0.01) {
      gl_PointSize = 0.0;
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    } else {
      gl_PointSize = max(1.5, uPointWorld * uProj / -mv.z);
    }
    vColor = c;
    vAlpha = a;
  }
`

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    // 簡易な陰影でボクセル感を出す
    float shade = 1.0 - 0.35 * (d.x - d.y);
    gl_FragColor = vec4(vColor * shade, vAlpha);
  }
`

export function PointCloudView({ data, uniforms, focus, onPick }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const ctx = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    material: THREE.ShaderMaterial
    points: THREE.Points | null
    axes: THREE.AxesHelper
    render: () => void
  } | null>(null)
  const dataRef = useRef<CloudData | null>(null)
  const uniRef = useRef(uniforms)
  uniRef.current = uniforms
  const pickRef = useRef(onPick)
  pickRef.current = onPick

  // 初期化
  useEffect(() => {
    const host = hostRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setClearColor(0x0f172a)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1e6)
    camera.up.set(0, 0, 1) // 鋳造品は Z 上向き
    camera.position.set(200, -200, 160)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, transparent: true,
      uniforms: {
        uPointWorld: { value: 2 }, uProj: { value: 500 },
        uClipMin: { value: new THREE.Vector3() }, uClipMax: { value: new THREE.Vector3() },
        uValueMin: { value: -1e30 }, uSelected: { value: 0 },
        uCtxAlpha: { value: 1 }, uHideCtx: { value: 0 },
        uPlay: { value: 0 }, uPlayTime: { value: 0 },
      },
    })
    const axes = new THREE.AxesHelper(20)
    scene.add(axes)

    let raf = 0
    let dirty = true
    const render = () => { dirty = true }
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (controls.update() || dirty) {
        renderer.render(scene, camera)
        dirty = false
      }
    }
    controls.addEventListener('change', render)

    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      material.uniforms.uProj.value =
        (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
      render()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()
    loop()

    // クリックで点を拾う（ドラッグは無視）
    let down: [number, number] | null = null
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY] }
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return
      pickRef.current?.(pick(e))
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    const pick = (e: PointerEvent): number | null => {
      const d = dataRef.current
      const pts = ctx.current?.points
      if (!d || !pts) return null
      const rect = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      const rc = new THREE.Raycaster()
      rc.params.Points = { threshold: d.pitch * 0.6 }
      rc.setFromCamera(ndc, camera)
      const u = uniRef.current
      for (const hit of rc.intersectObject(pts)) {
        const i = hit.index!
        if (isVisible(d, u, i)) return i
      }
      return null
    }

    ctx.current = { renderer, scene, camera, controls, material, points: null, axes, render }
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      material.dispose()
      ctx.current?.points?.geometry.dispose()
      renderer.dispose()
      host.removeChild(renderer.domElement)
      ctx.current = null
    }
  }, [])

  // ジオメトリ（点群が変わった時だけ作り直す）
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    const prev = dataRef.current
    dataRef.current = data
    if (!data) {
      if (c.points) { c.scene.remove(c.points); c.points.geometry.dispose(); c.points = null }
      c.render()
      return
    }
    if (c.points && prev && prev.pos === data.pos) {
      const g = c.points.geometry
      ;(['color', 'label', 'iso'] as const).forEach((k) => {
        const attr = g.getAttribute(k) as THREE.BufferAttribute
        if (attr.array !== data[k]) {
          g.setAttribute(k, new THREE.BufferAttribute(data[k], k === 'color' ? 3 : 1))
        }
      })
      c.render()
      return
    }
    if (c.points) { c.scene.remove(c.points); c.points.geometry.dispose() }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(data.pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(data.color, 3))
    g.setAttribute('value', new THREE.BufferAttribute(data.value, 1))
    g.setAttribute('label', new THREE.BufferAttribute(data.label, 1))
    g.setAttribute('iso', new THREE.BufferAttribute(data.iso, 1))
    g.computeBoundingSphere()
    c.points = new THREE.Points(g, c.material)
    c.scene.add(c.points)
    c.material.uniforms.uPointWorld.value = data.pitch
    c.axes.scale.setScalar(data.radius / 20 * 0.4)
    // 初回はモデル全体が入るようにカメラを置く
    if (!prev || prev.pos.length !== data.pos.length || prev.radius !== data.radius) {
      const r = data.radius
      c.controls.target.set(0, 0, 0)
      c.camera.position.set(r * 1.6, -r * 2.0, r * 1.3)
      c.camera.near = r / 100
      c.camera.far = r * 100
      c.camera.updateProjectionMatrix()
    }
    c.render()
  }, [data])

  // 表示条件
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    const u = c.material.uniforms
    u.uClipMin.value.set(...uniforms.clipMin)
    u.uClipMax.value.set(...uniforms.clipMax)
    u.uValueMin.value = uniforms.valueMin
    u.uSelected.value = uniforms.selected
    u.uCtxAlpha.value = uniforms.contextAlpha
    u.uHideCtx.value = uniforms.hideContext ? 1 : 0
    u.uPlay.value = uniforms.playTime == null ? 0 : 1
    u.uPlayTime.value = uniforms.playTime ?? 0
    if (data) u.uPointWorld.value = data.pitch * uniforms.sizeScale
    // 半透明が混ざる時は奥行き書き込みを切って重なりを見やすくする
    c.material.depthWrite = uniforms.contextAlpha >= 0.99
    c.render()
  }, [uniforms, data])

  // 指定位置へカメラを寄せる
  useEffect(() => {
    const c = ctx.current
    if (!c || !focus) return
    const target = new THREE.Vector3(...(focus.center as [number, number, number]))
    const dir = c.camera.position.clone().sub(c.controls.target).normalize()
    const dist = Math.max(focus.size * 2.5, (dataRef.current?.pitch ?? 2) * 15)
    c.controls.target.copy(target)
    c.camera.position.copy(target.clone().add(dir.multiplyScalar(dist)))
    c.render()
  }, [focus])

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
}

function isVisible(d: CloudData, u: ViewUniforms, i: number) {
  for (let k = 0; k < 3; k++) {
    const p = d.pos[i * 3 + k]
    if (p < u.clipMin[k] || p > u.clipMax[k]) return false
  }
  if (d.value[i] < u.valueMin) return false
  if (u.playTime != null) {
    if (d.value[i] <= u.playTime && (u.hideContext || u.contextAlpha < 0.05)) return false
    return true
  }
  if (d.label[i] < 0.5 && (u.hideContext || u.contextAlpha < 0.05)) return false
  return true
}
