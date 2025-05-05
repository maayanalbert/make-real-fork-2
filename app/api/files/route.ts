import { NextRequest, NextResponse } from 'next/server'
import { getFilesInDirectory, readFileContent, isValidDirectory } from '../../lib/fileService'
import path from 'path'

// Handler for GET /api/files?directory=/path/to/dir
export async function GET(request: NextRequest) {
	const searchParams = request.nextUrl.searchParams
	const directory = searchParams.get('directory')

	if (!directory) {
		return NextResponse.json({ error: 'Directory path is required' }, { status: 400 })
	}

	try {
		// Validate directory exists
		const isValid = await isValidDirectory(directory)
		if (!isValid) {
			return NextResponse.json({ error: 'Invalid directory path' }, { status: 400 })
		}

		// Get files in directory
		const files = await getFilesInDirectory(directory)

		return NextResponse.json({ files })
	} catch (error) {
		console.error('Error processing request:', error)
		return NextResponse.json({ error: 'Failed to process request' }, { status: 500 })
	}
}

// Handler for POST /api/files/content
export async function POST(request: NextRequest) {
	try {
		const { filePath } = await request.json()

		if (!filePath) {
			return NextResponse.json({ error: 'File path is required' }, { status: 400 })
		}

		// Read file content
		const content = await readFileContent(filePath)
		if (content === null) {
			return NextResponse.json({ error: 'Failed to read file' }, { status: 500 })
		}

		const fileExtension = path.extname(filePath).toLowerCase()

		return NextResponse.json({
			content,
			fileType: fileExtension,
			fileName: path.basename(filePath),
		})
	} catch (error) {
		console.error('Error reading file:', error)
		return NextResponse.json({ error: 'Failed to read file' }, { status: 500 })
	}
}
