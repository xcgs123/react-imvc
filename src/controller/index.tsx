// base controller class
import 'whatwg-fetch'
import express from 'express'
import React from 'react'
import Cookie from 'js-cookie'
import querystring from 'query-string'
import {
  createStore,
  Store,
  Data,
  Actions
} from 'relite'
import {
  Controller as AppController,
  Actions as HistoryActions,
  HistoryLocation,
  createHistory
} from 'create-app/server'
import {
  HistoryWithBFOL,
  ILWithBQ,
  BLWithBQ
} from 'create-history'
import {
  BaseViewFC,
  BaseViewClass,
  Preload,
  API,
  Context,
  BaseState,
  Handlers,
  Meta,
  Location
} from '..'
import * as shareActions from './actions'
import attachDevToolsIfPossible from './attachDevToolsIfPossible'
import ViewManager from '../component/ViewManager'
import _ from '../util'

export type BaseActions = typeof shareActions

const REDIRECT =
  typeof Symbol === 'function'
    ? Symbol('react.imvc.redirect')
    : Object('react.imvc.redirect')
const EmptyView = <Ctrl extends Controller<any, any>>(props?: {
  state?: {
    aa?: string
  },
  actions?: {
    AAA?: () => void
  },
  ctrl?: Ctrl
}) => null

let uid = 0 // seed of controller id
// fixed: webpack rebuild lost original React.createElement
// @ts-ignore
let createElement = React.originalCreateElement || React.createElement

/**
 * 绑定 Store 到 View
 * 提供 Controller 的生命周期钩子
 * 组装事件处理器 Event Handlers
 * 提供 fetch 方法
 */
export default class Controller<
  S extends object = {},
  AS extends Actions<S & BaseState> = {},
  ES extends object = {},
  EAS extends Actions<S & BaseState & ES> = {}
