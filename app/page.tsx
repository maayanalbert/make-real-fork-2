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
	// Toolbar: null,
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

// Component to handle dark mode shape visibility
function DarkModeShapeManager() {
	const editor = useEditor()

	useEffect(() => {
		if (!editor) return

		const unsubscribe = editor.store.listen(() => {
			const isDarkMode = editor.user.getUserPreferences().isDarkMode
			const shapes = editor.getCurrentPageShapes()

			shapes.forEach((shape) => {
				if (shape.type !== 'response') {
					editor.updateShape({
						id: shape.id,
						type: shape.type,
						opacity: isDarkMode ? 0 : 1,
						isLocked: isDarkMode,
					})
				}
			})
		})

		return () => {
			unsubscribe()
		}
	}, [editor])

	return null
}

// Component to show ProjectSettingsModal only in dark mode
function DarkModeProjectSettingsModal() {
	const editor = useEditor()
	const [isModalOpen, setIsModalOpen] = useState(false)
	const [isDarkMode, setIsDarkMode] = useState(false)

	useEffect(() => {
		if (!editor) return

		const unsubscribe = editor.store.listen(() => {
			const isDarkMode = editor.user.getUserPreferences().isDarkMode
			setIsDarkMode(isDarkMode)
		})

		return () => {
			unsubscribe()
		}
	}, [editor])

	return isDarkMode ? undefined : (
		<ProjectSettingsModal isOpen={isModalOpen} setIsOpen={setIsModalOpen} />
	)
}

export default function App() {
	return (
		<div className="editor">
			<FocusPreviewProvider>
				<Tldraw shapeUtils={shapeUtils} persistenceKey="hi" components={components}>
					<InitialPreviewShape />
					<DarkModeShapeManager />
					<DarkModeProjectSettingsModal />
				</Tldraw>
			</FocusPreviewProvider>
		</div>
	)
}
