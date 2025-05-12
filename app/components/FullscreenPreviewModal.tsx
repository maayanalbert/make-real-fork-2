import { useEffect, useRef, useState } from 'react'
import {
	X,
	Send,
	Square,
	Circle,
	Triangle,
	Type,
	Image,
	Layers,
	Loader2,
	MousePointer,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface FullscreenPreviewModalProps {
	isOpen: boolean
	onClose: () => void
	shapeId: string
	port: string | number
}

export function FullscreenPreviewModal({
	isOpen,
	onClose,
	shapeId,
	port,
}: FullscreenPreviewModalProps) {
	const modalRef = useRef<HTMLDivElement>(null)
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const chatRef = useRef<HTMLDivElement>(null)
	const shapeSettingsRef = useRef<HTMLDivElement>(null)
	const shapesToolbarRef = useRef<HTMLDivElement>(null)
	const [chatMessage, setChatMessage] = useState('')
	const [isIframeLoading, setIsIframeLoading] = useState(true)
	const [isCursorMode, setIsCursorMode] = useState(false)
	const [chatHistory, setChatHistory] = useState<
		Array<{ role: 'user' | 'assistant'; content: string }>
	>([])
	const [selectedShape, setSelectedShape] = useState('rectangle')
	const [shapeSettings, setShapeSettings] = useState({
		width: 100,
		height: 100,
		color: '#000000',
		opacity: 1,
		rotation: 0,
	})

	// Close on click outside
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			// Check if click was inside any of our main elements
			const clickedElement = event.target as Node
			if (
				chatRef.current?.contains(clickedElement) ||
				shapeSettingsRef.current?.contains(clickedElement) ||
				shapesToolbarRef.current?.contains(clickedElement)
			) {
				return
			}
			// Otherwise, close the modal
			onClose()
			setIsIframeLoading(true)
		}
		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside)
		}
		return () => {
			document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [isOpen, onClose])

	// Update iframe when cursor mode changes
	useEffect(() => {
		if (iframeRef.current) {
			iframeRef.current.contentWindow?.postMessage({ type: 'SET_CURSOR_MODE', isCursorMode }, '*')
		}
	}, [isCursorMode])

	const handleSendMessage = () => {
		if (!chatMessage.trim()) return
		setChatHistory([...chatHistory, { role: 'user', content: chatMessage }])
		setChatMessage('')
		// Here you would typically send the message to your backend
	}

	console.log(isIframeLoading)
	return (
		<AnimatePresence>
			{isOpen && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.2 }}
					className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
					onClick={onClose}
				>
					<motion.div
						ref={modalRef}
						initial={{ scale: 0.95, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						exit={{ scale: 0.95, opacity: 0 }}
						transition={{ type: 'spring', duration: 0.3 }}
						className="relative bg-transparent rounded-2xl shadow-2xl p-4 flex flex-col items-center justify-center"
						onClick={(e) => e.stopPropagation()}
					>
						{/* Main row: Chat | Iframe | Shape Settings */}
						<div className="flex flex-row items-start justify-center gap-3 w-full mt-2 px-2">
							{/* Chat */}
							<motion.div
								ref={chatRef}
								initial={{ x: 0, opacity: 0 }}
								animate={{ x: 0, opacity: 1 }}
								className="w-56 h-[calc(100vh-6rem)] bg-white border border-gray-400 rounded-xl flex flex-col shrink-0"
							>
								<div className="p-4 border-b border-gray-200">
									<h3 className="font-semibold text-gray-800">Chat</h3>
								</div>
								<div className="flex-1 overflow-y-auto p-4 space-y-4">
									{chatHistory.map((msg, index) => (
										<div
											key={index}
											className={`p-2 rounded-lg ${
												msg.role === 'user' ? 'bg-blue-100 ml-4' : 'bg-gray-100 mr-4'
											}`}
										>
											{msg.content}
										</div>
									))}
								</div>
								<div className="p-4 border-t border-gray-200">
									<div className="flex gap-2">
										<input
											type="text"
											value={chatMessage}
											onChange={(e) => setChatMessage(e.target.value)}
											onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
											placeholder="Type a message..."
											className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
										/>
										<button
											onClick={handleSendMessage}
											className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
										>
											<Send className="w-5 h-5" />
										</button>
									</div>
								</div>
							</motion.div>

							{/* Iframe */}
							<motion.div
								initial={{ scale: 1, opacity: 0 }}
								animate={{ scale: 1, opacity: 1 }}
								className="w-[calc(100vw-32rem)] h-[calc(100vh-6rem)] bg-white border border-gray-400 rounded-xl flex items-start justify-center relative"
							>
								<AnimatePresence>
									{isIframeLoading && (
										<motion.div
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											className="absolute inset-0 flex items-center justify-center bg-white/80"
										>
											<motion.div
												animate={{ rotate: 360 }}
												transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
											>
												<Loader2 className="w-8 h-8 text-gray-400" />
											</motion.div>
										</motion.div>
									)}
								</AnimatePresence>
								<iframe
									ref={iframeRef}
									id={`iframe-fullscreen-${shapeId}`}
									src={`http://localhost:${port || '3001'}?shapeId=${shapeId}`}
									className="w-full h-full rounded-lg"
									style={{ pointerEvents: 'auto' }}
									onLoad={() => setIsIframeLoading(false)}
								/>
							</motion.div>

							{/* Shape Settings */}
							<motion.div
								ref={shapeSettingsRef}
								initial={{ x: 0, opacity: 0 }}
								animate={{ x: 0, opacity: 1 }}
								className="w-56 h-[calc(100vh-6rem)] bg-white border border-gray-400 rounded-xl flex flex-col shrink-0"
							>
								<div className="p-4 border-b border-gray-200">
									<h3 className="font-semibold text-gray-800">Shape Settings</h3>
								</div>
								<div className="p-4 space-y-4">
									<div>
										<label className="block text-sm font-medium text-gray-700 mb-1">Width</label>
										<input
											type="range"
											min="10"
											max="500"
											value={shapeSettings.width}
											onChange={(e) =>
												setShapeSettings({ ...shapeSettings, width: Number(e.target.value) })
											}
											className="w-full"
										/>
										<span className="text-sm text-gray-500">{shapeSettings.width}px</span>
									</div>
									<div>
										<label className="block text-sm font-medium text-gray-700 mb-1">Height</label>
										<input
											type="range"
											min="10"
											max="500"
											value={shapeSettings.height}
											onChange={(e) =>
												setShapeSettings({ ...shapeSettings, height: Number(e.target.value) })
											}
											className="w-full"
										/>
										<span className="text-sm text-gray-500">{shapeSettings.height}px</span>
									</div>
									<div>
										<label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
										<input
											type="color"
											value={shapeSettings.color}
											onChange={(e) =>
												setShapeSettings({ ...shapeSettings, color: e.target.value })
											}
											className="w-full h-8"
										/>
									</div>
									<div>
										<label className="block text-sm font-medium text-gray-700 mb-1">Opacity</label>
										<input
											type="range"
											min="0"
											max="1"
											step="0.1"
											value={shapeSettings.opacity}
											onChange={(e) =>
												setShapeSettings({ ...shapeSettings, opacity: Number(e.target.value) })
											}
											className="w-full"
										/>
										<span className="text-sm text-gray-500">{shapeSettings.opacity}</span>
									</div>
									<div>
										<label className="block text-sm font-medium text-gray-700 mb-1">Rotation</label>
										<input
											type="range"
											min="0"
											max="360"
											value={shapeSettings.rotation}
											onChange={(e) =>
												setShapeSettings({ ...shapeSettings, rotation: Number(e.target.value) })
											}
											className="w-full"
										/>
										<span className="text-sm text-gray-500">{shapeSettings.rotation}°</span>
									</div>
								</div>
							</motion.div>
						</div>

						{/* Shapes toolbar centered below iframe */}
						<motion.div
							ref={shapesToolbarRef}
							initial={{ y: 20, opacity: 0 }}
							animate={{ y: 0, opacity: 1 }}
							className="flex justify-center w-full mt-4"
						>
							<div className="flex items-center gap-4">
								<div className="p-3 py-2 bg-white border border-gray-400 rounded-xl flex items-center justify-center gap-3">
									<button
										onClick={() => setSelectedShape('rectangle')}
										className={`p-2 rounded-lg ${
											selectedShape === 'rectangle' ? 'bg-blue-100' : 'hover:bg-gray-100'
										}`}
									>
										<Square className="w-5 h-5" />
									</button>
									<button
										onClick={() => setSelectedShape('circle')}
										className={`p-2 rounded-lg ${
											selectedShape === 'circle' ? 'bg-blue-100' : 'hover:bg-gray-100'
										}`}
									>
										<Circle className="w-5 h-5" />
									</button>
									<button
										onClick={() => setSelectedShape('triangle')}
										className={`p-2 rounded-lg ${
											selectedShape === 'triangle' ? 'bg-blue-100' : 'hover:bg-gray-100'
										}`}
									>
										<Triangle className="w-5 h-5" />
									</button>
									<button
										onClick={() => setSelectedShape('text')}
										className={`p-2 rounded-lg ${
											selectedShape === 'text' ? 'bg-blue-100' : 'hover:bg-gray-100'
										}`}
									>
										<Type className="w-5 h-5" />
									</button>
									<button
										onClick={() => setSelectedShape('image')}
										className={`p-2 rounded-lg ${
											selectedShape === 'image' ? 'bg-blue-100' : 'hover:bg-gray-100'
										}`}
									>
										<Image className="w-5 h-5" />
									</button>
									<button
										onClick={() => setSelectedShape('layers')}
										className={`p-2 rounded-lg ${
											selectedShape === 'layers' ? 'bg-blue-100' : 'hover:bg-gray-100'
										}`}
									>
										<Layers className="w-5 h-5" />
									</button>
								</div>
								<button
									onClick={() => setIsCursorMode(!isCursorMode)}
									className={`p-3 py-2 rounded-xl flex items-center justify-center ${
										isCursorMode
											? 'bg-blue-500 text-white hover:bg-blue-600'
											: 'bg-white border border-gray-400 hover:bg-gray-100'
									}`}
								>
									{isCursorMode ? <X className="w-5 h-5" /> : <MousePointer className="w-5 h-5" />}
								</button>
							</div>
						</motion.div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
