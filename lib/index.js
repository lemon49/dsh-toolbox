/**
 * dsh-toolbox — host half.
 *
 * 本插件现在**只提供「待处理提醒」**，而提醒是浏览器半边自己的事：读
 * `ctx.uiSession.sessionStatus`、纯观察地把 approval / question / plan-review
 * 投影成一条系统通知，不改审批流程，也不依赖任何 host 能力。
 *
 * 所以 host 半边没有路由、没有状态、没有 spawn —— 服务重启（热重启、前台
 * 启动器托管、分离助手）已整体移除。
 *
 * 为什么这里还要留一个入口：`cordis.patch.yml` 往 profile 树里插入的正是
 * 本包这一行，删掉这个入口 bundle 就会加载失败，连带浏览器半边也起不来。
 * 这是个**空壳**，不是功能。
 * @module dsh-toolbox
 */

/** Cordis 插件名。 */
export const name = 'dsh-toolbox'

/**
 * 没有任何事要做。保留这个钩子是为了满足 Cordis 的插件契约。
 * @param {object} ctx - 插件上下文。
 */
export function apply(ctx) {
  void ctx
}
