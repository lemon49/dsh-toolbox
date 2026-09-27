# dsh-toolbox

> DSH 工具箱：**待处理交互提醒**。设置集中在**「设置 → 工具箱」独立页面**，不挤在「通用」里。

> **v2.0.0 起本插件只做这一件事。**
> 原来的「一键热重启 dsh 服务」（连同前台启动器托管 / 分离助手两种重启方式、
> `lib/relaunch.js`、`scripts/dsh-foreground.ps1`）已整体移除 —— 服务怎么起、
> 怎么停完全由你的启动方式决定，插件不再插手，也不再有 `/api/toolbox/*` 这些
> HTTP 端点。

## 待处理提醒

审批、提问、计划复核出现时弹系统通知，浏览器最小化也能看见。实现是**纯观察**：
只读 `sessionStatus`，不改审批流程，也不依赖监听器顺序。

**什么时候不提醒**：页面在前台时（「仅当页面在后台时提醒」默认勾选）。

**通知内容**：标题写"需要什么"（需要审批 / 需要回答 / 需要复核），正文尽量
还原请求原文 —— 审批写「请求调用 {tool} — {reason}」，提问与计划复核写
`questions[0].question` 的原文；字段缺失才退回笼统文案（宁可少说，不编造）。
标题里**不带会话标题**：会话标题是自动生成、还会过期的，粘上去只会让人误以为
这条提醒属于那个旧会话。

## 安装

```powershell
dsh plugin --profile web add link:D:\codex\dsh-toolbox
```

安装之后，`cordis.patch.yml` 会插到 profile 树里：

```yaml
inserts:
  - path: .plugins
    after: last
    entries:
      - id: toolbox
        name: dsh-toolbox
```

浏览器半边（`lib/client.js`）不经过 host，而是通过 `package.json` 里的
`dsh.client` 声明被发现与注入，由客户端模块图去跑。

### 同名残留是静默失败

安装时如果把 bundle 名 `@deepseek-ai/dsh-toolbox` 误写成包名 `dsh-toolbox`，
Deduped 行显示的和 `cordis.patch.yml` 引用的模块一致，插件看起来"安装成功"；
此时 `ctx.slots.register` 返回 `null`，分区静默消失、控制台不报错。
**必须从真正的包目录 `pnpm run dev` 起**（用 `npm run dev` 会把 Vite 依赖预构建
成新物理文件，client 侧出现两个模块实例，`window.__ModuleLoader__.load` 会被
重新覆盖，链上先注册的半边失效）。

### 用 `dsh plugin start` 启动插件不能用 cmd 内建命令

`bin.mjs` 是在**插件目录**下 `spawn('cmd.exe', ...)` 启动 shell 的，
`dsh plugin start` 的 cwd 又固定插件目录。此时命令行第一段若是 cmd 内建
（`cd`、`set`、`pushd`…），cmd 会自己吃掉它，后面拼的 `/k` 整行被当成内建的
参数、完全不执行。

