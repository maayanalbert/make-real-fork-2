// fileService.ts
// This service handles file operations for the preview shapes

import fs from 'fs'
import path from 'path'
import { promises as fsPromises } from 'fs'

/**
 * Get list of files in a directory
 */
export async function getFilesInDirectory(directoryPath: string): Promise<string[]> {
	try {
		const files = await fsPromises.readdir(directoryPath)
		return files
	} catch (error) {
		console.error('Error reading directory:', error)
		return []
	}
}

/**
 * Read file content
 */
export async function readFileContent(filePath: string): Promise<string | null> {
	try {
		// For PDF files, we would normally use a PDF parsing library
		// For this example, we'll read the file as base64 to demonstrate the concept
		const data = await fsPromises.readFile(filePath)
		const base64Data = data.toString('base64')
		return base64Data
	} catch (error) {
		console.error('Error reading file:', error)
		return null
	}
}

/**
 * Check if path exists and is a directory
 */
export async function isValidDirectory(directoryPath: string): Promise<boolean> {
	try {
		const stats = await fsPromises.stat(directoryPath)
		return stats.isDirectory()
	} catch (error) {
		return false
	}
}

/**
 * Get file type based on extension
 */
export function getFileType(filePath: string): string {
	const extension = path.extname(filePath).toLowerCase()
	return extension
}
