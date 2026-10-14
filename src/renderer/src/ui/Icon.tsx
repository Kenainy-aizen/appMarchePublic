const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  briefcase: 'M4 7h16v13H4zM9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M4 13h16',
  contract: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  sliders: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  lock: 'M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3',
  plus: 'M12 5v14M5 12h14',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  check: 'M5 12l5 5 9-10',
  back: 'M19 12H5M11 6l-6 6 6 6',
  swap: 'M7 7h13M17 3l3 4-3 4M17 17H4M7 13l-3 4 3 4',
  refresh: 'M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4',
  alert: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v5M12 16h.01',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  printer: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z'
} as const

export type IconName = keyof typeof PATHS

interface Props {
  readonly name: IconName
  readonly size?: number
}

/** Icône décorative (ignorée par les lecteurs d'écran : le texte du bouton ou du libellé suffit). */
export function Icon({ name, size = 18 }: Props): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Petit drapeau de Madagascar (blanc, rouge, vert) : repère d'identité de l'institution. */
export function FlagMark({ width = 28 }: { readonly width?: number }): React.JSX.Element {
  return (
    <svg
      width={width}
      height={(width * 2) / 3}
      viewBox="0 0 30 20"
      role="img"
      aria-label="Drapeau de Madagascar"
    >
      <rect width="30" height="20" fill="#ffffff" />
      <rect x="10" width="20" height="10" fill="#fc3d32" />
      <rect x="10" y="10" width="20" height="10" fill="#007e3a" />
    </svg>
  )
}
