'use client'

import { ProjectSettingsProvider, useProjectSettings } from '../lib/ProjectSettingsContext'
import GitRepoInfo from '../components/GitRepoInfo'
import { FocusPreviewProvider } from '../PreviewShape/FocusPreviewContext'

export default function SettingsPage() {
	return (
		<ProjectSettingsProvider>
			<FocusPreviewProvider>
				<SettingsContent />
			</FocusPreviewProvider>
		</ProjectSettingsProvider>
	)
}

function SettingsContent() {
	const { port, setPort } = useProjectSettings()

	return (
		<div className="container mx-auto px-4 py-8">
			<h1 className="text-2xl font-bold mb-6">Project Settings</h1>

			<div className="grid grid-cols-1 gap-6">
				<div className="p-4 border rounded-lg shadow-sm">
					<h2 className="text-xl font-semibold mb-4">Project Configuration</h2>

					<div className="space-y-4">
						<div>
							<label htmlFor="port" className="block text-sm font-medium text-gray-700 mb-1">
								Development Server Port
							</label>
							<input
								type="text"
								id="port"
								value={port}
								onChange={(e) => setPort(e.target.value)}
								className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
							<p className="mt-1 text-sm text-gray-500">
								The port number for the development server
							</p>
						</div>
					</div>
				</div>

				<GitRepoInfo />
			</div>
		</div>
	)
}
