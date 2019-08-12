import React from 'react'
import GlobalContext from '../context'
import { Preload } from '../controller/types'

export default function Style({ name }: { name: string }) {
	return (
		<GlobalContext.Consumer>
			{({ preload }: { preload?: Preload }) => {
				return (
					<style
						type="text/css"
						data-preload={name}
						dangerouslySetInnerHTML={{ __html: (preload as Preload)[name] }}
					/>
				)
			}}
		</GlobalContext.Consumer>
	)
}