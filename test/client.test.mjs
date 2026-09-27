/**
 * dsh-toolbox client bundle 的加载契约与行为测试。
 *
 * 四件事必须成立，否则这个插件就是坏的：
 *   1. bundle 以包名注册，并贡献**一个独立设置分区**（不再是「通用」里的一行）；
 *   2. 分区下只挂着「待处理提醒」一个面板 —— 服务重启已整体移除；
 *   3. 提醒的每一个时机分支都对 —— 弹错了是打扰，漏弹了是白装；
 *   4. 通知的内容**和那条请求本身一致**（哪个工具、什么问题），而不是笼统的
 *      "有人找你" —— 否则用户照样得切回页面才知道要批什么，提醒就白弹了；
 *   5. 通知标题里**不带会话标题**：会话标题是自动生成、还会过期的，粘上去只会
 *      让人误以为这条提醒属于那个旧会话。
 *
 * 翻译函数用**真实字典**而不是回显 key：第 4 条断言要检查插值后的成品文案，
 * 回显 key 的假 t 会让 `{tool}` 永远填不上，测试就失去意义。
 */

// ---------- 浏览器替身 ----------

const registrations = []
const notifications = []
const docListeners = new Map()
const store = new Map()
const injectedStyles = []

class FakeNotification {
  static permission = 'granted'
  static requestPermission = async () => 'granted'
  constructor(title, options) {
    this.title = title
    this.options = options
    notifications.push(this)
  }
  close() {}
}

globalThis.window = {
  __ModuleLoader__: { load: (registration) => { registrations.push(registration) } },
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)) },
  },
  Notification: FakeNotification,
  focus: () => {},
}

globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ dataset: {}, textContent: '' }),
  head: { appendChild: (tag) => { injectedStyles.push(tag) } },
  visibilityState: 'hidden',
  addEventListener: (type, listener) => { docListeners.set(type, listener) },
  removeEventListener: (type) => { docListeners.delete(type) },
}

// Node 24 的 globalThis.navigator 是只读 getter，只能这样替换。
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { permissions: { query: () => Promise.resolve({ onchange: null }) } },
})

// ---------- 加载 bundle ----------

await import(new URL('../lib/client.js', import.meta.url).href)

const reactStub = {
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  createElement: () => null,
  Fragment: Symbol('Fragment'),
}
const jsxStub = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
const require = (spec) => {
  if (spec === 'react') return reactStub
  if (spec === 'react/jsx-runtime') return jsxStub
  throw new Error(`unexpected external: ${spec}`)
}

const results = []
const check = (label, ok) => { results.push([label, ok]) }

check('bundle registers through __ModuleLoader__.load', registrations.length === 1)
const registration = registrations[0]
check('module id equals the package name', registration?.id === 'dsh-toolbox')

const mod = registration.factory(require)
check('exports.apply is a function', typeof mod.apply === 'function')
check('injects uiSession/locale/slots',
  Array.isArray(mod.inject)
  && ['uiSession', 'locale', 'slots'].every((name) => mod.inject.includes(name)))
check('does not depend on the sessions service', !mod.inject.includes('sessions'))
check('styles injected once', injectedStyles.length === 1)

// ---------- 假的 client 上下文 ----------

const state = new Map()
let statusListener = null
const slots = []
const locales = []
const rendered = []
/** apply() 注册进来的真实中文文案，供 translate 使用。 */
let dictionary = {}

const ctx = {
  effect: (fn) => fn(),
  locale: {
    register: (ns, dicts) => {
      locales.push([ns, Object.keys(dicts)])
      dictionary = dicts.zh
      return () => {}
    },
    bind: () => (key) => dictionary[key] ?? key,
  },
  slots: {
    inject: (name, cb) => { cb() },
    register: (options, component) => { slots.push([options, component]); return () => {} },
  },
  uiSession: {
    sessionStatus: {
      getSnapshot: () => state,
      subscribe: (listener) => { statusListener = listener; return () => { statusListener = null } },
    },
  },
}

mod.apply(ctx)

check('registers zh and en dictionaries',
  locales.some(([, langs]) => langs.includes('zh') && langs.includes('en')))
check('dictionary resolved for assertions', typeof dictionary.notifyWaitApproval === 'string')
check('dictionary carries no restart copy any more',
  dictionary.restartSupervised === undefined && dictionary.restartDetached === undefined)

// 关键断言：独立分区，而不是「通用」里的一行。
const section = slots.find(([options]) => options.name === 'settings.section')
check('registers its own settings section', section !== undefined)
check('section id is dsh-toolbox', section?.[0].id === 'dsh-toolbox')
check('section carries a nav label', typeof section?.[0].label === 'function')
check('section declares its child slot',
  section?.[0]?.children?.['toolbox.item']?.kind === 'list')
