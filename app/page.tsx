'use client'

import dynamic from 'next/dynamic'
import 'tldraw/tldraw.css'
import { MakeRealButton } from './components/MakeRealButton'
import { RiskyButCoolAPIKeyInput } from './components/RiskyButCoolAPIKeyInput'
import { PreviewShapeUtil } from './PreviewShape/PreviewShape'
import { FocusPreviewProvider } from './PreviewShape/FocusPreviewContext'
import { useEffect } from 'react'
import { createShapeId, TLShapeId, Editor, useEditor } from 'tldraw'

const Tldraw = dynamic(async () => (await import('tldraw')).Tldraw, {
	ssr: false,
})

const shapeUtils = [PreviewShapeUtil]
const components = {
	SharePanel: () => <MakeRealButton />,
}

// Component to add initial preview shape
function InitialPreviewShape() {
	const editor = useEditor()

	useEffect(() => {
		if (!editor) return

		// Wait for the editor to be ready
		setTimeout(() => {
			// Check if a response shape already exists
			const existingResponseShapes = editor
				.getCurrentPageShapes()
				.filter((shape) => shape.type === 'response')
			if (existingResponseShapes.length === 0) {
				const newShapeId = createShapeId()
				editor.createShape({
					id: newShapeId,
					type: 'response',
					x: 200,
					y: 200,
					props: {
						html: '',
						w: (960 * 2) / 3,
						h: (540 * 2) / 3,
					},
				})
			}
		}, 1000)
	}, [editor])

	return null
}

export default function App() {
	return (
		<div className="editor">
			<FocusPreviewProvider>
				<Tldraw persistenceKey="make-real" components={components} shapeUtils={shapeUtils}>
					<RiskyButCoolAPIKeyInput />
					<InitialPreviewShape />
				</Tldraw>
			</FocusPreviewProvider>
		</div>
	)
}
