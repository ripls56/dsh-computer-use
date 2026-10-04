// dsh-computer-use — browser (client) half.
//
// Two surfaces over the settings namespaces the Host plugin registers:
//   1. a "Computer Use Vision" card on the Plugins page (`plugins.item` slot),
//      editing `computer-use-vision` through `ctx.configForms` and the shared
//      `SettingsFormModel` / `SettingsForm` chrome of ui-primitives — the same
//      path the official settings pages (agent-loop, web-search) use;
//   2. a compact composer pill (`conversation.input.right`) toggling the
//      `computer-use-control.enabled` master switch for the computer_* tools.
//
// Rewritten for the DSH 0.2.0-rc.2 client API. The previous version targeted a
// client surface that no longer exists (`settingsScope` service,
// `settings.plugin.item` slot, `@deepseek-ai/dsh-client-runtime/client` module)
// and hand-rolled its own card chrome.

window.__ModuleLoader__.load({
	id: "@crazy_th/dsh-computer-use",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react_jsx_runtime = require("react/jsx-runtime");
		const P = require("@deepseek-ai/dsh-client-ui-primitives");
		const { createSnapshotStore } = require("@deepseek-ai/dsh-client-store");

		// ---------------------------------------------------------------- css
		// Only the composer pill needs custom chrome; the settings card rides the
		// official ui-primitives components and their theme tokens.
		const switchCss = ".cu_switch{font:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;height:28px;border-radius:14px;padding:0 12px;font-size:12px;line-height:1;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);transition:border-color .12s,background .12s,color .12s;white-space:nowrap}.cu_switch:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed);color:var(--dsw-alias-label-primary)}.cu_switch:disabled{cursor:default;opacity:.5}.cu_switchOn{color:var(--dsw-alias-button-info-foreground);border-color:var(--dsw-alias-button-info-fill);background:var(--dsw-alias-button-info-fill)}.cu_switchOn:hover:not(:disabled){border-color:var(--dsw-alias-button-info-hover);background:var(--dsw-alias-button-info-hover)}";
		const tagId = "@crazy_th/dsh-computer-use/switch.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@crazy_th/dsh-computer-use";
			tag.dataset.pluginCss = tagId;
			tag.textContent = switchCss;
			document.head.appendChild(tag);
		}

		// --------------------------------------------------------------- copy
		/** Dictionary namespace owned by this plugin. */
		const NS = "computer-use";
		/** Settings namespace the vision card edits (registered by the Host plugin). */
		const VISION_NS = "computer-use-vision";
		/** Settings namespace the composer pill edits (registered by the Host plugin). */
		const CONTROL_NS = "computer-use-control";
		/** Required client services. */
		const inject = ["slots", "locale", "configForms"];

		const en = {
			"settings.title": "Computer Use Vision",
			"settings.description": "Configure the vision model used by computer_observe to inspect screenshots.",
			"settings.unavailable": "This plugin is not loaded, so it cannot be configured right now.",
			"settings.readOnly": "This deployment is read-only: settings cannot be changed from the GUI.",
			"settings.saveFailed": "The deployment did not accept these values; they were left for you to correct.",
			"settings.save": "Save",
			"settings.saving": "Saving…",
			"settings.overridden": "Overridden",
			"settings.reset": "Reset to default",
			"settings.invalidNumber": "Enter a number, or leave blank to use the default.",
			"f.enabled": "Enabled",
			"f.enabledHint": "Master switch for the vision model used by computer_observe.",
			"f.apiKey": "API key",
			"f.apiKeyHint": "Stored server-side; never shown again. Leave blank to keep the current value.",
			"f.apiKeySet": "A key is configured.",
			"f.apiKeyUnset": "No key is configured.",
			"f.baseURL": "Base URL",
			"f.baseURLHint": "OpenAI-compatible HTTPS endpoint, e.g. https://api.example.com/v1. computer_observe sends screenshots only here.",
			"f.model": "Model",
			"f.modelHint": "Vision-capable model name served by the endpoint.",
			"f.maxTokens": "Max tokens",
			"f.maxTokensHint": "Response token limit for vision analysis (64–8192).",
			"switch.on": "Computer Use: On",
			"switch.off": "Computer Use: Off",
			"switch.onHint": "Computer Use is enabled. Click to disable the computer_* tools.",
			"switch.offHint": "Computer Use is disabled. Click to enable the computer_* tools."
		};

		const zh = {
			"settings.title": "Computer Use 视觉模型",
			"settings.description": "配置 computer_observe 分析截图所用的视觉模型。",
			"settings.unavailable": "该插件当前未加载，暂时无法配置。",
			"settings.readOnly": "当前部署为只读：GUI 无法修改设置。",
			"settings.saveFailed": "本部署没有接受这些值，已保留供你修改。",
			"settings.save": "保存",
			"settings.saving": "保存中…",
			"settings.overridden": "已覆盖",
			"settings.reset": "重置",
			"settings.invalidNumber": "请填数字；留空表示使用默认值。",
			"f.enabled": "启用",
			"f.enabledHint": "computer_observe 所用视觉模型的总开关。",
			"f.apiKey": "API Key",
			"f.apiKeyHint": "凭据仅保存在服务端，不会回显；留空表示保持原值。",
			"f.apiKeySet": "已配置密钥。",
			"f.apiKeyUnset": "未配置密钥。",
			"f.baseURL": "Base URL",
			"f.baseURLHint": "兼容 OpenAI 的 HTTPS 端点，例如 https://api.example.com/v1。computer_observe 只把截图发到这里。",
			"f.model": "模型",
			"f.modelHint": "该端点提供的支持视觉的模型名。",
			"f.maxTokens": "最大 Token",
			"f.maxTokensHint": "视觉分析的最大响应 token（64–8192）。",
			"switch.on": "电脑操作：开",
			"switch.off": "电脑操作：关",
			"switch.onHint": "Computer Use 已启用，点击可禁用 computer_* 工具。",
			"switch.offHint": "Computer Use 已禁用，点击可启用 computer_* 工具。"
		};

		/** The form frame's copy, read from this page's dictionary. */
		function formLabels(t) {
			return {
				unavailable: t("settings.unavailable"),
				readOnly: t("settings.readOnly"),
				saveFailed: t("settings.saveFailed"),
				save: t("settings.save"),
				saving: t("settings.saving")
			};
		}

		// --------------------------------------------------------- vision card
		/** A staged boolean field (the shared model has no built-in one). */
		const boolField = (field) => ({
			field,
			format: (value) => typeof value === "boolean" ? String(value) : "",
			parse: (text) => {
				if (text === "true") return { kind: "set", value: true };
				if (text === "false") return { kind: "set", value: false };
			}
		});

		/** The staged `enabled` switch row, laid out like the official toggles. */
		function EnabledRow(props) {
			const { t, state, disabled, onEdit } = props;
			return react_jsx_runtime.jsxs("div", {
				style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
				children: [
					react_jsx_runtime.jsxs("div", {
						children: [
							react_jsx_runtime.jsx("div", { style: { fontWeight: 500 }, children: t("f.enabled") }),
							react_jsx_runtime.jsx("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary)" }, children: t("f.enabledHint") })
						]
					}),
					react_jsx_runtime.jsx(P.Switch, {
						label: t("f.enabled"),
						disabled,
						checked: state.text === "true",
						onChange: (value) => onEdit(String(value))
					})
				]
			});
		}

		/**
		 * Render the vision card's one-liner or its settings form, as the
		 * Plugins page asks.
		 */
		function ComputerUseVisionCard(props) {
			const { t } = props;
			const s = props.useComputerUseVision((snapshot) => snapshot);
			if (props.view === "summary") return t("settings.description");
			const disabled = !s.writable;
			return react_jsx_runtime.jsxs(P.SettingsForm, {
				labels: formLabels(t),
				state: s,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					react_jsx_runtime.jsx(EnabledRow, { t, state: s.enabled, disabled, onEdit: (text) => props.edit("enabled", text) }),
					react_jsx_runtime.jsx(P.SettingsSecretField, {
						id: "plugin-config-computer-use-apiKey",
						label: t("f.apiKey"),
						hint: t("f.apiKeyHint"),
						disabled,
						text: s.apiKey.text,
						configured: s.apiKeyConfigured,
						stateLabel: t(s.apiKeyConfigured ? "f.apiKeySet" : "f.apiKeyUnset"),
						onEdit: (text) => props.edit("apiKey", text)
					}),
					react_jsx_runtime.jsx(P.SettingsValueField, {
						id: "plugin-config-computer-use-baseURL",
						label: t("f.baseURL"),
						hint: t("f.baseURLHint"),
						overriddenLabel: t("settings.overridden"),
						resetLabel: t("settings.reset"),
						invalidLabel: t("settings.invalidNumber"),
						placeholder: "https://api.example.com/v1",
						disabled,
						...s.baseURL,
						onEdit: (text) => props.edit("baseURL", text),
						onReset: () => props.resetField("baseURL")
					}),
					react_jsx_runtime.jsx(P.SettingsValueField, {
						id: "plugin-config-computer-use-model",
						label: t("f.model"),
						hint: t("f.modelHint"),
						overriddenLabel: t("settings.overridden"),
						resetLabel: t("settings.reset"),
						invalidLabel: t("settings.invalidNumber"),
						placeholder: "vision-model-name",
						disabled,
						...s.model,
						onEdit: (text) => props.edit("model", text),
						onReset: () => props.resetField("model")
					}),
					react_jsx_runtime.jsx(P.SettingsValueField, {
						id: "plugin-config-computer-use-maxTokens",
						label: t("f.maxTokens"),
						hint: t("f.maxTokensHint"),
						overriddenLabel: t("settings.overridden"),
						resetLabel: t("settings.reset"),
						invalidLabel: t("settings.invalidNumber"),
						numeric: true,
						placeholder: "1000",
						disabled,
						...s.maxTokens,
						onEdit: (text) => props.edit("maxTokens", text),
						onReset: () => props.resetField("maxTokens")
					})
				]
			});
		}

		/**
		 * Bridges the `computer-use-vision` scope onto the card's staged form.
		 *
		 * The API key is the one write-only control: its literal never rides a
		 * response, so the card learns only whether one is configured — from the
		 * describe mirror's `secrets` sidecar when the Host serves it, else from
		 * a local flag a successful write sets.
		 */
		var ComputerUseVisionCardController = class {
			constructor(scope, describe) {
				this.describe = describe;
				this.localKeySet = false;
				this.form = new P.SettingsFormModel(scope, [
					boolField("enabled"),
					P.settingsTextField("baseURL"),
					P.settingsTextField("model"),
					P.settingsNumberField("maxTokens")
				], [{
					field: "apiKey",
					write: async (value) => {
						const landed = await scope.set("apiKey", value);
						if (landed) this.localKeySet = true;
						return landed;
					}
				}]);
				this.store = this.form.bind(() => this.projection());
				// The form republishes on scope changes; also republish when the
				// shared mirror refreshes so the key's configured badge tracks a
				// write made elsewhere (another tab, a Host-side edit).
				this.offDescribe = describe.subscribe(() => this.store.set(this.projection()));
			}
			keyConfigured() {
				const view = this.describe.getSnapshot().view;
				const ns = view?.namespaces?.find((candidate) => candidate.ns === VISION_NS);
				const secret = ns?.secrets?.find((entry) => entry.path.length === 1 && entry.path[0] === "apiKey");
				return secret === undefined ? this.localKeySet : secret.set;
			}
			projection() {
				return {
					...this.form.shell(),
					enabled: this.form.field("enabled"),
					baseURL: this.form.field("baseURL"),
					model: this.form.field("model"),
					maxTokens: this.form.field("maxTokens"),
					apiKey: this.form.field("apiKey"),
					apiKeyConfigured: this.keyConfigured()
				};
			}
			inject() {
				return {
					hooks: { computerUseVision: this.store },
					...this.form.actions()
				};
			}
			dispose() {
				this.offDescribe();
				this.form.dispose();
			}
		};

		// ------------------------------------------------------- composer pill
		/**
		 * One compact composer pill that toggles the computer_* master switch
		 * (`computer-use-control.enabled`). It reads and writes through the same
		 * shared configForms scope but stages nothing: clicking flips the value.
		 */
		var ComputerUseSwitchController = class {
			constructor(scope) {
				this.scope = scope;
				this.store = createSnapshotStore(this.projection());
				this.off = scope.subscribe(() => this.store.set(this.projection()));
			}
			projection() {
				const snapshot = this.scope.getSnapshot();
				return {
					status: snapshot.status,
					writable: snapshot.writable,
					enabled: snapshot.value?.enabled !== false
				};
			}
			toggle() {
				const current = this.projection();
				if (current.status !== "ready" || !current.writable) return;
				this.scope.set("enabled", !current.enabled);
			}
			inject() {
				return {
					hooks: { computerUseSwitch: this.store },
					computerUseToggle: () => this.toggle()
				};
			}
		};

		/** Render the composer pill (only once the control namespace is served). */
		function ComputerUseSwitch(props) {
			const state = props.useComputerUseSwitch((snapshot) => snapshot);
			if (state.status !== "ready") return null;
			const on = state.enabled;
			return react_jsx_runtime.jsx("button", {
				type: "button",
				className: "cu_switch" + (on ? " cu_switchOn" : ""),
				title: props.t(on ? "switch.onHint" : "switch.offHint"),
				"aria-pressed": on,
				disabled: !state.writable,
				onClick: () => props.computerUseToggle(),
				children: on ? props.t("switch.on") : props.t("switch.off")
			});
		}

		// -------------------------------------------------------------- apply
		/**
		 * Mount both surfaces while the Host serves their namespaces.
		 * @param ctx - client root context (slots, locale, configForms).
		 */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { en, zh }), "dsh-computer-use: dictionaries");

			const describe = ctx.configForms.describe();
			const card = new ComputerUseVisionCardController(ctx.configForms.get(VISION_NS), describe);
			ctx.effect(() => () => card.dispose(), "dsh-computer-use: vision form");
			ctx.effect(() => ctx.configForms.whileServed([VISION_NS], () => ctx.slots.inject("plugins.item", () => ctx.slots.register({
				name: "plugins.item",
				id: VISION_NS,
				order: 60,
				label: () => t("settings.title"),
				locale: NS,
				inject: () => card.inject()
			}, ComputerUseVisionCard))), "dsh-computer-use: vision page");

			const control = new ComputerUseSwitchController(ctx.configForms.get(CONTROL_NS));
			ctx.effect(() => () => control.off(), "dsh-computer-use: switch subscription");
			ctx.effect(() => ctx.configForms.whileServed([CONTROL_NS], () => ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "@crazy_th/dsh-computer-use-switch",
				order: -40,
				locale: NS,
				inject: () => control.inject()
			}, ComputerUseSwitch))), "dsh-computer-use: switch");
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
