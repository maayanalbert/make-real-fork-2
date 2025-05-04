/* eslint-disable react-hooks/rules-of-hooks */
import { ReactElement, useEffect, useState, useRef } from 'react'
import {
	TLBaseShape,
	BaseBoxShapeUtil,
	useIsEditing,
	useToasts,
	useValue,
	HTMLContainer,
	toDomPrecision,
	DefaultSpinner,
	stopEventPropagation,
	SvgExportContext,
	Vec,
	TldrawUiIcon,
	useEditor,
} from 'tldraw'
import { useFocusPreview } from './FocusPreviewContext'

export type PreviewShape = TLBaseShape<
	'response',
	{
		html: string
		w: number
		h: number
		screenshot?: string // Store the screenshot data URL
	}
>

export class PreviewShapeUtil extends BaseBoxShapeUtil<PreviewShape> {
	static override type = 'response' as const

	getDefaultProps(): PreviewShape['props'] {
		return {
			html: '',
			w: (960 * 2) / 3,
			h: 540,
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
		const [screenshot, setScreenshot] = useState<string | undefined>(shape.props.screenshot)
		const iframeRef = useRef<HTMLIFrameElement>(null)
		const wasFocused = useRef<boolean>(false)

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

		// Handle screenshot messages from the iframe
		useEffect(() => {
			// Set up event listener for receiving screenshots
			const handleScreenshotMessage = (event: MessageEvent) => {
				if (event.data.screenshot && event.data?.shapeid === shape.id) {
					try {
						// Validate that the screenshot is a valid data URL string
						if (
							typeof event.data.screenshot === 'string' &&
							event.data.screenshot.startsWith('data:image/')
						) {
							// Set the local state
							setScreenshot(event.data.screenshot)

							// Update the shape props with the screenshot data
							// Ensure it's a string and not an object to avoid JSON serialization issues
							editor.updateShape({
								id: shape.id,
								type: 'response',
								props: {
									...shape.props,
									screenshot: event.data.screenshot,
								},
							})
						} else {
							console.error('Invalid screenshot format received')
						}
					} catch (error) {
						console.error('Error processing screenshot:', error)
					}
				}
			}

			window.addEventListener('message', handleScreenshotMessage)
			return () => {
				window.removeEventListener('message', handleScreenshotMessage)
			}
		}, [editor, shape.id, shape.props])

		// Handle selection changes with useEffect
		useEffect(() => {
			if (isSelected && shape.type === 'response') {
				setFocusedPreviewId(shape.id)
				wasFocused.current = true
			} else if (focusedPreviewId === shape.id && !isSelected) {
				// When losing focus, take a screenshot
				if (wasFocused.current) {
					wasFocused.current = false
					requestScreenshot()
				}

				// If we want to clear focus only when no shapes are selected:
				const selectedIds = editor.getSelectedShapeIds()
				// if (selectedIds.length === 0) {
				// 	setFocusedPreviewId(null)
				// }
			}
		}, [isSelected, shape.id, shape.type, focusedPreviewId, setFocusedPreviewId, editor])

		// Function to request a screenshot from the iframe
		const requestScreenshot = () => {
			const iframe = document.getElementById(`iframe-1-${shape.id}`) as HTMLIFrameElement
			if (iframe && iframe.contentWindow) {
				try {
					iframe.contentWindow.postMessage(
						{
							action: 'take-screenshot',
							shapeid: shape.id,
						},
						'*'
					)
				} catch (error) {
					console.error('Error requesting screenshot:', error)
				}
			}
		}

		const boxShadow = useValue(
			'box shadow',
			() => {
				const rotation = this.editor.getShapePageTransform(shape)!.rotation()
				return getRotatedBoxShadow(rotation)
			},
			[this.editor]
		)

		return (
			<HTMLContainer className="tl-embed-container" id={shape.id}>
				{/* Show the iframe if focused, otherwise show static screenshot */}
				{isFocused || !screenshot ? (
					<iframe
						ref={iframeRef}
						id={`iframe-1-${shape.id}`}
						src="/embedded"
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
					/>
				) : (
					<div
						style={{
							width: toDomPrecision(shape.props.w),
							height: toDomPrecision(shape.props.h),
							boxShadow,
							border: isFocused
								? '10px solid #3b82f6' // Prominent blue outline when focused
								: '1px solid var(--color-panel-contrast)',
							borderRadius: 'var(--radius-2)',
							backgroundImage: `url(${screenshot})`,
							backgroundSize: 'contain',
							backgroundPosition: 'center',
							backgroundRepeat: 'no-repeat',
						}}
						onClick={() => {
							setFocusedPreviewId(shape.id)
						}}
					/>
				)}

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
								x: currentPoint.x + 20, // Offset slightly from current position
								y: currentPoint.y + 20,
								props: {
									html: shape.props.html,
									w: shape.props.w,
									h: shape.props.h,
									// Only include screenshot if it's a valid string
									...(typeof shape.props.screenshot === 'string' && {
										screenshot: shape.props.screenshot,
									}),
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
		// If we have a screenshot, use it directly
		if (shape.props.screenshot && typeof shape.props.screenshot === 'string') {
			return Promise.resolve(<PreviewImage href={shape.props.screenshot} shape={shape} />)
		}

		// Otherwise, get a new screenshot
		return new Promise<ReactElement>((resolve, reject) => {
			if (window === undefined) {
				reject()
				return
			}

			const windowListener = (event: MessageEvent) => {
				if (event.data.screenshot && event.data?.shapeid === shape.id) {
					window.removeEventListener('message', windowListener)
					clearTimeout(timeOut)

					resolve(<PreviewImage href={event.data.screenshot} shape={shape} />)
				}
			}
			const timeOut = setTimeout(() => {
				reject()
				window.removeEventListener('message', windowListener)
			}, 2000)
			window.addEventListener('message', windowListener)
			//request new screenshot
			const firstLevelIframe = document.getElementById(`iframe-1-${shape.id}`) as HTMLIFrameElement
			if (firstLevelIframe) {
				firstLevelIframe.contentWindow?.postMessage(
					{ action: 'take-screenshot', shapeid: shape.id },
					'*'
				)
			} else {
				console.error('first level iframe not found or not accessible')
			}
		})
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

function PreviewImage({ shape, href }: { shape: PreviewShape; href: string }) {
	return <image href={href} width={shape.props.w.toString()} height={shape.props.h.toString()} />
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
