// Runnable check for the browser half: loads lib/client.js the way the DSH
// ModuleLoader does, drives apply() with a fake client context, and asserts
// the two slot registrations, the dictionary, the pill projection/toggle, and
// the vision card projection (including the secrets-sidecar key state).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface Registered { def: Record<string, unknown>, component: unknown }

function loadClientModule() {
  const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  let registered: { id: string, factory: (require: (id: string) => unknown) => unknown } | undefined
  const fakeWindow = { __ModuleLoader__: { load: (m: typeof registered) => { registered = m } } }
  // eslint-disable-next no-new-func
  new Function('window', code)(fakeWindow)
  if (registered === undefined) throw new Error('client.js did not register a module')

  // Faithful mini-stub of the ui-primitives staged form: same call surface the
  // real SettingsFormModel gives a card controller (constructor(scope, specs,
  // secrets), bind/shell/field/actions/dispose).
  class SettingsFormModelStub {
    scope: any
    specs: Map<string, any>
    secretSpecs: Map<string, any>
    staged = new Map<string, { text: string }>()
    constructor(scope: any, specs: any[], secrets: any[] = []) {
      this.scope = scope
      this.specs = new Map(specs.map((s: any) => [s.field, s]))
      this.secretSpecs = new Map(secrets.map((s: any) => [s.field, s]))
      scope.subscribe(() => {})
    }
    bind(project: () => any) { const snap = project(); return { getSnapshot: () => snap, set: () => {}, subscribe: () => () => {} } }
    shell() { return { available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false } }
    field(field: string) {
      if (this.secretSpecs.has(field)) return { text: '', overridden: false, invalid: false }
      return { text: String(this.scope.getSnapshot().value?.[field] ?? ''), overridden: false, invalid: false }
    }
    actions() { return { edit: () => {}, resetField: () => {}, save: () => {}, discard: () => {} } }
    dispose() {}
  }

  const primitives = {
    SettingsFormModel: SettingsFormModelStub,
    SettingsForm: (props: unknown) => ({ kind: 'form', props }),
    SettingsValueField: (props: unknown) => ({ kind: 'value', props }),
    SettingsSecretField: (props: unknown) => ({ kind: 'secret', props }),
    Switch: (props: unknown) => ({ kind: 'switch', props }),
    settingsTextField: (field: string) => ({ field, format: String, parse: () => undefined }),
    settingsNumberField: (field: string) => ({ field, format: String, parse: () => undefined }),
  }
  const store = { createSnapshotStore: (init: unknown) => ({ init, getSnapshot: () => init, set: () => {}, subscribe: () => () => {} }) }
  const jsx = {
    jsx: (type: unknown, props: unknown) => ({ type, props }),
    jsxs: (type: unknown, props: unknown) => ({ type, props }),
    Fragment: 'Fragment',
  }
  const fakeRequire = (id: string) => {
    if (id === 'react/jsx-runtime') return jsx
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    if (id === '@deepseek-ai/dsh-client-store') return store
    throw new Error(`unexpected client require: ${id}`)
  }
  const mod = (registered as { factory: (r: (id: string) => unknown) => any }).factory(fakeRequire) as {
    apply: (ctx: unknown) => void
    inject: string[]
  }
  return { mod, jsx, primitives }
}

function makeScope(value: Record<string, unknown>, status = 'ready') {
  const writes: Array<[string, unknown]> = []
  return {
    writes,
    getSnapshot: () => ({ status, writable: true, value, base: {}, user: {}, revision: 1 }),
    subscribe: () => () => {},
    set: async (field: string, v: unknown) => { writes.push([field, v]); return true },
    unset: async () => true,
    mutate: async () => true,
  }
}

