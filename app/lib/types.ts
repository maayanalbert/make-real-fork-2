// Permission states
export type PermissionState = 'granted' | 'denied' | 'prompt'

// Base interface for all file system handles
export interface FileSystemHandle {
	kind: string
	name: string
}

// Interface for directory handles
export interface FileSystemDirectoryHandle extends FileSystemHandle {
	kind: 'directory'
	getDirectoryHandle(
		name: string,
		options?: { create?: boolean }
	): Promise<FileSystemDirectoryHandle>
	getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
	values(): AsyncIterableIterator<FileSystemHandle>
	queryPermission(descriptor: { mode: 'readwrite' | 'read' }): Promise<PermissionState>
	requestPermission(descriptor: { mode: 'readwrite' | 'read' }): Promise<PermissionState>
	removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
}

// Interface for file handles
export interface FileSystemFileHandle extends FileSystemHandle {
	kind: 'file'
	getFile(): Promise<File>
	createWritable(): Promise<FileSystemWritableFileStream>
}

// Interface for writable file streams
export interface FileSystemWritableFileStream extends WritableStream {
	write(data: any): Promise<void>
	close(): Promise<void>
}

// Add window.showDirectoryPicker declaration
declare global {
	interface Window {
		showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
	}
}
