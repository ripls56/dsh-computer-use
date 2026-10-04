import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import Schema from '@deepseek-ai/schemastery'
import type { VisionSettings } from './vision.js'

export const name = 'computer-use-settings'

export const Config = Schema.object({})

const visionSettingsSchema: Schema<VisionSettings> = Schema.object({
  enabled: Schema.boolean().default(false),
  baseURL: Schema.string().default(''),
  apiKey: Schema.string().role('secret').default(''),
  model: Schema.string().default(''),
  maxTokens: Schema.number().step(1).min(64).max(8_192).default(1_000),
})

export function apply(ctx: Context): void {
  // DSH >= 0.2.0 serves every registered settings namespace to the browser
  // through the settings describe mirror, so the client half edits these two
  // namespaces through `ctx.configForms` directly. The old
  // `llm.registerConfigurableProviders` detour (needed by older builds whose
  // settings API only exposed model-provider namespaces) is gone: it added two
  // dead rows to the Models page without enabling editing there.
  ctx.inject(['settings'], (services) => {
    services.settings.register(settingsNamespace('computer-use-vision'), visionSettingsSchema, { applies: 'live' })
    // Master switch for the computer_* tools themselves, toggled by the
    // composer pill and readable by the tools' pre-execute gate.
    services.settings.register(settingsNamespace('computer-use-control'), Schema.object({
      enabled: Schema.boolean().default(true),
    }), { applies: 'live' })
  })
}