function makeCtx() {
  const registrations: Registered[] = []
  const dictionaries: Record<string, unknown> = {}
  const visionScope = makeScope({ enabled: false, baseURL: 'https://v.example/v1', model: 'vis', maxTokens: 1000 })
  const controlScope = makeScope({ enabled: true })
  const describe = {
    getSnapshot: () => ({ status: 'ready', view: { writable: true, namespaces: [
      { ns: 'computer-use-vision', secrets: [{ path: ['apiKey'], set: true }] },
    ] } }),
    subscribe: () => () => {},
    ensure: () => {},
  }
  const ctx = {
    registrations,
    dictionaries,
    visionScope,
    controlScope,
    locale: {
      bind: () => (key: string) => key,
      register: (ns: string, dict: unknown) => { dictionaries[ns] = dict; return () => {} },
    },
    effect: (fn: () => unknown) => fn(),
    configForms: {
      describe: () => describe,
      get: (ns: string) => ns === 'computer-use-vision' ? visionScope : controlScope,
      whileServed: (_ns: string[], register: () => () => void) => register(),
    },
    slots: {
      inject: (_name: string, register: () => unknown) => register(),
      register: (def: Record<string, unknown>, component: unknown) => { registrations.push({ def, component }); return () => {} },
    },
  }
  return ctx
}

describe('client half wiring', () => {
  it('loads through the ModuleLoader facade and declares current services', () => {
    const { mod } = loadClientModule()
    expect(mod.inject).toEqual(['slots', 'locale', 'configForms'])
    expect(typeof mod.apply).toBe('function')
  })

  it('requires only module ids the DSH client actually serves', () => {
    // loadClientModule throws on any other require id.
    expect(() => loadClientModule()).not.toThrow()
  })

  it('registers the vision card on plugins.item and the pill on conversation.input.right', () => {
    const { mod } = loadClientModule()
    const ctx = makeCtx()
    mod.apply(ctx)
    expect(Object.keys(ctx.dictionaries)).toContain('computer-use')
    const names = ctx.registrations.map(r => r.def.name)
    expect(names).toContain('plugins.item')
    expect(names).toContain('conversation.input.right')
    const pill = ctx.registrations.find(r => r.def.name === 'conversation.input.right')!
    expect(pill.def.id).toBe('@crazy_th/dsh-computer-use-switch')
  })

  it('projects the pill state and toggles the master switch through the scope', () => {
    const { mod } = loadClientModule()
    const ctx = makeCtx()
    mod.apply(ctx)
    const pill = ctx.registrations.find(r => r.def.name === 'conversation.input.right')!
    const face = (pill.def.inject as () => Record<string, unknown>)()
    const hooks = face.hooks as Record<string, { getSnapshot: () => any }>
    const state = hooks.computerUseSwitch.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.enabled).toBe(true)
    ;(face.computerUseToggle as () => void)()
    expect(ctx.controlScope.writes).toEqual([['enabled', false]])
  })

  it('renders the pill only when the control namespace is served', () => {
    const { mod, jsx } = loadClientModule()
    const ctx = makeCtx()
    ctx.controlScope.getSnapshot = () => ({ status: 'loading', writable: false, value: undefined, base: undefined, user: undefined, revision: undefined })
    mod.apply(ctx)
    const pill = ctx.registrations.find(r => r.def.name === 'conversation.input.right')!
    const face = (pill.def.inject as () => Record<string, unknown>)()
    const hooks = face.hooks as Record<string, { getSnapshot: () => any }>
    const element = (pill.component as (props: any) => any)({
      t: (k: string) => k,
      useComputerUseSwitch: (sel: (s: any) => any) => sel(hooks.computerUseSwitch.getSnapshot()),
      computerUseToggle: face.computerUseToggle,
    })
    expect(element).toBeNull()
    void jsx
  })

  it('reads the API-key configured badge from the describe mirror secrets sidecar', () => {
    const { mod } = loadClientModule()
    const ctx = makeCtx()
    mod.apply(ctx)
    const card = ctx.registrations.find(r => r.def.name === 'plugins.item')!
    const face = (card.def.inject as () => Record<string, unknown>)()
    const hooks = face.hooks as Record<string, { getSnapshot: () => any }>
    const state = hooks.computerUseVision.getSnapshot()
    expect(state.apiKeyConfigured).toBe(true)
    expect(state.baseURL.text).toBe('https://v.example/v1')
    expect(typeof face.save).toBe('function')
    expect(typeof face.edit).toBe('function')
  })
})
