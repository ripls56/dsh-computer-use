// Runnable check for the host half: exercises both entry points' apply() with
// a fake Cordis context over the REAL schemastery/dsh-settings/dsh-tools
// packages pinned to the versions the DSH runtime ships (see devDependencies).
import { describe, expect, it } from 'vitest'

const CONFIG = { requireApproval: true, actionDelayMs: 80, maxScreenshotWidth: 1600, maxScreenshotHeight: 1200 }

interface Registered { ns: unknown, schema: any, opts: any }

function makeSettingsCtx(registered: Registered[], deps: string[]) {
  return {
    inject(d: string[], cb: (services: any) => void) {
      deps.push(...d)
      cb({
        settings: {
          register(ns: unknown, schema: any, opts: any) {
            registered.push({ ns, schema, opts })
            return { get: () => ({}) }
          },
        },
      })
    },
  } as any
}

function makeToolsCtx(settingsValue: unknown) {
  const tools: any[] = []
  const handlers: Array<{ event: string, fn: any }> = []
  const ctx = {
    on(event: string, fn: any) { handlers.push({ event, fn }) },
    tools: { register(def: any) { tools.push(def) } },
    settings: { get: () => settingsValue },
  } as any
  return { ctx, tools, handlers }
}

describe('host half: computer-use-settings entry', () => {
  it('registers both live settings namespaces through ctx.inject', async () => {
    const mod = await import('../src/index.js')
    const registered: Registered[] = []
    const deps: string[] = []
    mod.apply(makeSettingsCtx(registered, deps))
    expect(deps).toEqual(['settings'])
    expect(registered.map(entry => String(entry.ns))).toEqual(['computer-use-vision', 'computer-use-control'])
    expect(registered.every(entry => entry.opts?.applies === 'live')).toBe(true)
  })

  it('resolves the documented schema defaults', async () => {
    const mod = await import('../src/index.js')
    const registered: Registered[] = []
    mod.apply(makeSettingsCtx(registered, []))
    const [vision, control] = registered
    expect(vision.schema({})).toEqual({ enabled: false, baseURL: '', apiKey: '', model: '', maxTokens: 1000 })
    expect(vision.schema({ maxTokens: 512 }).maxTokens).toBe(512)
    expect(() => vision.schema({ maxTokens: 8 })).toThrow()
    expect(control.schema({})).toEqual({ enabled: true })
  })
})

describe('host half: computer-use tools entry', () => {
  it('registers the eight computer_* tools against the real dsh-tools runtime', async () => {
    const mod = await import('../src/tools.js')
    const { ctx, tools } = makeToolsCtx(undefined)
    mod.apply(ctx, CONFIG)
    expect(tools.map(tool => tool.name)).toEqual([
      'computer_screenshot', 'computer_observe', 'computer_click', 'computer_drag',
      'computer_type', 'computer_keypress', 'computer_scroll', 'computer_wait',
    ])
    for (const tool of tools) {
      expect(typeof tool.execute).toBe('function')
      expect(typeof tool.output.render).toBe('function')
      expect(typeof tool.description).toBe('string')
    }
  })

  it('denies every computer_* call while the master switch is off', async () => {
    const mod = await import('../src/tools.js')
    const { ctx, handlers } = makeToolsCtx({ enabled: false })
    mod.apply(ctx, CONFIG)
    expect(handlers.map(entry => entry.event)).toEqual(['tools/pre-execute', 'tools/pre-execute'])
    let nextCalled = false
    const decision = await handlers[0].fn({ name: 'computer_click' }, async () => { nextCalled = true; return { kind: 'allow' } })
    expect(decision.kind).toBe('deny')
    expect(nextCalled).toBe(false)
  })

  it('asks for approval on computer_* calls and passes foreign tools through', async () => {
    const mod = await import('../src/tools.js')
    const { ctx, handlers } = makeToolsCtx({ enabled: true })
    mod.apply(ctx, CONFIG)
    const [enabledGate, approvalGate] = handlers.map(entry => entry.fn)
    const ask = await enabledGate(
      { name: 'computer_screenshot' },
      () => approvalGate({ name: 'computer_screenshot' }, async () => ({ kind: 'allow' })),
    )
    expect(ask).toEqual({ kind: 'ask', reason: 'Computer Use requests permission to screenshot.' })
    const foreign = await enabledGate(
      { name: 'read' },
      () => approvalGate({ name: 'read' }, async () => ({ kind: 'allow' })),
    )
    expect(foreign).toEqual({ kind: 'allow' })
  })

  it('treats a missing control namespace as enabled', async () => {
    const mod = await import('../src/tools.js')
    const { ctx, handlers } = makeToolsCtx(undefined)
    mod.apply(ctx, CONFIG)
    const decision = await handlers[0].fn({ name: 'computer_wait' }, async () => ({ kind: 'allow' }))
    expect(decision).toEqual({ kind: 'allow' })
  })

  it('honors requireApproval: false by registering only the enabled gate', async () => {
    const mod = await import('../src/tools.js')
    const { ctx, handlers } = makeToolsCtx({ enabled: true })
    mod.apply(ctx, { ...CONFIG, requireApproval: false })
    expect(handlers).toHaveLength(1)
    const decision = await handlers[0].fn({ name: 'computer_click' }, async () => ({ kind: 'allow' }))
    expect(decision).toEqual({ kind: 'allow' })
  })

  it('rejects an invalid plugin config at apply time', async () => {
    const mod = await import('../src/tools.js')
    const { ctx } = makeToolsCtx(undefined)
    expect(() => mod.apply(ctx, { ...CONFIG, actionDelayMs: 5000 })).toThrow('actionDelayMs')
    expect(() => mod.apply(ctx, { ...CONFIG, maxScreenshotWidth: 100 })).toThrow('320x240')
  })

  it('runs computer_wait end to end and rejects out-of-range durations', async () => {
    const mod = await import('../src/tools.js')
    const { ctx, tools } = makeToolsCtx(undefined)
    mod.apply(ctx, CONFIG)
    const wait = tools.find(tool => tool.name === 'computer_wait')
    const started = Date.now()
    await expect(wait.execute({ durationMs: 30 }, {})).resolves.toBe('Waited 30ms.')
    expect(Date.now() - started).toBeGreaterThanOrEqual(25)
    await expect(wait.execute({ durationMs: 10_001 }, {})).rejects.toThrow('between 0 and 10000')
    await expect(wait.execute({}, {})).resolves.toBe('Waited 500ms.')
  })

  it('validates click arguments before any input is sent', async () => {
    const mod = await import('../src/tools.js')
    const { ctx, tools } = makeToolsCtx(undefined)
    mod.apply(ctx, CONFIG)
    const click = tools.find(tool => tool.name === 'computer_click')
    // Bounds come from the real driver (Windows), then assertPoint must reject
    // the non-integer coordinate before any input action is dispatched.
    await expect(click.execute({ x: 1.5, y: 0 }, {})).rejects.toThrow(/integer/)
  })
})
