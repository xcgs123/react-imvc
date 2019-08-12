import Controller from './index'

export interface State {
    [propName:string]: any
}

export interface Actions {
    [propName:string]: { (...args:any):State } | State
}

export interface Model {
    initialState?: State
    [propName:string]: any
}

export interface Preload  {
    [propName:string]: string
}

export type API = Record<string, string>

export interface Payload {
    [propName:string]: any 
}

export interface Location {
    // path?: any
    key?: string
    action: string
    basename: string
    hash: string
    params: object
    pathname: string
    pattern: string
    query: object
    raw: string
    search: string
    state: any
    [propName: string]: any
}

export interface Context {
    basename: string
    env: string
    isClient: boolean
    isServer: boolean
    preload: Record<string, string>
    prevLocation: object | null
    publicPath: string
    restapi: string
    userInfo: object
    [propName: string]: any
}

export interface Handlers {
    [handleName: string]: Handler
}

interface Handler {
    (...args:any):any
}

export interface Meta {
    key?: string | null
    hadMounted: boolean
    id: number
    isDestroyed: boolean
    unsubscribeList: any
}

export interface Loader {
    (...args:any):any
}

export interface Routes {
    [index: number]: Route
}

interface Route {
    path: string,
    controller: Controller
}

export interface Store {
    actions: Record<string, any>
    dispatch(...args:any): void
    getState(): State
    publish(...args:any): void
    replaceState(...args:any): void
    subscribe(callback:(...args: any)=>any): object
}