改用可被识别为可执行文件的命令即可（`dir` 是 cmd 内建，`cmd /c dir` 第一段是
`cmd`，所以 `dsh plugin start cmd /c dir C:\` 能跑通）。

## 使用

打开「设置 → 工具箱」，分区下只有一个「待处理提醒」面板。

### 步骤 1：授予通知权限

点「申请通知权限」并允许。按钮只在浏览器返回 `'default'`（尚未询问）时出现。
浏览器一旦拒绝就永久记住拒绝，后续 `requestPermission()` 不再弹窗，只能从地址
栏的站点设置里手动放行。当前状态会实时显示在按钮左边：已授予是绿色、未询问是
黄色、已拒绝或不支持是红色。

### 步骤 2：确认提醒行为

- 「已开启 / 已关闭」控制是否弹通知（`localStorage` 里的持久化偏好，刷新和重启浏览器都保留）。
- 「发送测试」立刻弹一条通知，用于确认浏览器层没被拦住。
- 「仅当页面在后台时提醒」默认勾选：页面在前台时你正在看着它，再弹就是打扰。
  切走时会补发（见下），不是错过就永远错过。

### 为什么这么设计

**「仅当页面在后台时提醒」必须"在前台时不弹、也不记账"**。`notified` 这本账
只在**真的弹了**之后才划掉，所以页面在前台时新出现的待处理请求仍然算"没提醒过"，
用户切到后台时 `visibilitychange` 再扫一遍就能补上，而不是永久错过 ——
切走的那一刻正是最需要提醒的时候。

**不监听 `approval/request`，只观察 `sessionStatus`**：`approval/request` 是
waterfall，内置的 `ui-approval` 排在前面且处理完不调 `next()`，排在它后面的
监听器根本轮不到。而 `ctx.uiSession.sessionStatus` 已经把 approval / question /
plan-review 统一投影成 `pendingInteraction`，读它是纯观察：不改审批流程，
也不依赖监听器顺序。

**通知内容必须和那条请求本身一致**（哪个工具、什么问题），而不是笼统的"有人找你" ——
否则用户照样得切回页面才知道要批什么，提醒就白弹了。

**不注入 `sessions` 服务**：提醒只需要"哪一条待处理"，不需要会话标题。
少一个跨半边的契约，就没有标题过期、标题不存在这类边缘情况要管。

### 限制

- **非同协议提醒可能被浏览器拦掉**：页面走 HTTPS 时，通知点击处理器会
  `window.focus()`，而焦点落在 HTTP 页面上属于跨协议导航，浏览器会拦截。
  点通知只是把你带回这个页面，拦了也不影响提醒本身出现。
- **系统层面没开通知开关**时浏览器会返回 `'denied'`，插件无法区分"用户拒绝"和
  "系统关闭"，只能照常显示已拒绝并提示去站点设置里改。
- **不支持 `Notification` 的环境**里按钮保持禁用，只显示不支持。
- **通知去重靠 `tag`**：同一条待处理的第二次提醒会替换前一条而不是叠加。
- **偏好存 `localStorage`**：换浏览器或清站点数据后回到默认值
  （默认开启 + 仅后台提醒）。
- **`kind` 不在白名单内时不提醒**，即使 `pendingInteraction` 有值。

## 结构

- `lib/index.js` — host 侧**空壳**，只导出插件名与一个 no-op `apply`。
  不注册路由、不读服务状态、不 `spawn`。保留它是为了满足 `cordis.patch.yml`
  插入的插件行；删掉它整包加载失败，浏览器半边也起不来。
- `lib/client.js` — 浏览器侧，**唯一的功能实现**：独立设置分区 + 提醒面板 +
  观察 `sessionStatus` 的提醒逻辑（偏好、权限、去重、补发全在这里）。
- `cordis.patch.yml` — 把插件插进 profile 树。
- `package.json` 的 `dsh.client` — 声明客户端平台与注入的 Client 服务
  （`uiSession` / `locale` / `slots`）。

## 测试

```powershell
npm test        # node test/client.test.mjs
```

| 文件 | 覆盖范围 |
| --- | --- |
| `test/client.test.mjs` | 分区与面板注册契约、字典（含**不再有重启文案**）、提醒的每个时机分支、通知内容与请求一致、标题不带会话名、tag 去重与补发 —— 共 40 项断言。 |

宿主侧没有路由与进程管理可测，重启相关的测试（`host` / `engine` / `supervisor`）
已随功能一并删除。

## 相关

- 设置分区由 [`client-ui-settings`](../client-ui-settings/README.zh.md) 提供
- `settings.section` / `toolbox.item` 由 [`client-ui-slots`](../client-ui-slots/README.zh.md) 提供
- Client 注入声明见 [`client-runtime`](../client-runtime/README.zh.md)
