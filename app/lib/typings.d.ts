// File System Access API types
interface FileSystemHandle {
	kind: string
	name: string
	queryPermission?(descriptor: { mode: 'readwrite' | 'read' }): Promise<PermissionState>
	requestPermission?(descriptor: { mode: 'readwrite' | 'read' }): Promise<PermissionState>
}

interface FileSystemFileHandle extends FileSystemHandle {
	kind: 'file'
	getFile(): Promise<File>
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
	kind: 'directory'
	getDirectoryHandle?(
		name: string,
		options?: { create?: boolean }
	): Promise<FileSystemDirectoryHandle>
	getFileHandle?(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
	values?(): AsyncIterable<FileSystemHandle>
}

// Permission states
type PermissionState = 'granted' | 'denied' | 'prompt'

// Global Window interface extension
interface Window {
	showDirectoryPicker?(): Promise<FileSystemDirectoryHandle>
}
