/* eslint-disable react-hooks/rules-of-hooks */
import { ReactElement, useEffect, useRef, useState } from 'react'
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
} from 'tldraw'
import { useFocusPreview } from './FocusPreviewContext'
import { useProjectSettings } from '../lib/ProjectSettingsContext'

export type PreviewShape = TLBaseShape<
	'response',
	{
		html: string
		w: number
		h: number
		fileData?: {
			path?: string
			content?: string
			type?: string
			name?: string
		}
	}
>

export class PreviewShapeUtil extends BaseBoxShapeUtil<PreviewShape> {
	static override type = 'response' as const

	getDefaultProps(): PreviewShape['props'] {
		return {
			html: '',
			w: (960 * 2) / 3,
			h: 540,
			fileData: {
				path: '',
				content: '',
				type: '',
				name: '',
			},
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
		const { directoryHandle, port } = useProjectSettings()
		const iframeRef = useRef<HTMLIFrameElement>(null)
		const [fileContent, setFileContent] = useState<string | null>(null)
		const [saveInProgress, setSaveInProgress] = useState(false)

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

		// Handle selection changes with useEffect
		useEffect(() => {
			if (isSelected && shape.type === 'response') {
				setFocusedPreviewId(shape.id)
			} else if (focusedPreviewId === shape.id && !isSelected) {
				// When shape loses focus, persist any file content that was loaded
				saveFileContentToShape()
			}
		}, [isSelected, shape.id, shape.type, focusedPreviewId, setFocusedPreviewId, editor])

		// Function to save file content to shape when it loses focus
		const saveFileContentToShape = async () => {
			if (saveInProgress) return

			try {
				setSaveInProgress(true)
				const fileContentElement = document.getElementById(
					`file-content-${shape.id}`
				) as HTMLInputElement

				if (fileContentElement && fileContentElement.value) {
					// Store the file content in the shape props
					const currentShape = editor.getShape(shape.id)
					if (currentShape && currentShape.type === 'response') {
						// Get file data from shape
						const fileName =
							document.querySelector(`#iframe-${shape.id} .file-preview h3`)?.textContent || ''
						const fileType =
							document.querySelector(`#iframe-${shape.id} .file-preview p strong`)?.nextSibling
								?.textContent || ''

						editor.updateShape({
							id: shape.id,
							type: 'response',
							props: {
								...currentShape.props,
								fileData: {
									content: fileContentElement.value,
									name: fileName,
									type: fileType,
									path: directoryHandle ? `${directoryHandle.name}/${fileName}` : '',
								},
							},
						})

						toast.addToast({
							icon: 'check',
							title: 'File content saved to shape',
						})
					}
				}
			} catch (error) {
				console.error('Error saving file content:', error)
				toast.addToast({
					icon: 'cross-2',
					title: 'Failed to save file content',
				})
			} finally {
				setSaveInProgress(false)
			}
		}

		// Send messages to iframe when focus changes
		useEffect(() => {
			// Wait for iframe to be ready
			if (!iframeRef.current || !iframeRef.current.contentWindow) return
			// Send message to iframe about focus state
			iframeRef.current.contentWindow.postMessage(
				{
					type: isFocused ? 'RESUME_UPDATES' : 'PAUSE_UPDATES',
					frameId: shape.id,
				},
				'*'
			)
		}, [isFocused, shape.id])

		const boxShadow = useValue(
			'box shadow',
			() => {
				const rotation = this.editor.getShapePageTransform(shape)!.rotation()
				return getRotatedBoxShadow(rotation)
			},
			[this.editor]
		)

		// Check for stored file data on mount
		useEffect(() => {
			if (shape.props.fileData?.content && isFocused) {
				setFileContent(shape.props.fileData.content)
			}
		}, [shape.props.fileData, isFocused])

		return (
			<HTMLContainer className="tl-embed-container" id={shape.id}>
				<iframe
					ref={iframeRef}
					id={`iframe-${shape.id}`}
					src={`http://localhost:${port || '3001'}`}
					width={toDomPrecision(shape.props.w)}
					height={toDomPrecision(shape.props.h)}
					draggable={false}
					style={{
						pointerEvents: isEditing ? 'auto' : 'none',
						boxShadow,
						border: isFocused
							? '10px solid #3b82f6' // Prominent blue outline when focused
							: '10px solid transparent',
						borderRadius: 'var(--radius-2)',
					}}
					suppressHydrationWarning
					onLoad={() => {
						// Initialize focus state when iframe loads
						if (iframeRef.current && iframeRef.current.contentWindow) {
							iframeRef.current.contentWindow.postMessage(
								{
									type: isFocused ? 'RESUME_UPDATES' : 'PAUSE_UPDATES',
									frameId: shape.id,
								},
								'*'
							)

							// If we have stored file data, restore it
							if (shape.props.fileData?.content) {
								const fileData = shape.props.fileData
								// Set HTML content to display file data
								editor.updateShape({
									id: shape.id,
									type: 'response',
									props: {
										...shape.props,
										html: `<div class="file-preview">
											<h3>${fileData.name || 'File'}</h3>
											<p>File loaded. Content will be displayed here.</p>
											<p><strong>File Type:</strong> ${fileData.type || 'Unknown'}</p>
											<input type="hidden" id="file-content-${shape.id}" value="${fileData.content}" />
										</div>`,
									},
								})
							}
						}
					}}
				/>

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
							const newShape = this.editor.createShape<PreviewShape>({
								type: 'response',
								x: currentPoint.x + 20,
								y: currentPoint.y + 20,
								props: {
									html: shape.props.html,
									w: shape.props.w,
									h: shape.props.h,
									fileData: shape.props.fileData,
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

function getRotatedBoxShadow(rotation: number) {
	const cssStrings = ROTATING_BOX_SHADOWS.map((shadow) => {
		const { offsetX, offsetY, blur, spread, color } = shadow
		const vec = new Vec(offsetX, offsetY)
		const { x, y } = vec.rot(-rotation)
		return `${x}px ${y}px ${blur}px ${spread}px ${color}`
	})
	return cssStrings.join(', ')
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
