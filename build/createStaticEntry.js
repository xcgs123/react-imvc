import React from 'react'
import ReactDOMServer from 'react-dom/server'
import path from 'path'
import {
  readAssets
} from '../page/createPageRouter'

let getModule = module => module.default || module

export default function createStaticEntry(config) {
  let layoutPath = getLayout(config)
  let Layout = getModule(require(layoutPath))
  let props = getProps(config)
  let vdom = React.createElement(Layout, props)
  let html = ReactDOMServer.renderToStaticMarkup(vdom)
  return html
}

function getLayout(config) {
  return config.layout ? path.join(config.root, config.routes, config.layout) : path.join(__dirname, '../page/view')
}

function getProps(config) {
  let assetsPath = path.join(config.root, config.publish, config.static, config.assetsPath)
  let assets = require(assetsPath)
  let basename = ''
  let publicPath = '.'
  let context = {
    basename,
    publicPath,
    restapi: config.restapi,
    ...config.context,
    preload: {},
  }

  let appSettings = {
    type: 'createHashHistory',
    context,
  }

  return {
    basename,
    publicPath,
    assets,
    appSettings,
  }
}