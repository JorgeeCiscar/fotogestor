// Variables que electron-vite incrusta en el proceso principal al compilar (prefijo MAIN_VITE_).
interface ImportMetaEnv {
  readonly MAIN_VITE_LICENSE_URL?: string
  readonly MAIN_VITE_LICENSE_ANON_KEY?: string
  readonly MAIN_VITE_LICENSE_PUBLIC_KEY?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
