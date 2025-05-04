/** @type {import('next').NextConfig} */
const nextConfig = {
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

module.exports = nextConfig