check('does NOT squeeze into settings.general.item',
  slots.every(([options]) => options.name !== 'settings.general.item'))

const items = slots.filter(([options]) => options.name === 'toolbox.item')
check('registers exactly one toolbox panel (restart removed)', items.length === 1)
check('no restart panel any more', items.some(([options]) => options.id === 'restart') === false)
check('registers the notify panel', items.some(([options]) => options.id === 'notify'))
check('subscription established without throwing', statusListener !== null)

// 分区外壳应当把子槽位渲出来。
const sectionComponent = section?.[1]
try {
  sectionComponent({ t: (key) => key, renderSlot: (name) => { rendered.push(name); return null } })
} catch (error) {
  console.log('section render threw:', error)
}
check('section renders its child slot', rendered.includes('toolbox.item'))

// 两个面板都能渲染。
for (const [options, component] of items) {
  let ok = false
  try {
    ok = component({ t: (key) => dictionary[key] ?? key }) !== null
  } catch (error) {
    console.log(`panel ${options.id} render threw:`, error)
  }
  check(`panel "${options.id}" renders without throwing`, ok)
}

// ---------- 提醒时机 ----------

/** 模拟一次"待处理交互出现"；`extra` 带上领域自己的请求字段。 */
const appear = (key, kind, sessionId = 's1', extra = {}) => {
  state.set(sessionId, { pendingInteraction: { key, kind, sessionId, ...extra } })
  statusListener()
}

const last = () => notifications[notifications.length - 1]

// 审批：请求体里有 toolName 和 reason。
appear('k1', 'approval', 's1', { toolName: 'Bash', reason: '需要删掉构建产物' })
check('alerts while the page is hidden', notifications.length === 1)
check('notification title says an approval is needed',
  String(last()?.title).includes(dictionary.notifyWaitApproval))
// 标题不粘会话名：会话标题是自动生成的、还会过期，弹窗里带上一句旧会话的标题
// 只会让人误以为提醒属于那个会话。
check('notification title names no session at all',
  String(last()?.title) === dictionary.notifyWaitApproval)
check('approval body names the requesting tool', String(last()?.options?.body).includes('Bash'))
check('approval body carries the requester reason',
  String(last()?.options?.body).includes('需要删掉构建产物'))
check('approval body leaves no unfilled placeholder',
  !String(last()?.options?.body).includes('{'))
check('notification tag is the pending key', last()?.options?.tag === 'k1')

appear('k1', 'approval', 's1', { toolName: 'Bash' })
check('does not repeat the same pending request', notifications.length === 1)

// 问题：请求体里是问题原文。前台先不出声，切后台时补上。
document.visibilityState = 'visible'
appear('k2', 'question', 's1', { questions: [{ id: 'q1', question: '配置写到哪个文件？' }] })
check('stays silent while the page is visible', notifications.length === 1)

document.visibilityState = 'hidden'
docListeners.get('visibilitychange')?.()
check('catches up when the page goes back to the background', notifications.length === 2)
check('catch-up notification quotes the question',
  String(last()?.options?.body).includes('配置写到哪个文件？'))
check('question title says an answer is needed',
  String(last()?.title).includes(dictionary.notifyWaitQuestion))

// 计划复核：同样引问题原文。
appear('k3', 'plan-review', 's1', { questions: [{ id: 'p1', question: '可以按这个计划实施吗？' }] })
check('alerts for plan review', notifications.length === 3)
check('plan-review body quotes the review question',
  String(last()?.options?.body).includes('可以按这个计划实施吗？'))
check('plan-review title says a review is needed',
  String(last()?.title).includes(dictionary.notifyWaitPlan))

// 请求体缺字段时退回笼统文案 —— 不编造内容。
appear('k6', 'approval', 's1')
check('falls back to a generic line when approval carries no detail',
  String(last()?.options?.body) === dictionary.notifyKindApproval)
appear('k7', 'question', 's1', { questions: [] })
check('falls back to a generic line when the question batch is empty',
  String(last()?.options?.body) === dictionary.notifyKindQuestion)

// 其它分支。
state.set('s1', { pendingInteraction: { key: 'k4', kind: 'something-else', sessionId: 's1' } })
statusListener()
check('ignores kinds outside the watch list', notifications.length === 5)

state.clear()
statusListener()
appear('k1', 'approval', 's1', { toolName: 'Read' })
check('reclaims keys after settlement', notifications.length === 6)

FakeNotification.permission = 'denied'
appear('k5', 'approval', 's1', { toolName: 'Bash' })
check('stays silent without permission', notifications.length === 6)
FakeNotification.permission = 'granted'

let failed = 0
for (const [label, ok] of results) {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)