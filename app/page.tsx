'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
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

const components = {
	Minimap: null,
	StylePanel: null,
	PageMenu: null,
	MainMenu: null,
	ContextMenu: null,
	ActionsMenu: null,
	HelpMenu: null,
	ZoomMenu: null,
	NavigationPanel: null,
	Toolbar: null,
	StatusBar: null,
	RichTextToolbar: null,
	KeyboardShortcutsDialog: null,
	QuickActions: null,
	HelperButtons: null,
	DebugPanel: null,
	DebugMenu: null,
	MenuPanel: null,
	TopPanel: null,
	SharePanel: null,
	CursorChatBubble: null,
	Dialogs: null,
	Toasts: null,
	A11y: null,
}

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
						screenshot: '',
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
		<div className="editor">
			<FocusPreviewProvider>
				<Tldraw shapeUtils={shapeUtils} components={components}>
					<InitialPreviewShape />
					<ProjectSettingsModal isOpen={isModalOpen} setIsOpen={setIsModalOpen} />
				</Tldraw>
			</FocusPreviewProvider>

			{/* Git Mirror Link */}
			<Link href="/git-mirror">
				<div className="fixed z-50 bottom-5 right-5 bg-indigo-600 text-white px-4 py-2 rounded-md shadow-lg hover:bg-indigo-700 transition-colors">
					Git Mirror DB
				</div>
			</Link>
		</div>
	)
}
