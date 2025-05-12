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
	TLUserPreferences,
} from 'tldraw'
import { useFocusPreview } from './FocusPreviewContext'
import { useProjectSettings } from '../lib/ProjectSettingsContext'
import { EyeIcon } from '@heroicons/react/24/outline'
import { RotateCw, Layers, X } from 'lucide-react'
import { GitPullRequest } from 'feather-icons-react'
import { motion, AnimatePresence } from 'framer-motion'

export type PreviewShape = TLBaseShape<
	'response',
	{
		w: number
		h: number
		screenshot: string
		branch: string
	}
>

interface FullscreenPreviewModalProps {
	isOpen: boolean
	onClose: () => void
	shapeId: string
	port: string | number
}

function FullscreenPreviewModal({ isOpen, onClose, shapeId, port }: FullscreenPreviewModalProps) {
	const modalRef = useRef<HTMLDivElement>(null)
	const iframeRef = useRef<HTMLIFrameElement>(null)

	// Handle click outside of modal
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
				onClose()
			}
		}

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside)
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [isOpen, onClose])

	return (
		<AnimatePresence>
			{isOpen && (
				<motion.div
					className="fixed inset-0 bg-black/50 flex justify-center items-center z-[9999]"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.2 }}
				>
					<motion.div
						ref={modalRef}
						className="relative w-[90vw] h-[90vh] bg-white rounded-lg shadow-lg overflow-hidden"
						initial={{ scale: 0.9, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						exit={{ scale: 0.9, opacity: 0 }}
						transition={{ type: 'spring', damping: 20, stiffness: 300 }}
					>
						<iframe
							ref={iframeRef}
							id={`iframe-fullscreen-${shapeId}`}
							src={`http://localhost:${port || '3001'}?shapeId=${shapeId}`}
							className="w-full h-full"
							style={{ pointerEvents: 'auto' }}
						/>
						<button
							className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
							onClick={onClose}
						>
							<X className="w-6 h-6" />
						</button>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	)
}

export class PreviewShapeUtil extends BaseBoxShapeUtil<PreviewShape> {
	static override type = 'response' as const

	getDefaultProps(): PreviewShape['props'] {
		return {
			w: (960 * 2) / 3,
			h: 540,
			screenshot: '',
			branch: '',
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
		const [lastFocusedId, setLastFocusedId] = useState<string | null>(null)
		const [isFullscreen, setIsFullscreen] = useState(false)

		// Check if this preview is focused
		const isFocused = focusedPreviewId === shape.id

		// Get dark mode status
		const isDarkMode = useValue('isDarkMode', () => editor.user.getIsDarkMode(), [
			editor.user.getIsDarkMode(),
		])

		// Track if the shape is selected
		const isSelected = useValue(
			'selection',
			() => {
				const selectedIds = editor.getSelectedShapeIds()
				return selectedIds.includes(shape.id)
			},
			[editor, shape.id]
		)

		// Take screenshot and save branch when losing focus
		useEffect(() => {
			if (focusedPreviewId === shape.id && !isSelected) {
				// Only take screenshot and save when this shape was previously focused but now isn't
				console.log('taking screenshot and saving branch state')
				takeScreenshot()
			}
		}, [isSelected, shape.id, focusedPreviewId, lastFocusedId, directoryHandle])

		// Function to take a screenshot of the iframe
		const takeScreenshot = async () => {
			console.log('takeScreenshot started for shape:', shape.id)
			if (!iframeRef.current) {
				console.log('iframeRef is not available, aborting screenshot')
				return
			}

			try {
				console.log('Sending TAKE_SCREENSHOT message to iframe')
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
					console.log('Received message event:', event.data.type)
					if (event.data.type === 'SCREENSHOT_RESULT' && event.data.shapeId === shape.id) {
						console.log(
							'Screenshot received for shape:',
							shape.id,
							'data length:',
							event.data.screenshot?.length || 0
						)
						// Update shape with screenshot
						editor.updateShape({
							id: shape.id,
							type: 'response',
							props: {
								...shape.props,
								screenshot: event.data.screenshot,
							},
						})
						console.log('Shape updated with new screenshot')
						// Remove the event listener
						window.removeEventListener('message', handleScreenshot)
					}
				}

				window.addEventListener('message', handleScreenshot)
				console.log('Message event listener added')
			} catch (error) {
				console.error('Error taking screenshot:', error)
				toast.addToast({
					icon: 'cross-2',
					title: 'Failed to take screenshot',
				})
			}
		}

		// Handle branch switching when focus changes
		useEffect(() => {
			const handleFocusChange = async () => {
				// If we're focusing this shape and it has a branch
				if (isSelected && shape.type === 'response') {
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
			directoryHandle,
			toast,
		])
		return (
			<HTMLContainer className="tl-embed-container" id={shape.id}>
				<div className="relative flex">
					{/* Chat bar - visible only in dark mode */}
					{isDarkMode && (
						<div
							className="absolute -left-80 top-0 h-full w-72 bg-neutral-800 text-neutral-200 p-4 rounded-lg shadow-xl flex flex-col"
							style={{ pointerEvents: 'auto' }}
						>
							<div className="text-lg font-medium mb-4 text-neutral-100">Assistant Chat</div>
							{/* Chat messages would go here */}
							<div className="flex-grow overflow-y-auto space-y-3 pr-2">
								<ChatMessageUser>
									Let&apos;s design a new button component. I want it to feel modern and sleek.
								</ChatMessageUser>
								<ChatMessageAssistant>
									Sounds great! To start, what general shape are you envisioning for the button? For
									example, are you thinking of a rectangle with rounded corners, a circle, or
									something more unique?
								</ChatMessageAssistant>
								<ChatMessageUser>
									I&apos;m thinking a rectangle with slightly rounded corners.
								</ChatMessageUser>

								<ChatMessageAssistant isToolCall={true}>
									Okay, a rectangle with rounded corners. I&apos;ll use the
									`create_rectangle_button` tool to generate a basic version of that.
								</ChatMessageAssistant>
								<ChatMessageAssistant>
									Here&apos;s a first draft of the button. How does this look as a starting point?
									We can tweak the corner radius, color, and add effects like shadows or gradients.
								</ChatMessageAssistant>
							</div>
							{/* Chat input */}
							<div className="mt-4 pt-3 text-base">
								<input
									type="text"
									placeholder="Send a message..."
									className="w-full p-2.5 rounded-md bg-neutral-700 border border-neutral-600 text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
							</div>
						</div>
					)}
					<div className="shadow-2xl rounded-xl border-0">
						<div className="rounded-xl">
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
								className="rounded-lg"
								suppressHydrationWarning
							/>
						</div>
					</div>
				</div>
				{/* Icons container */}
				<div className="absolute top-0 -right-12 flex flex-col items-center gap-2 text-gray-600  transition-colors pointer-events-auto">
					{/* Preview button */}
					<div
						className="flex items-center justify-center cursor-pointer p-1 hover:bg-gray-200 hover:text-gray-900 rounded-md transition-colors"
						onClick={() => {
							// Set dark mode
							editor.user.updateUserPreferences({ isDarkMode: true } as Partial<TLUserPreferences>)
						}}
						onPointerDown={stopEventPropagation}
					>
						<EyeIcon className="w-5 h-5" />
					</div>

					{/* Duplicate button */}
					<div
						className="flex items-center justify-center cursor-pointer p-1 hover:bg-gray-200 hover:text-gray-900 rounded-md transition-colors"
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
										branch: uuidv4(),
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

					{/* Refresh button */}
					<div
						className="flex items-center justify-center cursor-pointer p-1 hover:bg-gray-200 hover:text-gray-900 rounded-md transition-colors"
						onClick={() => {
							// Refresh the preview
							takeScreenshot()
							toast.addToast({
								icon: 'cross-2',
								title: 'Preview refreshed',
							})
						}}
						onPointerDown={stopEventPropagation}
					>
						<RotateCw className="w-5 h-5" strokeWidth={1.75} />
					</div>

					{/* Git Pull Request button */}
					<div
						className="flex items-center justify-center cursor-pointer p-1 hover:bg-gray-200 hover:text-gray-900 rounded-md transition-colors"
						onClick={() => {
							// Handle git pull request
							toast.addToast({
								icon: 'cross-2',
								title: 'Git pull request initiated',
							})
						}}
						onPointerDown={stopEventPropagation}
					>
						<GitPullRequest size={20} strokeWidth={1.75} />
					</div>

					{/* Layers button */}
					<div
						className="flex items-center justify-center cursor-pointer p-1 hover:bg-gray-200 hover:text-gray-900 rounded-md transition-colors"
						onClick={() => {
							// Handle layers
							toast.addToast({
								icon: 'cross-2',
								title: 'Layers view toggled',
							})
						}}
						onPointerDown={stopEventPropagation}
					>
						<Layers className="w-5 h-5" strokeWidth={1.75} />
					</div>
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

// Chat message components
function ChatMessageAssistant({
	children,
	isToolCall,
}: {
	children: React.ReactNode
	isToolCall?: boolean
}) {
	return (
		<div className="flex items-start text-base">
			<div
				className={`p-2.5 rounded-lg max-w-xs ${
					isToolCall ? 'bg-neutral-700 mt-3 text-neutral-400 italic' : ''
				}`}
			>
				{isToolCall && <div className="text-xs text-neutral-500 mb-1 font-medium">TOOL USED</div>}
				<p className={isToolCall ? 'text-sm' : ''}>{children}</p>
			</div>
		</div>
	)
}

function ChatMessageUser({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex items-start justify-start text-base">
			<div className="bg-neutral-700 text-white p-2.5 rounded-lg max-w-xs border border-neutral-600">
				<p>{children}</p>
			</div>
		</div>
	)
}
