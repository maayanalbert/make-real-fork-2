'use client'

import dynamic from 'next/dynamic'
import 'tldraw/tldraw.css'
import { PreviewShapeUtil } from './PreviewShape/PreviewShape'
import { FocusPreviewProvider } from './PreviewShape/FocusPreviewContext'
import { ProjectSettingsModal } from './components/ProjectSettingsModal'
import { useEffect, useState } from 'react'
import { createShapeId, TLShapeId, Editor, useEditor } from 'tldraw'
import { ProjectSettingsProvider, useProjectSettings } from './lib/ProjectSettingsContext'
import { storeFirstFrameId } from './lib/ProjectSettingsContext'

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
	const { directoryHandle, gitRepo, switchBranch } = useProjectSettings()

	useEffect(() => {
		if (!editor || !directoryHandle) return

		// Wait for the editor to be ready
		setTimeout(async () => {
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
						screenshot: '',
					},
				})

				// Store the first frame's ID in the database
				try {
					await storeFirstFrameId(newShapeId)
				} catch (error) {
					console.error('Failed to store first frame ID:', error)
				}

				// Switch to the new shape's branch if Git is initialized
				if (gitRepo?.isInitialized) {
					try {
						await switchBranch(newShapeId)
					} catch (error) {
						console.error('Failed to switch to new branch:', error)
					}
				}
			}
		}, 1000)
	}, [editor, directoryHandle, gitRepo, switchBranch])

	return null
}

export default function App() {
	const [isModalOpen, setIsModalOpen] = useState(false)

	return (
		<ProjectSettingsProvider>
			<div className="editor">
				<FocusPreviewProvider>
					<Tldraw persistenceKey="moab" shapeUtils={shapeUtils} components={components}>
						{!isModalOpen && <InitialPreviewShape />}
						<ProjectSettingsModal isOpen={isModalOpen} setIsOpen={setIsModalOpen} />
					</Tldraw>
				</FocusPreviewProvider>
			</div>
		</ProjectSettingsProvider>
	)
}
