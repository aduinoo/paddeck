// Default configuration. Device-specific choices (audio devices, mouse/keyboard) are left
// empty on purpose and picked by the user from devices detected at runtime.
let n = 0;
const id = (p) => `${p}_${(++n).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const B = (x, y, label, icon, action, extra = {}) => ({ id: id('b'), x, y, w: 1, h: 1, label, icon, action, ...extra });

const YTM = 'https://music.youtube.com';

function homePage() {
  return {
    id: id('p'), name: 'Home', icon: 'House', cols: 5, rows: 4,
    buttons: [
      B(0, 0, 'Microphone', 'Mic', { type: 'micMute' }, { bind: 'micMuted', bg: '#16a34a', activeBg: '#dc2626', activeLabel: 'Mic muted', activeIcon: 'MicOff' }),
      B(1, 0, 'Mute', 'Volume2', { type: 'volume', mode: 'mute' }, { bind: 'outputMuted', activeIcon: 'VolumeX', activeLabel: 'Muted', activeBg: '#dc2626' }),
      B(2, 0, 'Volume −', 'Volume1', { type: 'volume', mode: 'down', step: 5 }),
      B(3, 0, 'Volume +', 'Volume2', { type: 'volume', mode: 'up', step: 5 }),
      B(4, 0, 'Play / Pause', 'Play', { type: 'media', action: 'toggle' }, { bind: 'mediaPlaying', activeIcon: 'Pause', activeLabel: 'Pause' }),
      B(0, 1, 'Previous', 'SkipBack', { type: 'media', action: 'prev' }),
      B(1, 1, 'Next', 'SkipForward', { type: 'media', action: 'next' }),
      B(2, 1, 'YouTube Music', 'Music', { type: 'ytmusic' }, { bg: '#dc2626' }),
      B(3, 1, 'Discord', 'MessageCircle', { type: 'discord', op: 'launch' }, { bg: '#5865f2' }),
      B(4, 1, 'Chrome', 'Globe', { type: 'app', appId: 'Chrome' }, { appIcon: true }),
      B(0, 2, 'Screenshot', 'Camera', { type: 'system', op: 'screenshot' }),
      B(1, 2, 'Snip', 'Scissors', { type: 'keys', keys: ['win', 'shift', 's'] }),
      B(2, 2, 'Task Manager', 'Activity', { type: 'system', op: 'taskmgr' }),
      B(3, 2, 'Explorer', 'FolderOpen', { type: 'system', op: 'explorer' }),
      B(4, 2, 'Settings', 'Settings', { type: 'system', op: 'settings' }),
      B(0, 3, 'Focus', 'Target', { type: 'focus' }, { bind: 'focus', activeBg: '#7c5cff', activeLabel: 'Focus on' }),
      B(1, 3, 'Lock', 'Lock', { type: 'system', op: 'lock' }),
      B(2, 3, 'Sleep', 'Moon', { type: 'system', op: 'sleep' }, { confirm: true }),
      B(3, 3, 'Restart', 'RotateCcw', { type: 'system', op: 'restart' }, { confirm: true, bg: '#b45309' }),
      B(4, 3, 'Shut down', 'Power', { type: 'system', op: 'shutdown' }, { confirm: true, bg: '#b91c1c' }),
    ],
  };
}

function workPage() {
  return {
    id: id('p'), name: 'Work', icon: 'Briefcase', cols: 5, rows: 4,
    buttons: [
      B(0, 0, 'VS Code', 'Code', { type: 'app', appId: 'Microsoft.VisualStudioCode' }, { appIcon: true }),
      B(1, 0, 'Edge', 'Globe', { type: 'app', appId: 'MSEdge' }, { appIcon: true }),
      B(2, 0, 'Chrome', 'Globe', { type: 'app', appId: 'Chrome' }, { appIcon: true }),
      B(3, 0, 'Explorer', 'FolderOpen', { type: 'system', op: 'explorer' }),
      B(4, 0, 'Terminal', 'SquareTerminal', { type: 'keys', keys: ['win', 'x'] }),
      B(0, 1, 'Copy', 'Copy', { type: 'keys', keys: ['ctrl', 'c'] }),
      B(1, 1, 'Paste', 'ClipboardPaste', { type: 'keys', keys: ['ctrl', 'v'] }),
      B(2, 1, 'Undo', 'Undo2', { type: 'keys', keys: ['ctrl', 'z'] }),
      B(3, 1, 'Redo', 'Redo2', { type: 'keys', keys: ['ctrl', 'y'] }),
      B(4, 1, 'Save', 'Save', { type: 'keys', keys: ['ctrl', 's'] }),
      B(0, 2, 'Alt + Tab', 'ArrowLeftRight', { type: 'keys', keys: ['alt', 'tab'] }),
      B(1, 2, 'Task view', 'LayoutGrid', { type: 'keys', keys: ['win', 'tab'] }),
      B(2, 2, 'Show desktop', 'Monitor', { type: 'keys', keys: ['win', 'd'] }),
      B(3, 2, 'Snap left', 'PanelLeft', { type: 'keys', keys: ['win', 'left'] }),
      B(4, 2, 'Snap right', 'PanelRight', { type: 'keys', keys: ['win', 'right'] }),
      B(0, 3, 'Emoji', 'Smile', { type: 'keys', keys: ['win', '.'] }),
      B(1, 3, 'Clipboard', 'ClipboardList', { type: 'keys', keys: ['win', 'v'] }),
      B(2, 3, 'Work audio', 'Headphones', { type: 'audioProfile', id: 'ap_work' }),
      B(3, 3, 'Meeting', 'Users', { type: 'audioProfile', id: 'ap_meeting' }),
      B(4, 3, 'Focus', 'Target', { type: 'focus' }, { bind: 'focus', activeBg: '#7c5cff' }),
    ],
  };
}

function gamingPage() {
  return {
    id: id('p'), name: 'Gaming', icon: 'Gamepad2', cols: 5, rows: 4,
    buttons: [
      B(0, 0, 'Steam', 'Gamepad2', { type: 'app', name: 'Steam' }, { appIcon: true }),
      B(1, 0, 'Discord', 'MessageCircle', { type: 'discord', op: 'launch' }, { bg: '#5865f2' }),
      B(2, 0, 'Discord mute', 'MicOff', { type: 'discord', op: 'mute' }, { bg: '#4752c4' }),
      B(3, 0, 'Discord deafen', 'HeadphoneOff', { type: 'discord', op: 'deafen' }, { bg: '#4752c4' }),
      B(4, 0, 'Mic', 'Mic', { type: 'micMute' }, { bind: 'micMuted', bg: '#16a34a', activeBg: '#dc2626', activeIcon: 'MicOff', activeLabel: 'Mic muted' }),
      B(0, 1, 'Game Bar', 'LayoutDashboard', { type: 'keys', keys: ['win', 'g'] }),
      B(1, 1, 'Clip last 30s', 'Clapperboard', { type: 'keys', keys: ['win', 'alt', 'g'] }),
      B(2, 1, 'Record', 'Circle', { type: 'keys', keys: ['win', 'alt', 'r'] }, { bg: '#b91c1c' }),
      B(3, 1, 'Screenshot', 'Camera', { type: 'keys', keys: ['win', 'alt', 'printscreen'] }),
      B(4, 1, 'Gaming audio', 'Headphones', { type: 'audioProfile', id: 'ap_gaming' }),
      B(0, 2, 'Volume −', 'Volume1', { type: 'volume', mode: 'down', step: 5 }),
      B(1, 2, 'Volume +', 'Volume2', { type: 'volume', mode: 'up', step: 5 }),
      B(2, 2, 'Play / Pause', 'Play', { type: 'media', action: 'toggle' }, { bind: 'mediaPlaying', activeIcon: 'Pause' }),
      B(3, 2, 'Next', 'SkipForward', { type: 'media', action: 'next' }),
      B(4, 2, 'Task Manager', 'Activity', { type: 'system', op: 'taskmgr' }),
    ],
  };
}

function creativePage() {
  return {
    id: id('p'), name: 'Creative', icon: 'Palette', cols: 5, rows: 4,
    buttons: [
      B(0, 0, 'Photoshop', 'Image', { type: 'app', name: 'Photoshop' }, { appIcon: true }),
      B(1, 0, 'Draw mode', 'PenTool', { type: 'mode', mode: 'draw' }, { bg: '#7c5cff' }),
      B(2, 0, 'Undo', 'Undo2', { type: 'keys', keys: ['ctrl', 'z'] }),
      B(3, 0, 'Redo', 'Redo2', { type: 'keys', keys: ['ctrl', 'shift', 'z'] }),
      B(4, 0, 'Save', 'Save', { type: 'keys', keys: ['ctrl', 's'] }),
      B(0, 1, 'Brush', 'Brush', { type: 'keys', keys: ['b'] }),
      B(1, 1, 'Eraser', 'Eraser', { type: 'keys', keys: ['e'] }),
      B(2, 1, 'Brush −', 'Minus', { type: 'keys', keys: ['['] }),
      B(3, 1, 'Brush +', 'Plus', { type: 'keys', keys: [']'] }),
      B(4, 1, 'Eyedropper', 'Pipette', { type: 'keys', keys: ['i'] }),
      B(0, 2, 'Zoom in', 'ZoomIn', { type: 'keys', keys: ['ctrl', '='] }),
      B(1, 2, 'Zoom out', 'ZoomOut', { type: 'keys', keys: ['ctrl', '-'] }),
      B(2, 2, 'Fit', 'Maximize', { type: 'keys', keys: ['ctrl', '0'] }),
      B(3, 2, 'New layer', 'Layers', { type: 'keys', keys: ['ctrl', 'shift', 'n'] }),
      B(4, 2, 'Deselect', 'SquareDashed', { type: 'keys', keys: ['ctrl', 'd'] }),
      B(0, 3, 'Export PNG', 'FileOutput', { type: 'keys', keys: ['ctrl', 'shift', 'alt', 'w'] }),
      B(1, 3, 'Swap colours', 'ArrowLeftRight', { type: 'keys', keys: ['x'] }),
      B(2, 3, 'Hand tool', 'Hand', { type: 'keys', keys: ['h'] }),
    ],
  };
}

const WIN_MEDIA = 'C:\\Windows\\Media\\';
function soundboard() {
  const S = (name, file, icon, color) => ({ id: id('s'), name, file, icon, color, volume: 80 });
  return {
    masterVolume: 80,
    categories: ['Funny Sounds', 'Memes', 'Reactions', 'Notifications', 'Gaming', 'Custom Sounds'],
    pages: [
      {
        id: id('sp'), name: 'Main',
        sounds: [
          { ...S('Tada', WIN_MEDIA + 'tada.wav', 'PartyPopper', '#f59e0b'), category: 'Reactions' },
          { ...S('Notify', WIN_MEDIA + 'Windows Notify System Generic.wav', 'Bell', '#0ea5e9'), category: 'Notifications' },
          { ...S('Chimes', WIN_MEDIA + 'chimes.wav', 'BellRing', '#14b8a6'), category: 'Notifications' },
          { ...S('Ding', WIN_MEDIA + 'Windows Ding.wav', 'Sparkles', '#8b5cf6'), category: 'Notifications' },
          { ...S('Alarm', WIN_MEDIA + 'Alarm01.wav', 'AlarmClock', '#ef4444'), category: 'Gaming' },
          { ...S('Ring', WIN_MEDIA + 'Ring05.wav', 'Phone', '#22c55e'), category: 'Funny Sounds' },
        ],
      },
    ],
  };
}

export function defaultTheme() {
  return {
    mode: 'dark', accent: '#7c5cff', background: { type: 'gradient', value: 'aurora' },
    radius: 22, gap: 14, buttonStyle: 'glass', font: 'Inter', showLabels: true, density: 'comfortable',
  };
}

function musicPage() {
  return {
    id: id('p'), name: 'Music', icon: 'Music2', cols: 5, rows: 3,
    buttons: [
      B(0, 0, 'YouTube Music', 'Music', { type: 'ytmusic' }, { bg: '#dc2626', w: 2, h: 2 }),
      B(2, 0, 'Previous', 'SkipBack', { type: 'media', action: 'prev' }),
      B(3, 0, 'Play / Pause', 'Play', { type: 'media', action: 'toggle' }, { bind: 'mediaPlaying', activeIcon: 'Pause', bg: '#ec4899' }),
      B(4, 0, 'Next', 'SkipForward', { type: 'media', action: 'next' }),
      B(2, 1, 'Volume −', 'Volume1', { type: 'volume', mode: 'down', step: 5 }),
      B(3, 1, 'Mute', 'VolumeX', { type: 'volume', mode: 'mute' }, { bind: 'outputMuted', activeBg: '#dc2626' }),
      B(4, 1, 'Volume +', 'Volume2', { type: 'volume', mode: 'up', step: 5 }),
      B(0, 2, 'Music audio', 'Headphones', { type: 'audioProfile', id: 'ap_music' }),
      B(1, 2, 'Silent', 'VolumeX', { type: 'audioProfile', id: 'ap_silent' }),
    ],
  };
}

// Template profiles added for 2.0 (Work, Gaming, Productivity, Creative, Music).
export function templateProfiles() {
  const mk = (name, icon, color, preset, pages) => ({ ...defaultProfile(name), icon, color, theme: { ...defaultTheme(), preset, accent: color }, pages });
  return [
    mk('Work', 'Briefcase', '#0ea5e9', 'midnight', [workPage(), homePage()]),
    mk('Gaming', 'Gamepad2', '#22c55e', 'amoled', [gamingPage(), homePage()]),
    mk('Productivity', 'ListChecks', '#f97316', 'minimal', [workPage(), homePage()]),
    mk('Creative', 'Palette', '#a855f7', 'dark', [creativePage(), homePage()]),
    mk('Music', 'Music2', '#ec4899', 'dark', [musicPage(), homePage()]),
  ];
}

export function defaultProfile(name = 'Default') {
  return {
    id: id('prof'), name, icon: 'User', color: '#7c5cff',
    theme: defaultTheme(),
    pages: [homePage(), workPage(), gamingPage(), creativePage()],
    soundboard: soundboard(),
    widgets: ['cpu', 'gpu', 'ram', 'media', 'audio', 'mouse', 'keyboard', 'devices', 'disk', 'net', 'uptime', 'discord', 'shortcuts', 'focus'],
  };
}

export function defaultConfig() {
  const prof = defaultProfile('Default');
  const templates = templateProfiles();
  return {
    version: 2,
    rev: 1,
    devicePrefs: {},
    activeProfileId: prof.id,
    profiles: [prof, ...templates],
    audioProfiles: [
      { id: 'ap_gaming', name: 'Gaming', icon: 'Gamepad2', color: '#22c55e', output: null, input: null, volume: 70, micVolume: null, micMuted: false, systemMuted: false },
      { id: 'ap_work', name: 'Work', icon: 'Briefcase', color: '#0ea5e9', output: null, input: null, volume: 45, micVolume: null, micMuted: null, systemMuted: false },
      { id: 'ap_meeting', name: 'Meeting', icon: 'Users', color: '#f59e0b', output: null, input: null, volume: 55, micVolume: 90, micMuted: false, systemMuted: false },
      { id: 'ap_music', name: 'Music', icon: 'Music', color: '#ec4899', output: null, input: null, volume: 65, micVolume: null, micMuted: null, systemMuted: false },
      { id: 'ap_silent', name: 'Silent', icon: 'VolumeX', color: '#64748b', output: null, input: null, volume: null, micVolume: null, micMuted: true, systemMuted: true },
    ],
    apps: [], // manual registrations; auto-detected apps come from the Start menu at runtime
    favoriteApps: ['Chrome', 'MSEdge', 'Microsoft.VisualStudioCode', 'com.squirrel.Discord.Discord', 'Microsoft.Windows.Explorer'],
    themes: [],
    focus: { active: false, volume: 25, audioProfileId: null, silenceToasts: true, muteSoundboard: true, launch: [], minimize: false },
    discord: { muteKeys: ['ctrl', 'shift', 'm'], deafenKeys: ['ctrl', 'shift', 'd'] },
    youtubeMusic: { url: 'https://music.youtube.com', preferApp: true, pinnedAppId: null },
    hardware: { mouseId: null, keyboardId: null, batteryThreshold: 20, lhmUrl: 'http://127.0.0.1:8085/data.json' },
    notifications: { battery: true, tabletDisconnected: true, audioDeviceChanged: true, micMuted: true, connectionQuality: true, appLaunched: false },
    pen: {
      target: 'primary', // 'primary' | 'all' | screen name e.g. \\.\DISPLAY1
      area: { x: 0, y: 0, w: 1, h: 1 }, // portion of the tablet surface that maps to the target
      keepAspect: true, curve: [0.25, 0.25, 0.75, 0.75], minPressure: 0, maxPressure: 1,
      smoothing: 0, hover: true, palmRejection: true, leftHanded: false, showBar: true,
      barrelAction: 'rightClick', eraserMode: 'auto', fingerGestures: true,
      shortcuts: [
        { label: 'Undo', keys: ['ctrl', 'z'], icon: 'Undo2' },
        { label: 'Redo', keys: ['ctrl', 'shift', 'z'], icon: 'Redo2' },
        { label: 'Brush −', keys: ['['], icon: 'Minus' },
        { label: 'Brush +', keys: [']'], icon: 'Plus' },
        { label: 'Zoom in', keys: ['ctrl', '='], icon: 'ZoomIn' },
        { label: 'Zoom out', keys: ['ctrl', '-'], icon: 'ZoomOut' },
        { label: 'Hand', keys: ['space'], icon: 'Hand', hold: true },
        { label: 'Ctrl', keys: ['ctrl'], icon: 'ChevronUp', hold: true },
        { label: 'Shift', keys: ['shift'], icon: 'ArrowBigUp', hold: true },
        { label: 'Alt', keys: ['alt'], icon: 'Option', hold: true },
        { label: 'Eraser', keys: ['e'], icon: 'Eraser' },
        { label: 'Brush', keys: ['b'], icon: 'Brush' },
      ],
    },
    display: { moonlightHost: null, preferredResolution: '2560x1600', fps: 60, bitrate: 30 },
  };
}

export function newId(prefix) { return id(prefix); }
