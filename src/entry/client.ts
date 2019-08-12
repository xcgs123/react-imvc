import 'core-js/stable'
import 'regenerator-runtime/runtime'
import '../polyfill'
import 'whatwg-fetch'
import ReactDOM from 'react-dom'
// @ts-ignore
import CA from 'create-app'
import util from '../util'
// @ts-ignore
import $routes from '@routes'
import { Global, WindowNative as Window, NativeModule } from '../types'
import Controller from '../controller'
import { Preload } from '../controller/types'
import { AppSettingContext, AppSettingLoader, AppSettingController, AppSettings, Render } from '../config'

(global as Global).__webpack_public_path__ = (window as Window).__PUBLIC_PATH__ + '/'
const __APP_SETTINGS__: AppSettings = (window as Window).__APP_SETTINGS__ || {}

const getModule = (module: any) => module.default || module

const webpackLoader: CA.Loader = (loadModule, location, context) => {
  return loadModule(location, context).then(getModule)
}

let shouldHydrate = !!(window as Window).__INITIAL_STATE__

const render: CA.ViewEngineRender = (view, container, controller) => {
  try {
    if (shouldHydrate) {
      shouldHydrate = false
      ReactDOM.hydrate(view, container)
    } else {
      ReactDOM.render(view, container)
    }
  } catch (error) {
    if (!controller) throw error

    if (controller.errorDidCatch) {
      controller.errorDidCatch(error, 'view')
    }

    if (controller.getViewFallback) {
      render(controller.getViewFallback(), container)
    } else {
      throw error
    }
  }
}
const viewEngine = { render }

const routes = util.getFlatList(
  Array.isArray($routes) ? $routes : Object.values($routes)
)

const appSettings: AppSettings = {
  hashType: 'hashbang',
  container: '#root',
  ...__APP_SETTINGS__,
  context: {
    preload: {},
    ...__APP_SETTINGS__.context,
    isClient: true,
    isServer: false
  },
  loader: webpackLoader,
  routes,
  viewEngine
}

/**
 * 动态收集服务端预加载的内容
 */
const preload: Preload = {}
Array.from(document.querySelectorAll('[data-preload]')).forEach(elem => {
  let name = elem.getAttribute('data-preload')
  let content = elem.textContent || elem.innerHTML
  if (name) {
    preload[name] = content
  }
});
if(typeof appSettings.context !== 'undefined')
  appSettings.context.preload = preload

const app = CA.client(appSettings)

app.start()

// 热更新
if (typeof module !== 'undefined' && (module as NativeModule).hot) {
  if ((module as NativeModule).hot) {
    let hot = (module as NativeModule).hot
    if (hot && hot.accept) {
      hot.accept()
    }
  }
}