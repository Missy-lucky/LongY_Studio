export {}
declare global {
  interface Window {
    desktopAPI?: {
      platform: string
      isElectron: boolean
      minimize: () => void
      maximize: () => void
      close: () => void
      confirmClose: () => void
      selectDirectory: () => Promise<string | null>
      openPath: (targetPath: string) => Promise<string>
      onBeforeClose: (callback: () => void) => void
      onMaximized: (callback: (value: boolean) => void) => void
    }
  }
}
