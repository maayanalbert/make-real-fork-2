'use client'
import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'

// Define the window type to include html2canvas
declare global {
	interface Window {
		html2canvas: (element: HTMLElement, options?: any) => Promise<HTMLCanvasElement>
	}
}

// Simple spinner component
function Spinner() {
	return (
		<div
			style={{
				width: '28px',
				height: '28px',
				border: '3px solid rgba(0, 0, 0, 0.1)',
				borderTop: '3px solid #3b82f6',
				borderRadius: '50%',
				animation: 'spin 1s linear infinite',
			}}
		>
			<style jsx>{`
				@keyframes spin {
					0% {
						transform: rotate(0deg);
					}
					100% {
						transform: rotate(360deg);
					}
				}
			`}</style>
		</div>
	)
}

export default function EmbeddedPage() {
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [html2canvasLoaded, setHtml2canvasLoaded] = useState(false)

	useEffect(() => {
		// Handle messages from parent frame and pass them to child iframe
		const handleMessage = (event: MessageEvent) => {
			// Handle take-screenshot action
			if (event.data.action === 'take-screenshot') {
				if (html2canvasLoaded && typeof window !== 'undefined' && window.html2canvas) {
					// Take screenshot of the entire page including the iframe
					window
						.html2canvas(document.body, {
							useCORS: true,
							logging: false,
							allowTaint: true,
							foreignObjectRendering: true,
						})
						.then((canvas: HTMLCanvasElement) => {
							const screenshotData = canvas.toDataURL('image/png')
							// Send screenshot data back to parent window
							window.parent.postMessage(
								{
									screenshot: screenshotData,
									shapeid: event.data.shapeid,
								},
								'*'
							)
						})
						.catch((error: Error) => {
							console.error('Screenshot error:', error)
						})
				} else {
					console.warn('html2canvas not loaded yet')
				}
			}

			// Pass other messages to the inner iframe
			if (iframeRef.current?.contentWindow) {
				iframeRef.current.contentWindow.postMessage(event.data, '*')
			}
		}

		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [html2canvasLoaded])

	const handleIframeLoad = () => {
		setLoading(false)
		console.log('Iframe loaded successfully')
	}

	const handleIframeError = (e: React.SyntheticEvent<HTMLIFrameElement, Event>) => {
		setError('Failed to load iframe content')
		console.error('Iframe loading error:', e)
	}

	const onHtml2CanvasLoad = () => {
		setHtml2canvasLoaded(true)
		console.log('html2canvas loaded')
	}

	return (
		<div
			style={{
				height: '100vh',
				width: '100%',
				overflow: 'hidden',
				position: 'relative',
				display: 'flex',
				flexDirection: 'column',
				backgroundColor: '#fff',
			}}
		>
			{/* Load html2canvas for screenshot functionality */}
			<Script
				src="https://html2canvas.hertzen.com/dist/html2canvas.min.js"
				onLoad={onHtml2CanvasLoad}
				strategy="beforeInteractive"
			/>

			{/* {loading && (
				<div
					style={{
						position: 'absolute',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						flexDirection: 'column',
						background: '#ffffff',
						zIndex: 10,
					}}
				>
					<div style={{ marginBottom: '12px' }}>
						<Spinner />
					</div>
					<p style={{ color: '#374151', fontFamily: 'system-ui, sans-serif' }}>
						Loading PDF Quiz Generator...
					</p>
				</div>
			)}
			{error && (
				<div
					style={{
						position: 'absolute',
						top: 0,
						left: 0,
						right: 0,
						padding: '20px',
						background: '#fee',
						color: '#b91c1c',
						zIndex: 10,
						fontFamily: 'system-ui, sans-serif',
						textAlign: 'center',
						borderBottom: '1px solid #fca5a5',
					}}
				>
					{error}
				</div>
			)} */}
			<iframe
				ref={iframeRef}
				src="http://localhost:3001"
				style={{
					border: 'none',
					width: '100%',
					height: '100%',
					flexGrow: 1,
					minHeight: '100vh',
				}}
				allow="cross-origin-isolated"
				onLoad={handleIframeLoad}
				onError={handleIframeError}
			/>
		</div>
	)
}
