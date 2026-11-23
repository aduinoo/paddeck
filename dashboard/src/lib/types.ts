export type Action = { type: string; [k: string]: any }

export interface DeckButton {
  id: string; x: number; y: number; w: number; h: number
  label: string; icon?: string; image?: string; appIcon?: boolean
  bg?: string; bg2?: string; fg?: string; emoji?: string; fileIcon?: boolean; action: Action
  confirm?: boolean; toggle?: boolean
  bind?: 'micMuted' | 'outputMuted' | 'focus' | 'mediaPlaying' | string
  activeBg?: string; activeIcon?: string; activeLabel?: string
}

export interface DeckPage { id: string; name: string; icon: string; cols: number; rows: number; buttons: DeckButton[] }

export interface Sound { id: string; name: string; file: string; icon: string; emoji?: string; color: string; volume: number; category?: string }
export interface SoundPage { id: string; name: string; sounds: Sound[] }

export interface Theme {
  mode: 'dark' | 'light'; accent: string; background: { type: 'gradient' | 'solid' | 'image'; value: string }
  radius: number; gap: number; buttonStyle: 'glass' | 'solid' | 'outline'; font: string; showLabels: boolean; density: string
  name?: string; preset?: string
  colors?: { accent: string; accent2: string; bg: string; panel: string; button: string; text: string; border: string; selected: string }
}

export interface Profile {
  id: string; name: string; icon: string; color: string; theme: Theme
  pages: DeckPage[]; soundboard: { masterVolume: number; categories: string[]; pages: SoundPage[] }; widgets: string[]
}

export interface DeviceRef { id: string; name: string }
export interface AudioProfile {
  id: string; name: string; icon: string; color: string
  output: DeviceRef | null; input: DeviceRef | null
  volume: number | null; micVolume: number | null; micMuted: boolean | null; systemMuted: boolean | null
}

export interface PenShortcut { label: string; keys: string[]; icon: string; hold?: boolean }
export interface PenSettings {
  target: string; area: { x: number; y: number; w: number; h: number }; keepAspect: boolean
  curve: number[]; minPressure: number; maxPressure: number; smoothing: number; hover: boolean
  palmRejection: boolean; leftHanded: boolean; showBar: boolean; barrelAction: string; eraserMode: string
  fingerGestures: boolean; shortcuts: PenShortcut[]; gamma?: number; rotate?: number
}

export interface Config {
  version: number; rev: number; activeProfileId: string; activeAudioProfileId?: string
  profiles: Profile[]; audioProfiles: AudioProfile[]
  apps: { id: string; name: string; appId?: string; path?: string; args?: string; icon?: string; image?: string }[]
  favoriteApps: string[]; themes: Theme[]
  focus: { active: boolean; volume: number | null; audioProfileId: string | null; silenceToasts: boolean; muteSoundboard: boolean; launch: { appId: string; name: string }[]; minimize: boolean }
  discord: { muteKeys: string[]; deafenKeys: string[] }
  youtubeMusic: { url: string; preferApp: boolean; pinnedAppId: string | null }
  hardware: { mouseId: string | null; keyboardId: string | null; batteryThreshold: number; lhmUrl: string }
  notifications: Record<string, boolean>
  pen: PenSettings
  display: { moonlightHost: string | null; preferredResolution: string; fps: number; bitrate: number }
}

export interface AudioDevice { id: string; name: string; description?: string; isDefault: boolean; isDefaultComm: boolean; volume: number | null; muted: boolean | null }
export interface AudioSession { pid: number; name: string; path: string | null; volume: number; muted: boolean; active: boolean }
export interface MediaSession {
  appId: string; isCurrent: boolean; title?: string; artist?: string; album?: string; status: string
  canPlay: boolean; canPause: boolean; canNext: boolean; canPrev: boolean; canSeek: boolean; position: number; duration: number; isBrowser?: boolean
}
export interface Screen { index: number; name: string; monitor: string; adapter: string; primary: boolean; x: number; y: number; width: number; height: number; refresh: number }

export interface PcState {
  stats: {
    cpu: number | null; cpuModel?: string; cores?: number; ram: { used: number; total: number; percent: number } | null
    gpu: { name: string | null; usage: number | null; memUsed?: number; memTotal?: number; source: string | null } | null
    temps: { cpu: number | null; gpu: number | null; source: string | null }
    disks: { name: string; label: string; total: number; free: number }[]
    net: { rx: number; tx: number; interfaces: string[] } | null
    uptime: number; host?: string
  }
  peripherals: {
    battery: { name: string; address: string | null; battery: number; kinds: string[]; bus: string }[]
    inputs: { kind: string; name: string; bus: string; address: string | null; vidpid: string | null; id: string }[]
    scannedAt: number | null
  }
  audio: { outputs: AudioDevice[]; inputs: AudioDevice[]; sessions: AudioSession[] }
  media: { sessions: MediaSession[]; current: MediaSession | null }
  mediaArt?: string | null
  screens: Screen[]
  focus?: boolean; version?: string; host?: string
}
