module.exports = {
	async rewrites() {
		return [
			// Embedded route
			{
				source: '/embedded/:path*',
				destination: 'http://localhost:3001/:path*',
			},
			// API routes
			{
				source: '/api/:path*',
				destination: 'http://localhost:3001/api/:path*',
			},
			// Static assets and other routes from AI SDK preview
			{
				source: '/_next/:path*',
				destination: 'http://localhost:3001/_next/:path*',
			},
			{
				source: '/assets/:path*',
				destination: 'http://localhost:3001/assets/:path*',
			},
			{
				source: '/pdf/:path*',
				destination: 'http://localhost:3001/pdf/:path*',
			},
			{
				source: '/pdf-viewer/:path*',
				destination: 'http://localhost:3001/pdf-viewer/:path*',
			},
		]
	},
	// Increase webpack asset size limit to prevent issues with large PDFs
	webpack: (config) => {
		config.performance = {
			...config.performance,
			maxAssetSize: 5000000,
			maxEntrypointSize: 5000000,
		}
		return config
	},
}
