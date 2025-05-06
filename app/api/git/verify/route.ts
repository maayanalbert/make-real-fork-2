import { NextResponse } from 'next/server'

/**
 * Verify if a Git repository exists and is accessible
 */
export async function POST(request: Request) {
	console.log('API route hit: /api/git/verify')
	try {
		// Get repo URL from request
		const body = await request.json().catch((e) => {
			console.error('Failed to parse request body:', e)
			return {}
		})

		const { repoUrl } = body
		console.log(`Received request to verify repository: ${repoUrl}`)

		if (!repoUrl) {
			console.error('Repository URL is missing from request')
			return NextResponse.json({ error: 'Repository URL is required' }, { status: 400 })
		}

		// Parse the GitHub repository information from URL
		const repoRegex = /github\.com\/([^\/]+)\/([^\/]+)/i
		const match = repoUrl.match(repoRegex)

		if (!match) {
			console.error(`Invalid GitHub URL format: ${repoUrl}`)
			return NextResponse.json({ error: 'Invalid GitHub repository URL' }, { status: 400 })
		}

		const [, owner, repo] = match
		const repoName = repo.replace('.git', '')

		// Try to fetch repository information from GitHub API
		const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
			headers: {
				Accept: 'application/vnd.github.v3+json',
				// Add GitHub token if available
				...(process.env.GITHUB_TOKEN && {
					Authorization: `token ${process.env.GITHUB_TOKEN}`,
				}),
			},
		})

		if (!response.ok) {
			console.error(`Repository not found or not accessible: ${response.statusText}`)
			return NextResponse.json({ exists: false })
		}

		// Repository exists and is accessible
		return NextResponse.json({ exists: true })
	} catch (error) {
		console.error('Error verifying repository:', error)
		return NextResponse.json(
			{
				error: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
			},
			{ status: 500 }
		)
	}
}
