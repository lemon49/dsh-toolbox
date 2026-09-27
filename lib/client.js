/**
 * dsh-toolbox — 浏览器半边。
 *
 * 只剩一块功能：**待处理提醒** —— 审批 / 提问 / 计划复核出现时弹系统通知。
 * 它注册在「设置 → 工具箱」这个**独立分区**（`settings.section`）下，而不是
 * 塞进「设置 → 通用」的一行里：通用那一列只堆单行偏好，装不下带状态、开关
 * 和说明的功能块。
 *
 * 服务重启（一键热重启 + 前台启动器托管 / 分离助手）已整体移除，所以本文件
 * 不再有任何 fetch 调用，host 半边（lib/index.js）也只剩一个空壳入口。
 *
 * 提醒为什么要观察 `sessionStatus` 而不是监听 `approval/request`：
 * `approval/request` 是 waterfall，内置的 `ui-approval` 排在前面且处理完不调
 * `next()`，排在它后面的监听器根本轮不到。而 `ctx.uiSession.sessionStatus` 已经
 * 把 approval / question / plan-review 统一投影成 `pendingInteraction`，
 * 读它是纯观察：不改审批流程，也不依赖监听器顺序。
 */
window.__ModuleLoader__.load({
  id: 'dsh-toolbox',
  factory: (require) => {
    const react = require('react')
    const react_jsx_runtime = require('react/jsx-runtime')
    const { jsx, jsxs } = react_jsx_runtime

    /** 语言命名空间。 */
    const NS = 'toolbox'

    /**
     * 用 `{name}` 占位符填一段文案。
     * @param {string} template - 含占位符的文案。
     * @param {Record<string, unknown>} values - 填充值。
     * @returns {string} 填充结果。
     */
    function fmt(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (whole, key) => (
        Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : whole
      ))
    }

    //#region 文案

    const zh = {
      nav: '工具箱',

      notifyTitle: '待处理提醒',
      notifyDesc: '出现审批、提问或计划复核时弹出系统通知，浏览器最小化也能看见。',
      notifyTest: '发送测试',
      notifyRequest: '申请通知权限',
      notifyPermDefault: '尚未授予通知权限，点右侧按钮申请。',
      notifyPermDenied: '通知权限已被浏览器拒绝，请在地址栏的站点设置里手动允许。',
      notifyPermUnsupported: '当前浏览器不支持系统通知。',
      notifyPermGranted: '通知权限已授予。',
      notifyOn: '已开启',
      notifyOff: '已关闭',
      notifyOnlyHidden: '仅当页面在后台时提醒',
      notifyTestTitle: 'DeepSeek Harness',
      notifyTestBody: '这是一条测试通知，看到它就说明提醒已生效。',
      notifyWaitApproval: '需要审批',
      notifyWaitQuestion: '需要回答',
      notifyWaitPlan: '需要复核',
      notifyApprovalWhat: '请求调用 {tool}',
      notifyKindApproval: '等待你批准一次工具调用',
      notifyKindQuestion: '等待你回答一个问题',
      notifyKindPlanReview: '等待你复核计划',
      notifyKindUnknown: '等待你处理',
      notifySent: '已发送',
      notifyFailed: '发送失败',
    }

    const en = {
      nav: 'Toolbox',

      notifyTitle: 'Pending alerts',
      notifyDesc: 'Raise a system notification when an approval, question, or plan review is waiting — visible even with the browser minimized.',
      notifyTest: 'Send test',
      notifyRequest: 'Request permission',
      notifyPermDefault: 'Notification permission has not been granted yet — use the button on the right.',
      notifyPermDenied: 'The browser denied notification permission. Allow it from the site settings in the address bar.',
      notifyPermUnsupported: 'This browser does not support system notifications.',
      notifyPermGranted: 'Notification permission granted.',
      notifyOn: 'On',
      notifyOff: 'Off',
      notifyOnlyHidden: 'Only alert while the page is in the background',
      notifyTestTitle: 'DeepSeek Harness',
      notifyTestBody: 'This is a test notification — seeing it means alerts work.',
      notifyWaitApproval: 'Approval needed',
      notifyWaitQuestion: 'Answer needed',
      notifyWaitPlan: 'Review needed',
      notifyApprovalWhat: 'requests {tool}',
      notifyKindApproval: 'Waiting for your approval of a tool call',
      notifyKindQuestion: 'Waiting for your answer to a question',
      notifyKindPlanReview: 'Waiting for your plan review',
      notifyKindUnknown: 'Waiting for you',
      notifySent: 'Sent',
      notifyFailed: 'Failed to send',
    }

    //#endregion

    //#region 样式

    const CSS = [
      '.tb_page{display:flex;flex-direction:column;gap:14px}',
      '.tb_card{border:1px solid rgba(128,128,128,.22);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:8px}',
      '.tb_cardTitle{font-size:14px;font-weight:600;line-height:1.4;margin:0}',
      '.tb_desc{font-size:12px;opacity:.7;line-height:1.55;margin:0}',
      '.tb_line{font-size:12px;line-height:1.55;margin:0}',
      '.tb_ok{color:#16a34a}',
      '.tb_warn{color:#d97706}',
      '.tb_err{color:#dc2626}',
      '.tb_actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px}',
      '.tb_btn{appearance:none;border:1px solid rgba(128,128,128,.35);background:transparent;color:inherit;',
      'font:inherit;font-size:12px;line-height:1;padding:7px 12px;border-radius:6px;cursor:pointer;white-space:nowrap}',
      '.tb_btn:hover:not(:disabled){border-color:rgba(128,128,128,.7)}',
      '.tb_btn:disabled{opacity:.45;cursor:default}',
      '.tb_on{border-color:#16a34a;color:#16a34a}',
      '.tb_check{display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-top:2px}',
    ].join('')

    const STYLE_TAG_ID = 'dsh-toolbox/toolbox.css'

    if (typeof document !== 'undefined'
      && document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`) === null) {
      const tag = document.createElement('style')
      tag.dataset.pluginCss = STYLE_TAG_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    //#endregion

    //#region 面板：待处理提醒

    const STORAGE_KEY = 'dsh-toolbox/notify'
    const DEFAULTS = { enabled: true, onlyWhenHidden: true }

    /** @returns {{ enabled: boolean, onlyWhenHidden: boolean }} 当前偏好。 */
    function readPrefs() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw === null || raw === '') return { ...DEFAULTS }
        const parsed = JSON.parse(raw)
        return {
          enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled,
          onlyWhenHidden: typeof parsed.onlyWhenHidden === 'boolean' ? parsed.onlyWhenHidden : DEFAULTS.onlyWhenHidden,
        }
      } catch {
        return { ...DEFAULTS }
      }
    }

    let prefs = readPrefs()
    const prefListeners = new Set()

    /**
     * 写入偏好并广播。
     * @param {object} next - 完整的新偏好。
     */
    function writePrefs(next) {
      prefs = next
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* 隐私模式下写不进去，本次会话内仍然生效 */
      }
      for (const listener of [...prefListeners]) {
        try {
          listener()
        } catch {
          /* 单个订阅者出错不影响其它订阅者 */
        }
      }
    }

    /** @returns {'granted'|'denied'|'default'|'unsupported'} 当前通知权限。 */
    function permission() {
      if (typeof window.Notification === 'undefined') return 'unsupported'
      return window.Notification.permission
    }

    /** @returns {boolean} 现在是否应该弹通知。 */
    function shouldNotifyNow() {
      if (!prefs.enabled) return false
      if (permission() !== 'granted') return false
      if (prefs.onlyWhenHidden
        && typeof document !== 'undefined'
        && document.visibilityState === 'visible') return false
      return true
    }

    /**
     * 弹一条系统通知。
     * @param {string} title - 通知标题。
     * @param {string} body - 通知正文。
     * @param {string} tag - 去重标签。
     * @returns {boolean} 是否成功交给浏览器。
     */
    function show(title, body, tag) {
      if (permission() !== 'granted') return false
      try {
        const notification = new window.Notification(title, { body, tag, renotify: false })
        notification.onclick = () => {
          try { window.focus() } catch { /* 部分浏览器不允许脚本抢焦点 */ }
          try { notification.close() } catch { /* 已关闭 */ }
        }
        return true
      } catch {
        return false
      }
    }

    /**
     * 「待处理提醒」面板。
     * @param {{ t: (key: string) => string }} props - slot 提供的翻译函数。
     * @returns {object} React 元素。
     */
    function NotifyPanel(props) {
      const t = props.t
      const [enabled, setEnabled] = react.useState(prefs.enabled)
      const [status, setStatus] = react.useState(permission())
      const [onlyHidden, setOnlyHidden] = react.useState(prefs.onlyWhenHidden)
      const [flash, setFlash] = react.useState('')

      react.useEffect(() => {
        const update = () => {
          setEnabled(prefs.enabled)
          setStatus(permission())
          setOnlyHidden(prefs.onlyWhenHidden)
        }
        prefListeners.add(update)
        let observer
        try {
          navigator.permissions?.query?.({ name: 'notifications' }).then((result) => {
            observer = result
            result.onchange = update
          }).catch(() => { /* 部分浏览器不支持查询通知权限 */ })
        } catch {
          /* 忽略 */
        }
        return () => {
          prefListeners.delete(update)
          if (observer !== undefined) observer.onchange = null
        }
      }, [])

      const request = react.useCallback(() => {
        try {
          window.Notification.requestPermission().then((result) => setStatus(result)).catch(() => {})
        } catch {
          /* 忽略 */
        }
      }, [])

      const sendTest = react.useCallback(() => {
        const ok = show(t('notifyTestTitle'), t('notifyTestBody'), 'dsh-toolbox-test')
        setFlash(ok ? 'sent' : 'failed')
      }, [t])

      const toggle = react.useCallback(() => { writePrefs({ ...prefs, enabled: !prefs.enabled }) }, [])
      const toggleHidden = react.useCallback(() => {
        writePrefs({ ...prefs, onlyWhenHidden: !prefs.onlyWhenHidden })
      }, [])

      let hint
      let tone
      if (status === 'unsupported') {
        hint = t('notifyPermUnsupported')
        tone = 'err'
      } else if (status === 'denied') {
        hint = t('notifyPermDenied')
        tone = 'err'
      } else if (status === 'default') {
        hint = t('notifyPermDefault')
        tone = 'warn'
      } else {
        hint = t('notifyPermGranted')
        tone = 'ok'
      }

      const actions = []
      if (status === 'default') {
        actions.push(jsx('button', { className: 'tb_btn', onClick: request, children: t('notifyRequest') }))
      }
      if (status === 'granted') {
        actions.push(jsx('button', { className: 'tb_btn', onClick: sendTest, children: t('notifyTest') }))
      }
      actions.push(jsx('button', {
        className: enabled ? 'tb_btn tb_on' : 'tb_btn',
        onClick: toggle,
        disabled: status === 'unsupported',
        children: enabled ? t('notifyOn') : t('notifyOff'),
      }))

      return jsxs('section', {
        className: 'tb_card',
        children: [
          jsx('h3', { className: 'tb_cardTitle', children: t('notifyTitle') }),
          jsx('p', { className: 'tb_desc', children: t('notifyDesc') }),
          jsx('p', { className: `tb_line tb_${tone}`, children: hint }),
          enabled && status === 'granted'
            ? jsxs('label', {
              className: 'tb_check',
              children: [
                jsx('input', { type: 'checkbox', checked: onlyHidden, onChange: toggleHidden }),
                jsx('span', { children: t('notifyOnlyHidden') }),
              ],
            })
            : null,
          flash === '' ? null : jsx('p', {
            className: `tb_line tb_${flash === 'sent' ? 'ok' : 'err'}`,
            children: flash === 'sent' ? t('notifySent') : t('notifyFailed'),
          }),
          jsx('div', { className: 'tb_actions', children: actions }),
        ].filter(Boolean),
      })
    }

    /** 需要提醒的 `pendingInteraction.kind`。 */
    const NOTIFY_KINDS = new Set(['approval', 'question', 'plan-review'])

    /** kind → 笼统文案 key（拿不到具体内容时的兜底）。 */
    const KIND_KEY = {
      'approval': 'notifyKindApproval',
      'question': 'notifyKindQuestion',
      'plan-review': 'notifyKindPlanReview',
    }

    /** kind → 通知标题 key。 */
    const WAIT_KEY = {
      'approval': 'notifyWaitApproval',
      'question': 'notifyWaitQuestion',
      'plan-review': 'notifyWaitPlan',
    }

    /**
     * 把一条待处理交互说成**和它本身一致**的一句话。
     *
     * 只通知"有人找你"没有意义 —— 用户还得切回页面才知道要批什么、答什么，而
     * 提醒的全部价值就是让人不必切回去。所以这里尽量还原请求原文：
     *   - approval：`PendingApproval.toolName` + `reason`，即要调用哪个工具、为什么；
     *   - question / plan-review：`PendingQuestion.questions[0].question` 的问题原文。
     * 字段缺失或形状不对时退回笼统文案 —— 宁可少说，不编造内容。
     *
     * @param {object} pending - `sessionStatus` 里的 `pendingInteraction`。
     * @param {(key: string) => string} t - 翻译函数。
     * @returns {{ title: string, body: string }} 通知标题与正文。
     */
    function describePending(pending, t) {
      const kind = pending?.kind
      const title = t(WAIT_KEY[kind] ?? 'notifyKindUnknown')

      if (kind === 'approval') {
        const tool = typeof pending.toolName === 'string' ? pending.toolName.trim() : ''
        const reason = typeof pending.reason === 'string' ? pending.reason.trim() : ''
        const head = tool === '' ? t('notifyKindApproval') : fmt(t('notifyApprovalWhat'), { tool })
        return { title, body: reason === '' ? head : `${head} — ${reason}` }
      }

      const first = Array.isArray(pending?.questions) ? pending.questions[0] : undefined
      const question = typeof first?.question === 'string' ? first.question.trim() : ''
      if (question !== '') return { title, body: question }
      return { title, body: t(KIND_KEY[kind] ?? 'notifyKindUnknown') }
    }

    //#endregion

    //#region 页面外壳

    /**
     * 「工具箱」设置页的外壳：把面板铺开。
     * @param {{ t: (key: string) => string, renderSlot: (name: string, props: object) => unknown }} props - section 提供的翻译函数与子槽位渲染器。
     * @returns {object} React 元素。
     */
    function ToolboxSection(props) {
      return jsx('div', {
        className: 'tb_page',
        children: props.renderSlot('toolbox.item', {}),
      })
    }

    //#endregion

    //#region 插件主体

    /** 需要注入的 Client 服务。会话标题不在其列 —— 提醒不读会话名。 */
    const inject = ['uiSession', 'locale', 'slots']

    /**
     * @param {object} ctx - Client 根上下文。
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-toolbox: dictionaries')

      const t = ctx.locale.bind(NS)

      // 一个独立分区，而不是「通用」里的一行。
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'dsh-toolbox',
        order: 60,
        label: () => t('nav'),
        locale: NS,
        children: { 'toolbox.item': { kind: 'list', scope: 'root' } },
      }, ToolboxSection))

      ctx.slots.inject('toolbox.item', () => ctx.slots.register({
        name: 'toolbox.item',
        id: 'notify',
        order: 10,
        locale: NS,
      }, NotifyPanel))

      // ---- 待处理提醒的观察逻辑 ----

      /** 已成功提醒过的待处理请求 key。 */
      const notified = new Set()

      /**
       * 扫一遍会话状态，为**新出现**的待处理交互弹通知。
       *
       * `notified` 只在**真的弹了**之后才记账：页面在前台时先不弹、也不记，这样
       * 用户切到后台时 `visibilitychange` 再扫一遍就能补上，而不是永久错过 ——
       * 切走的那一刻正是最需要提醒的时候。
       */
      function inspect() {
        try {
          const snapshot = ctx.uiSession?.sessionStatus?.getSnapshot?.()
          if (snapshot === undefined || snapshot === null) return
          const alive = new Set()
          for (const status of snapshot.values()) {
            const pending = status?.pendingInteraction
            if (pending === undefined || pending === null) continue
            if (!NOTIFY_KINDS.has(pending.kind)) continue
            const key = String(pending.key)
            alive.add(key)
            if (notified.has(key)) continue
            if (!shouldNotifyNow()) continue
            const described = describePending(pending, t)
            notified.add(key)
            // 标题只写"需要什么"，不粘会话标题：会话标题是自动生成的、还会过期，
            // 带上一句别的会话的标题只会让人误以为这条提醒属于那个会话。
            show(described.title, described.body, key)
          }
          for (const key of [...notified]) if (!alive.has(key)) notified.delete(key)
        } catch (error) {
          // 提醒逻辑绝不能让 DSH 的会话状态管线出错。
          try { console.warn('[dsh-toolbox]', error) } catch { /* 忽略 */ }
        }
      }

      ctx.effect(
        () => ctx.uiSession.sessionStatus.subscribe(inspect),
        'dsh-toolbox: session status',
      )

      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {}
        const onVisibility = () => {
          if (document.visibilityState === 'hidden') inspect()
        }
        document.addEventListener('visibilitychange', onVisibility)
        return () => document.removeEventListener('visibilitychange', onVisibility)
      }, 'dsh-toolbox: visibility')

      inspect()
    }

    return { apply, inject }

    //#endregion
  },
})
