import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react'
import { TLShapeId } from 'tldraw'
import { useProjectSettings } from '../lib/ProjectSettingsContext'
import { useEditor } from 'tldraw'

type FocusChangeContextType = {
	lastFocusedId: TLShapeId | null
}

const FocusChangeContext = createContext<FocusChangeContextType | undefined>(undefined)

export function FocusChangeProvider({ children }: { children: ReactNode }) {
	const [lastFocusedId, setLastFocusedId] = useState<TLShapeId | null>(null)
	const { directoryHandle, gitRepo, commitLocalDirectory, switchBranch } = useProjectSettings()
	const editor = useEditor()

	// Internal function to handle focus changes
	const handleFocusChange = useCallback(
		async (shapeId: TLShapeId, isSelected: boolean) => {
			// Don't do anything if we don't have Git set up or directory handle
			if (!gitRepo?.isInitialized || !directoryHandle) return

			// If we're focusing this shape
			if (isSelected) {
				console.log(
					`[PreviewShape] Shape ${shapeId} focused, current branch: ${gitRepo.currentBranch}`
				)
				// If we have a last focused shape that's different, commit its changes first
				if (lastFocusedId && lastFocusedId !== shapeId) {
					try {
						// Find the previous shape by ID
						let previousShape: any | undefined

						try {
							previousShape = editor.getCurrentPageShapes().find((s) => s.id === lastFocusedId)
						} catch (error) {
							console.error('[PreviewShape] Error finding previous shape:', error)
						}

						if (previousShape) {
							console.log(`[PreviewShape] Committing changes from previous shape ${lastFocusedId}`)
							// Commit changes of the previous shape to its branch
							await commitLocalDirectory(`Update from shape ${lastFocusedId}`)
						}

						// Switch to this shape's branch
						console.log(`[PreviewShape] Switching to branch for shape ${shapeId}`)
						await switchBranch(shapeId)
					} catch (error) {
						console.error('[PreviewShape] Error during branch operations:', error)
					}
				} else if (!lastFocusedId) {
					// First focus of any shape, just switch to its branch
					try {
						console.log(`[PreviewShape] First focus, switching to branch for shape ${shapeId}`)
						await switchBranch(shapeId)
					} catch (error) {
						console.error('[PreviewShape] Error switching to initial branch:', error)
					}
				}

				// Update the last focused ID
				setLastFocusedId(shapeId)
			}
		},
		[gitRepo, directoryHandle, editor, commitLocalDirectory, switchBranch, lastFocusedId]
	)

	// Listen for selection changes in the editor
	useEffect(() => {
		const handleSelectionChange = () => {
			const selectedIds = editor.getSelectedShapeIds()
			if (selectedIds.length === 1) {
				const selectedId = selectedIds[0]
				handleFocusChange(selectedId, true)
			}
		}

		editor.on('change', handleSelectionChange)
		return () => {
			editor.off('change', handleSelectionChange)
		}
	}, [editor, handleFocusChange])

	return (
		<FocusChangeContext.Provider value={{ lastFocusedId }}>{children}</FocusChangeContext.Provider>
	)
}

export function useFocusChange() {
	const context = useContext(FocusChangeContext)
	if (context === undefined) {
		throw new Error('useFocusChange must be used within a FocusChangeProvider')
	}
	return context
}
