import IMVC from '../../../../index'
import React from 'react'

export default class extends IMVC.Controller {
    View = View;
    constructor(location: IMVC.Location, context: IMVC.Context) {
        super(location, context)
        if (context.isClient) {
            (window as IMVC.WindowNative).controller = this
        } else if (context.isServer) {
            (global as IMVC.Global).controller = this
        }
    }
}


function View({ state }: IMVC.ViewProps) {
    return <pre id="basic_state">{JSON.stringify(state, null, 2)}</pre>
}