> implements AppController {
  View: React.ComponentType<any> = EmptyView
  restapi?: string
  preload: Preload
  API?: API
  Model?: { initialState: S } & AS
  initialState: S = {} as S
  actions: AS = {} as AS
  SSR?: boolean | { (location: Location, context: Context): Promise<boolean> } | undefined
  KeepAliveOnPush?: boolean | undefined
  store: Store<S & BaseState & ES, AS & BaseActions & EAS>
  context: Context
  history: HistoryWithBFOL<BLWithBQ, ILWithBQ>
  handlers: Handlers
  location: Location
  meta: Meta
  proxyHandler?: {
    attach(): void
    detach(): void
  }
  resetScrollOnMount?: boolean
  Loading: BaseViewFC | BaseViewClass = () => null

  errorDidCatch?(error: Error, str: string): void
  getComponentFallback?(displayName: string, InputComponent: React.ComponentType): React.ReactElement
  getViewFallback?(view?: string): React.ReactElement
  stateDidReuse?(state: S & BaseState): void
  shouldComponentCreate?(): void | boolean | Promise<void | boolean>
  componentWillCreate?(): void | Promise<void>
  stateDidChange?(data?: Data<S & BaseState & ES, AS & BaseActions & EAS>): void
  pageWillLeave?(location: ILWithBQ): void
  windowWillUnload?(location: ILWithBQ): void
  pageDidBack?(locaiton: HistoryLocation, context?: Context): void

  [propName: string]: any

  getInitialState(state: S & BaseState): any { return state }
  getFinalActions(actions: AS): any { return actions }

  constructor(location: Location, context: Context) {
    this.meta = {
      id: uid++,
      isDestroyed: false,
      hadMounted: false, // change by ControllerProxy
      unsubscribeList: []
    }
    /**
     * 将 location.key 赋值给 this.meta 并在 location 里删除
     * 避免 SSR 时，因为 initialState 里总有 locaiton.key 这个随机字符串
     * 而导致服务端的 Etag 不断变化，无法 304 。
     */
    if (location) {
      this.meta.key = location.key
      delete location.key
    }
    this.location = location
    this.context = context
    this.handlers = {}
    this.preload = {}

    this.store = createStore({} as (AS & BaseActions & EAS), {} as S & BaseState & ES)
    this.history = createHistory() as HistoryWithBFOL<BLWithBQ, ILWithBQ>
  }
  // 绑定 handler 的 this 值为 controller 实例
  combineHandlers(source: Controller<S, AS, ES, EAS>) {
    let { handlers } = this
    Object.keys(source).forEach(key => {
      let value = source[key]
      if (key.startsWith('handle') && typeof value === 'function') {
        handlers[key] = value.bind(this)
      }
    })
  }
  // 补 basename 前缀
  prependBasename(pathname: string) {
    if (_.isAbsoluteUrl(pathname)) {
      return pathname
    }
    let { basename } = this.context
    return basename + pathname
  }
  // 补 publicPath 前缀
  prependPublicPath(pathname: string) {
    if (_.isAbsoluteUrl(pathname)) {
      return pathname
    }
    let { publicPath } = this.context
    return publicPath + pathname
  }

  // 处理 url 的相对路径或 mock 地址问题
  prependRestapi(url: string) {
    let { context } = this

    /**
     * 如果已经是绝对路径
     * 在服务端直接返回 url
     * 在客户端裁剪掉 http: 使之以 // 开头
     * 让浏览器自动匹配协议，支持 Https
     */
    if (_.isAbsoluteUrl(url)) {
      if (context.isClient && url.startsWith('http:')) {
        url = url.replace('http:', '')
      }
      return url
    }

    // 对 mock 的请求进行另一种拼接，转到 node.js 服务去
    if (url.startsWith('/mock/')) {
      return this.prependBasename(url)
    }

    let restapi = this.restapi || context.restapi
    return restapi + url
  }

  /**
   * 封装重定向方法，根据 server/client 环境不同而选择不同的方式
   * isRaw 是否不拼接 Url，直接使用
   */
  redirect(redirectUrl: string, isRaw?: boolean) {
    let { history, context } = this

    if (context.isServer) {
      if (!isRaw && !_.isAbsoluteUrl(redirectUrl)) {
        // 兼容 history.push，自动补全 basename
        redirectUrl = this.prependBasename(redirectUrl)
      }
      context.res && context.res.redirect(redirectUrl)
      // 使用 throw 语句，模拟浏览器跳转时中断代码执行的效果
      // 将在外层 catch 住，并 return null 通知 create-app 无须渲染
      throw REDIRECT
    } else if (context.isClient) {
      if (isRaw || _.isAbsoluteUrl(redirectUrl)) {
        window.location.replace(redirectUrl)
      } else {
        history.replace(redirectUrl)
      }
    }
  }
  // 封装 cookie 的同构方法
  cookie(key: string, value?: string, options?: Cookie.CookieAttributes | express.CookieOptions) {
    if (!value) {
      return this.getCookie(key)
    }
    this.setCookie(key, value, options)
  }
  getCookie(key: string) {
    let { context } = this
    if (context.isServer) {
      let { req } = context
      return req && req.cookies[key]
    } else if (context.isClient) {
      return Cookie.get(key)
    }
  }
  setCookie(key: string, value: string, options?: Cookie.CookieAttributes | express.CookieOptions) {
    let { context } = this

    if (options && options.expires) {
      let isDateInstance = options.expires instanceof Date
      if (!isDateInstance) {
        throw new Error(
          `cookie 的过期时间 expires 必须为 Date 的实例，而不是 ${
          options.expires
          }`
        )
      }
    }

    if (context.isServer) {
      let { res } = context
      res && res.cookie(key, value, options as express.CookieOptions)
    } else if (context.isClient) {
      Cookie.set(key, value, options as Cookie.CookieAttributes)
    }
  }
  removeCookie(key: string, options?:  Cookie.CookieAttributes | express.CookieOptions) {
    let { context } = this

    if (context.isServer) {
      let { res } = context
      res && res.clearCookie(key, options)
    } else if (context.isClient) {
      Cookie.remove(key, options as Cookie.CookieAttributes)
    }
  }

  /**
   * 封装 fetch, https://github.github.io/fetch
   * options.json === false 不自动转换为 json
   * options.timeout:number 超时时间
   * options.timeoutErrorFormatter 超时时错误信息展示格式
   * options.raw 不补全 restfulBasename
   */
  fetch(
    url: string,
    options: RequestInit & {
      raw?: boolean
      json?: boolean
      timeout?: number
      timeoutErrorFormatter?: ((opstion: any) => string) | string
    } = {}
  ) {
    let { context, API } = this

    /**
     * API shortcut，方便 fetch(name, options) 代替 url
     */
    if (API && Object.prototype.hasOwnProperty.call(API, url)) {
      url = API[url]
    }

    // 补全 url
    if (!options.raw) {
      url = this.prependRestapi(url)
    }

    let finalOptions: RequestInit = {
      method: 'GET',
      credentials: 'include',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }
    /**
     * 浏览器端的 fetch 有 credentials: 'include'，会自动带上 cookie
     * 服务端得手动设置，可以从 context 对象里取 cookie
     */
    if (context.isServer && finalOptions.credentials === 'include') {
      // @ts-ignore
      finalOptions.headers['Cookie'] = context.req
        && context.req.headers
        && context.req.headers.cookie || ''
    }

    let fetchData: Promise<any> = fetch(url, finalOptions)

    /**
     * 拓展字段，如果手动设置 options.json 为 false
     * 不自动 JSON.parse
     */
    if (options.json !== false) {
      fetchData = fetchData.then(_.toJSON)
    }

    /**
     * 设置自动化的超时处理
     */
    if (typeof options.timeout === 'number') {
      let { timeoutErrorFormatter } = options
      let timeoutErrorMsg: string | undefined =
        typeof timeoutErrorFormatter === 'function'
          ? timeoutErrorFormatter({ url, options: finalOptions })
          : timeoutErrorFormatter
      fetchData = _.timeoutReject(fetchData, options.timeout, timeoutErrorMsg)
    }

    return fetchData
  }
  /**
   *
   * 封装 get 请求，方便使用
   */
  get(
    url: string,
    params?: Record<string, string | number | boolean>,
    options?: RequestInit & {
      raw?: boolean
      json?: boolean
      timeout?: number
      timeoutErrorFormatter?: ((opstion: any) => string) | string
    }
  ) {
    let { API } = this
    /**
     * API shortcut，方便 fetch(name, options) 代替 url
     */
    if (API && Object.prototype.hasOwnProperty.call(API, url)) {
      url = API[url]
    }
    if (params) {
      let prefix = url.includes('?') ? '&' : '?'
      url += prefix + querystring.stringify(params)
    }
    options = {
      ...options,
      method: 'GET'
    }
    return this.fetch(url, options)
  }
  /**
   *
   * 封装 post 请求，方便使用
   */
  post(
    url: string,
    data?: any,
    options?: RequestInit & {
      raw?: boolean
      json?: boolean
      timeout?: number
      timeoutErrorFormatter?: ((opstion: any) => string) | string
    }
  ) {
    options = {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    }
    return this.fetch(url, options)
  }
  /**
   * 预加载 css 样式等资源
   */
  fetchPreload(preload?: Preload) {
    preload = preload || this.preload || {}
    let keys = Object.keys(preload)

    if (keys.length === 0) {
      return
    }

    let { context } = this
    let list = keys.map(name => {
      if ((context.preload as Preload)[name]) {
        return
      }
      let url = (preload as Preload)[name]

      if (!_.isAbsoluteUrl(url)) {
        if (context.isServer) {
          // 在服务端应请求本地的资源
          url = context.serverPublicPath + url
        } else if (context.isClient) {
          url = context.publicPath + url
        }
      }

      return fetch(url)
        .then(_.toText)
        .then(content => {
          if (url.split('?')[0].indexOf('.css') !== -1) {
            /**
             * 如果是 CSS ，清空回车符
             * 否则同构渲染时 react 计算 checksum 值会不一致
             */
            content = content.replace(/\r+/g, '')
          }
          (context.preload as Preload)[name] = content
        })
    })
    return Promise.all(list)
  }

  /**
   * 预加载页面的 js bundle
   */
  prefetch(url: string) {
    if (!url || typeof url !== 'string') return null
    let matches = this.matcher(url)
    if (!matches) return null
    return this.loader(matches.controller)
  }

  async init() {
    if (this.errorDidCatch || this.getComponentFallback) {
      let self = this
      let isAttach = false
      let attach = () => {
        if (isAttach) return
        isAttach = true
        React.createElement = (type: any, ...args: any[]) => {
          if (typeof type === 'function') {
            if (!type.isErrorBoundary) {
              type = createErrorBoundary(type)
            }
          }
          return createElement(type, ...args)
        }
        // @ts-ignore
        React.originalCreateElement = createElement
      }
      let detach = () => {
        isAttach = false
        React.createElement = createElement
      }
      let map = new Map()
      let createErrorBoundary = (InputComponent: React.ComponentType & { ignoreErrors: boolean }) => {
        if (!InputComponent) return InputComponent

        if (InputComponent.ignoreErrors) return InputComponent

        if (map.has(InputComponent)) {
          return map.get(InputComponent)
        }

        const displayName = InputComponent.name || InputComponent.displayName

        interface ErrorBoundaryProps {
          forwardedRef?: any
        }
        class ErrorBoundary extends React.Component<ErrorBoundaryProps> {
          static displayName = `ErrorBoundary(${displayName})`
          static isErrorBoundary = true

          state: Partial<BaseState> = {
            hasError: false
          }

          static getDerivedStateFromError() {
            return { hasError: true }
          }

          componentDidCatch(error: Error) {
            if (typeof self.errorDidCatch === 'function') {
              self.errorDidCatch(error, 'view')
            }
          }
          render() {
            if (self.state.hasError) {
              if (self.getComponentFallback) {
                let result = self.getComponentFallback(displayName as string, InputComponent)
                if (result !== undefined) return result
              }
              return null
            }
            let { forwardedRef, ...rest } = this.props
            return createElement(InputComponent, { ...rest, ref: forwardedRef })
          }
        }

        let Forwarder: React.ForwardRefExoticComponent<{}> & { isErrorBoundary?: boolean } = React.forwardRef((props, ref) => {
          return createElement(ErrorBoundary, { ...props, forwardedRef: ref })
        })

        Forwarder.isErrorBoundary = true
        map.set(InputComponent, Forwarder)

        return Forwarder
      }

      this.proxyHandler = { attach, detach }
    }
    try {
      return await this.initialize()
    } catch (error) {
      if (error === REDIRECT) return null
      if (this.errorDidCatch) this.errorDidCatch(error, 'controller')
      if (this.getViewFallback) {
        return this.getViewFallback() || <EmptyView />
      }
      throw error
    }
  }

  destroy() {
    let { meta } = this

    if (this.proxyHandler) {
      this.proxyHandler.detach()
      this.proxyHandler = undefined
    }

    if (meta.unsubscribeList.length > 0) {
      meta.unsubscribeList.forEach((unsubscribe: () => {}) => unsubscribe())
      meta.unsubscribeList.length = 0
    }
    meta.isDestroyed = true
  }

  async initialize() {
    /**
     * 关闭 SSR 后，不执行 componentWillCreate 和 shouldComponentCreate，直接返回 Loading 界面
     * SSR 如果是个方法，则执行并等待它完成
     */
    let SSR = this.SSR
    if (this.context.isServer) {
      if (typeof this.SSR === 'function') {
        SSR = await this.SSR(this.location, this.context)
      }
      if (SSR === false) {
        let View: BaseViewFC | BaseViewClass = this.Loading || EmptyView
        return <View />
      }
    }

    // 在 init 方法里 bind this，这样 fetch 可以支持继承
    // 如果用 fetch = (url, option = {}) => {} 的写法，它不是原型方法，无法继承
    this.fetch = this.fetch.bind(this)
    this.prefetch = this.prefetch.bind(this)

    let actions: AS = this.actions
    let initialState: S = this.initialState

    // 如果 Model 存在，且 initialState 和 actions 不存在，从 Model 里解构出来
    if (this.Model && this.initialState === undefined && this.actions === undefined) {
      initialState = this.initialState = this.Model.initialState
      actions = this.actions = this.Model
    }

    let globalInitialState: BaseState | undefined

    // 服务端把 initialState 吐在 html 里的全局变量 __INITIAL_STATE__ 里
    if (typeof __INITIAL_STATE__ !== 'undefined') {
      globalInitialState = __INITIAL_STATE__
      __INITIAL_STATE__ = undefined
    }

    if (typeof initialState === 'object') {
      // 保护性复制初始化状态，避免运行中修改引用导致其他实例初始化数据不对
      initialState = JSON.parse(JSON.stringify(initialState))
    }

    let baseState: BaseState = {
      location: this.location,
      basename: this.context.basename || '',
      publicPath: this.context.publicPath || '',
      restapi: this.context.restapi || ''
    }

    /**
     * 动态获取初始化的 initialState
     */
    let finalInitialState: S & BaseState & ES = this.getInitialState({
      ...initialState,
      ...(globalInitialState || {}),
      ...baseState
    })

    /**
     * 复用了 server side 的 state 数据之后执行
     */
    if (globalInitialState && this.stateDidReuse) {
      this.stateDidReuse(finalInitialState)
    }

    /**
     * 动态获取最终的 actions
     */
    let finalActions: AS & BaseActions & EAS = this.getFinalActions({ ...shareActions, ...actions })
    
    /**
     * 创建 store
     */
    this.store = createStore(finalActions, finalInitialState)
    attachDevToolsIfPossible(this.store)

    // proxy store.actions for handling error
    // if (this.errorDidCatch) {
    //   let keys = getKeys(this.store.actions)
    //   let actions: Currings<S & State & StateFromAS<AS & typeof shareActions>, AS & typeof shareActions> = keys.reduce((obj, key) => {
    //     let action = this.store.actions[key]
    //     let newAction: typeof action = payload => {
    //       try {
    //         return action(payload)
    //       } catch (error) {
    //         this.errorDidCatch(error, 'model')
    //         throw error
    //       }
    //     }
    //     obj[key] = newAction
    //     return obj
    //   }, {} as Currings<S & State & StateFromAS<AS & typeof shareActions>, AS & typeof shareActions>)

    //   this.store.actions = actions
    // }

    /**
     * 将 handle 开头的方法，合并到 this.handlers 中
     */
    this.combineHandlers(this)

    /**
     * 如果存在 globalInitialState
     * 说明服务端渲染了 html 和 intitialState
     * component 已经创建
     * 不需要再调用 shouldComponentCreate 和 componentWillCreate
     */
    if (globalInitialState) {
      this.bindStoreWithView()

      // 如果 preload 未收集到或者加载成功，重新加载一次
      let preloadedKeys: string[] = Object.keys(this.context.preload || {})
      let isPreload: boolean = Object.keys(this.preload || {}).every(key =>
        preloadedKeys.includes(key)
      )

      if (!isPreload) await this.fetchPreload()
      return this.render()
    }

    let promiseList: (Promise<any> | void)[] = []

    /**
     * 如果 shouldComponentCreate 返回 false，不创建和渲染 React Component
     * 可以在 shouldComponentCreate 里重定向到别的 Url
     */
    if (this.shouldComponentCreate) {
      let shouldCreate = await this.shouldComponentCreate()
      if (shouldCreate === false) {
        return null
      }
    }

    // 在 React Component 创建前调用，可以发 ajax 请求获取数据
    if (this.componentWillCreate) {
      promiseList.push(this.componentWillCreate())
    }

    /**
     * 获取预加载的资源
     */
    if (this.preload) {
      promiseList.push(this.fetchPreload())
    }



    if (promiseList.length) {
      await Promise.all(promiseList)
    }



    this.bindStoreWithView()
    return this.render()
  }
  bindStoreWithView() {
    let { context, store, history, meta } = this

    // bind store with view in client
    if (!context.isClient || meta.isDestroyed) {
      return
    }

    if (store) {
      let unsubscribe = store.subscribe((data) => {
        this.refreshView()
        if (this.stateDidChange) {
          this.stateDidChange(data)
        }
      })
      meta.unsubscribeList.push(unsubscribe)
    }

    // 判断是否缓存
    {
      let unlisten = history.listenBefore((location) => {
        if (!this.KeepAliveOnPush) return
        if (location.action === HistoryActions.PUSH) {
          this.saveToCache()
        } else {
          this.removeFromCache()
        }
      })
      meta.unsubscribeList.push(unlisten)
    }

    // 监听路由跳转
    if (this.pageWillLeave) {
      let unlisten = history.listenBefore(
        this.pageWillLeave.bind(this)
      )
      meta.unsubscribeList.push(unlisten)
    }

    // 监听浏览器窗口关闭
    if (this.windowWillUnload) {
      let unlisten = history.listenBeforeUnload(
        this.windowWillUnload.bind(this)
      )
      meta.unsubscribeList.push(unlisten)
    }
  }

  restore(location: Location, context?: Context): React.ReactElement {
    let { meta, store } = this
    let { __PAGE_DID_BACK__ } = store.actions

    if (this.proxyHandler) {
      // detach first, and re-attach
      this.proxyHandler.detach()
      this.proxyHandler.attach()
    }

    meta.isDestroyed = false
    if (__PAGE_DID_BACK__) {
      __PAGE_DID_BACK__(location)
    }

    if (this.pageDidBack) {
      this.pageDidBack(location, context)
    }

    this.bindStoreWithView()
    return this.render()
  }
  reload() {
    // if not remove controller cache, it will not reload correctly, it will restore instead of reload
    this.removeFromCache()
    this.history.replace(this.location.raw)
  }

  renderView(View = this.View) {
    if (this.context.isServer) return
    // if (View && !View.viewId) {
    //   View.viewId = Date.now()
    // }
    let ctrl: Controller<S, AS, ES, EAS> = Object.create(this)
    ctrl.View = View
    ctrl.componentDidFirstMount = null
    ctrl.componentDidMount = null
    ctrl.componentWillUnmount = null
    ctrl.meta = {
      ...this.meta,
      // id: View.viewId
      id: Date.now()
    }
    if (this.proxyHandler) {
      this.proxyHandler.attach()
    }
    this.refreshView(<ViewManager controller={ctrl} />)
  }

  render(): React.ReactElement {
    if (this.proxyHandler) this.proxyHandler.attach()
    return <ViewManager controller={this} />
  }
}
