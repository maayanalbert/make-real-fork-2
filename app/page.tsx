'use client'

import dynamic from 'next/dynamic'
import 'tldraw/tldraw.css'
import { PreviewShapeUtil } from './PreviewShape/PreviewShape'
import { FocusPreviewProvider } from './PreviewShape/FocusPreviewContext'
import { ProjectSettingsModal } from './components/ProjectSettingsModal'
import { useEffect, useState } from 'react'
import { createShapeId, TLShapeId, Editor, useEditor } from 'tldraw'
import { ProjectSettingsProvider, useProjectSettings } from './lib/ProjectSettingsContext'

const Tldraw = dynamic(async () => (await import('tldraw')).Tldraw, {
	ssr: false,
})

const shapeUtils = [PreviewShapeUtil]

// Component to add initial preview shape
function InitialPreviewShape() {
	const editor = useEditor()
	const { directoryHandle } = useProjectSettings()

	useEffect(() => {
		if (!editor || !directoryHandle) return

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
						w: (960 * 2) / 3,
						h: (540 * 2) / 3,
						branch: 'main',
					},
				})
			}
		}, 1000)
	}, [editor, directoryHandle])

	return null
}

export default function App() {
	const [isModalOpen, setIsModalOpen] = useState(false)

	return (
		<ProjectSettingsProvider>
			<div className="editor">
				<FocusPreviewProvider>
					<Tldraw shapeUtils={shapeUtils} hideUi>
						{/* <InitialPreviewShape /> */}

						<ProjectSettingsModal isOpen={isModalOpen} setIsOpen={setIsModalOpen} />
					</Tldraw>
				</FocusPreviewProvider>
			</div>
		</ProjectSettingsProvider>
	)
}
