'use client'

import dynamic from 'next/dynamic'
import 'tldraw/tldraw.css'
import { PreviewShapeUtil } from './PreviewShape/PreviewShape'
import { FocusPreviewProvider } from './PreviewShape/FocusPreviewContext'
import { WorkingDirectoryProvider } from './lib/WorkingDirectoryContext'
import { FileSelectionModal } from './components/FileSelectionModal'
import { useEffect, useState } from 'react'
import { createShapeId, TLShapeId, Editor, useEditor } from 'tldraw'

const Tldraw = dynamic(async () => (await import('tldraw')).Tldraw, {
	ssr: false,
})

const shapeUtils = [PreviewShapeUtil]

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
	const [isModalOpen, setIsModalOpen] = useState(false)

	return (
		<WorkingDirectoryProvider>
			<div className="editor">
				<FocusPreviewProvider>
					<Tldraw persistenceKey="make-real" hideUi shapeUtils={shapeUtils}>
						<InitialPreviewShape />
					</Tldraw>
					<button className="file-selector-btn" onClick={() => setIsModalOpen(true)}>
						Select Directory
					</button>
					<FileSelectionModal isOpen={isModalOpen} setIsOpen={setIsModalOpen} />
				</FocusPreviewProvider>
			</div>
			<style jsx>{`
				.file-selector-btn {
					position: fixed;
					top: 16px;
					left: 16px;
					background-color: white;
					border: 1px solid #d1d5db;
					padding: 8px 16px;
					border-radius: 6px;
					cursor: pointer;
					z-index: 100;
					font-size: 14px;
					box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
					transition: box-shadow 0.2s;
				}

				.file-selector-btn:hover {
					box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
				}
			`}</style>
		</WorkingDirectoryProvider>
	)
}
