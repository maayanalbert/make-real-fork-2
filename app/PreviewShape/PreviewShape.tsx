/* eslint-disable react-hooks/rules-of-hooks */
import { ReactElement, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
	TLBaseShape,
	BaseBoxShapeUtil,
	useIsEditing,
	useToasts,
	useValue,
	HTMLContainer,
	toDomPrecision,
	stopEventPropagation,
	SvgExportContext,
	Vec,
	TldrawUiIcon,
	useEditor,
	DefaultSpinner,
} from 'tldraw'
import { useFocusPreview } from './FocusPreviewContext'
import { useProjectSettings } from '../lib/ProjectSettingsContext'

export type PreviewShape = TLBaseShape<
	'response',
	{
		w: number
		h: number
		screenshot: string
	}
>

export class PreviewShapeUtil extends BaseBoxShapeUtil<PreviewShape> {
	static override type = 'response' as const

	getDefaultProps(): PreviewShape['props'] {
		return {
			w: (960 * 2) / 3,
			h: 540,
			screenshot: '',
		}
	}

	override canEdit = () => true
	override isAspectRatioLocked = () => false
	override canResize = () => true
	override canBind = () => false

	override component(shape: PreviewShape) {
		const isEditing = useIsEditing(shape.id)
		const toast = useToasts()
		const editor = useEditor()
		const { focusedPreviewId, setFocusedPreviewId } = useFocusPreview()
		const { directoryHandle, port, gitRepo, commitLocalDirectory, switchBranch } =
			useProjectSettings()
		const iframeRef = useRef<HTMLIFrameElement>(null)
		const [fileContent, setFileContent] = useState<string | null>(null)
		const [isIframeLoading, setIsIframeLoading] = useState(true)
		const [lastFocusedId, setLastFocusedId] = useState<string | null>(null)

		// Check if this preview is focused
		const isFocused = focusedPreviewId === shape.id

		// Track if the shape is selected
		const isSelected = useValue(
			'selection',
			() => {
				const selectedIds = editor.getSelectedShapeIds()
				return selectedIds.includes(shape.id)
			},
			[editor, shape.id]
		)

		// Handle branch switching when focus changes
		useEffect(() => {
			const handleFocusChange = async () => {
				// Don't do anything if we don't have Git set up or directory handle
				if (!gitRepo?.isInitialized || !directoryHandle) return

				// If we're focusing this shape and it has a branch
				if (isSelected && shape.type === 'response') {
					console.log(
						`[PreviewShape] Shape ${shape.id} focused, current branch: ${gitRepo.currentBranch}`
					)
					// If we have a last focused shape that's different, commit its changes first
					if (lastFocusedId && lastFocusedId !== shape.id) {
						try {
							// Find the previous shape by ID
							let previousShape: PreviewShape | undefined

							try {
								previousShape = editor
									.getCurrentPageShapes()
									.find((s) => s.id === lastFocusedId) as PreviewShape | undefined
							} catch (error) {
								console.error('[PreviewShape] Error finding previous shape:', error)
							}

							if (previousShape) {
								console.log(
									`[PreviewShape] Committing changes from previous shape ${lastFocusedId}`
								)
								// Commit changes of the previous shape to its branch
								await commitLocalDirectory(`Update from shape ${lastFocusedId}`)

								toast.addToast({
									icon: 'check',
									title: `Saved to branch ${previousShape.id}`,
								})
							}

							// Switch to this shape's branch
							console.log(`[PreviewShape] Switching to branch for shape ${shape.id}`)
							await switchBranch(shape.id)

							toast.addToast({
								icon: 'check',
								title: `Switched to branch ${shape.id.split(':')[1]}`,
							})
						} catch (error) {
							console.error('[PreviewShape] Error during branch operations:', error)
							toast.addToast({
								icon: 'cross-2',
								title: 'Failed to switch branches',
							})
						}
					} else if (!lastFocusedId) {
						// First focus of any shape, just switch to its branch
						try {
							console.log(`[PreviewShape] First focus, switching to branch for shape ${shape.id}`)
							await switchBranch(shape.id)
							toast.addToast({
								icon: 'check',
								title: `Switched to branch ${shape.id.split(':')[1]}`,
							})
						} catch (error) {
							console.error('[PreviewShape] Error switching to initial branch:', error)
							toast.addToast({
								icon: 'cross-2',
								title: 'Failed to switch to initial branch',
							})
						}
					}

					// Update the last focused ID
					setLastFocusedId(shape.id)
					setFocusedPreviewId(shape.id)
				}
			}

			handleFocusChange()
		}, [
			isSelected,
			shape.id,
			shape.type,
			focusedPreviewId,
			lastFocusedId,
			setFocusedPreviewId,
			editor,
			gitRepo,
			directoryHandle,
			commitLocalDirectory,
			switchBranch,
			toast,
		])

		// Take screenshot and save branch when losing focus
		useEffect(() => {
			if (focusedPreviewId === shape.id && !isSelected && lastFocusedId === shape.id) {
				// Only take screenshot and save when this shape was previously focused but now isn't
				console.log('[PreviewShape] Taking screenshot and saving branch state')
				takeScreenshot()

				// Save changes to this shape's branch if we have one
				if (gitRepo?.isInitialized && directoryHandle) {
					commitLocalDirectory(`Update from shape ${shape.id}`).catch((error) => {
						console.error('[PreviewShape] Error saving to branch:', error)
						toast.addToast({
							icon: 'cross-2',
							title: 'Failed to save to branch',
						})
					})
				}
			}
		}, [isSelected, shape.id, focusedPreviewId, lastFocusedId, gitRepo, directoryHandle])

		// Function to take a screenshot of the iframe
		const takeScreenshot = async () => {
			if (!iframeRef.current) return

			try {
				// Request screenshot from iframe using the shape ID
				iframeRef.current.contentWindow?.postMessage(
					{
						type: 'TAKE_SCREENSHOT',
						shapeId: shape.id,
					},
					'*'
				)

				// Listen for the screenshot response
				const handleScreenshot = (event: MessageEvent) => {
					if (event.data.type === 'SCREENSHOT_RESULT' && event.data.shapeId === shape.id) {
						// Update shape with screenshot
						editor.updateShape({
							id: shape.id,
							type: 'response',
							props: {
								...shape.props,
								screenshot: event.data.screenshot,
							},
						})
						// Remove the event listener
						window.removeEventListener('message', handleScreenshot)
					}
				}

				window.addEventListener('message', handleScreenshot)
			} catch (error) {
				console.error('Error taking screenshot:', error)
				toast.addToast({
					icon: 'cross-2',
					title: 'Failed to take screenshot',
				})
			}
		}

		return (
			<HTMLContainer className="tl-embed-container" id={shape.id}>
				{isIframeLoading && (
					<div
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							width: '100%',
							height: '100%',
							background: 'rgba(255,255,255,0.7)',
							zIndex: 10,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						<DefaultSpinner />
					</div>
				)}
				<div className="shadow-2xl">
					{/* Branch name display */}
					<div
						style={{
							position: 'absolute',
							top: -30,
							left: 10,
							zIndex: 3,
							background: 'rgba(255, 255, 255, 0.9)',
							padding: '4px 8px',
							borderRadius: '4px',
							fontSize: '12px',
							fontWeight: 500,
							boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
							pointerEvents: 'none',
						}}
					>
						{shape.id.split(':')[1]}
					</div>
					<iframe
						ref={iframeRef}
						id={`iframe-${shape.id}`}
						src={`http://localhost:${port || '3001'}?shapeId=${shape.id}`}
						width={toDomPrecision(shape.props.w)}
						height={toDomPrecision(shape.props.h)}
						draggable={false}
						style={{
							pointerEvents: isEditing ? 'auto' : 'none',
							position: 'relative',
						}}
						onLoad={() => setIsIframeLoading(false)}
						className="rounded-xl border-[10px] border-blue-500"
						suppressHydrationWarning
					/>

					{!isFocused && !!shape.props.screenshot && (
						<div
							className="rounded-xl shadow-2xl  border-[10px]  border-white"
							style={{
								position: 'absolute',
								top: 0,
								left: 0,
								width: toDomPrecision(shape.props.w),
								height: toDomPrecision(shape.props.h),
								backgroundImage: `url(${shape.props.screenshot})`,
								backgroundSize: 'cover',
								backgroundPosition: 'center',
								zIndex: 2,
								pointerEvents: 'none',
							}}
						/>
					)}
				</div>
				{/* Duplicate button */}
				<div
					style={{
						position: 'absolute',
						top: 0,
						right: -40,
						height: 40,
						width: 40,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						cursor: 'pointer',
						pointerEvents: 'all',
					}}
					onClick={() => {
						// Create a new preview shape with the same HTML content
						const currentPoint = this.editor.inputs.currentPagePoint
						try {
							// Create a new shape
							const newShape = this.editor.createShape<PreviewShape>({
								type: 'response',
								x: currentPoint.x + 20,
								y: currentPoint.y + 20,
								props: {
									w: shape.props.w,
									h: shape.props.h,
								},
							})

							toast.addToast({
								icon: 'duplicate',
								title: 'Created duplicate shape',
							})
						} catch (error) {
							console.error('Error duplicating shape:', error)
							toast.addToast({
								icon: 'cross-2',
								title: 'Failed to duplicate shape',
							})
						}
					}}
					onPointerDown={stopEventPropagation}
				>
					<TldrawUiIcon icon="duplicate" />
				</div>

				<div
					style={{
						textAlign: 'center',
						position: 'absolute',
						bottom: isEditing ? -40 : 0,
						padding: 4,
						fontFamily: 'inherit',
						fontSize: 12,
						left: 0,
						width: '100%',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						pointerEvents: 'none',
					}}
				>
					<span
						style={{
							background: 'var(--color-panel)',
							padding: '4px 12px',
							borderRadius: 99,
							border: '1px solid var(--color-muted-1)',
						}}
					>
						{isEditing ? 'Click the canvas to exit' : 'Double click to interact'}
					</span>
				</div>
			</HTMLContainer>
		)
	}

	override toSvg(shape: PreviewShape, _ctx: SvgExportContext) {
		// Use a placeholder for SVG export
		return Promise.resolve(
			<rect
				width={shape.props.w.toString()}
				height={shape.props.h.toString()}
				fill="#f5f5f5"
				rx="4"
				ry="4"
			/>
		)
	}

	indicator(shape: PreviewShape) {
		return <rect width={shape.props.w} height={shape.props.h} />
	}
}

const ROTATING_BOX_SHADOWS = [
	{
		offsetX: 0,
		offsetY: 2,
		blur: 4,
		spread: -1,
		color: '#0000003a',
	},
	{
		offsetX: 0,
		offsetY: 3,
		blur: 12,
		spread: -2,
		color: '#0000001f',
	},
]
