import { SUIT_COLORS } from '../../lib/cards'

// Hand-drawn SVG paths for the four Hungarian (Tell pattern) suits.
const PATHS = {
  // Hearts (Piros)
  piros: (
    <path d="M12 21C12 21 3.5 14.5 3.5 8.8C3.5 5.9 5.7 3.8 8.4 3.8C10.1 3.8 11.4 4.8 12 6C12.6 4.8 13.9 3.8 15.6 3.8C18.3 3.8 20.5 5.9 20.5 8.8C20.5 14.5 12 21 12 21Z" />
  ),
  // Bells (Tök)
  tok: (
    <>
      <path d="M12 2.5C9.4 2.5 7.5 4.6 7.5 7.2C7.5 10 6.8 12.4 5.2 14.2C4.6 14.9 5.1 16 6 16H18C18.9 16 19.4 14.9 18.8 14.2C17.2 12.4 16.5 10 16.5 7.2C16.5 4.6 14.6 2.5 12 2.5Z" />
      <circle cx="12" cy="19" r="2.3" />
    </>
  ),
  // Leaves (Zöld)
  zold: (
    <>
      <path d="M12 2C6.5 6.5 5 12.5 7.5 19.5C8.2 19.5 8.9 19.4 9.5 19.2C9 15 9.8 10.5 12 6.5C12 6.5 12 6.5 12 6.5C14.2 10.5 15 15 14.5 19.2C15.1 19.4 15.8 19.5 16.5 19.5C19 12.5 17.5 6.5 12 2Z" />
      <rect x="11.3" y="17" width="1.4" height="5" rx="0.7" />
    </>
  ),
  // Acorns (Makk)
  makk: (
    <>
      <rect x="11.4" y="2.5" width="1.2" height="3" rx="0.6" />
      <path d="M6.5 8.2C6.5 6.7 8.9 5.5 12 5.5C15.1 5.5 17.5 6.7 17.5 8.2C17.5 9 16.9 9.6 16 9.9H8C7.1 9.6 6.5 9 6.5 8.2Z" />
      <path d="M8 9.9C8 9.9 8.3 20 12 21C15.7 20 16 9.9 16 9.9Z" />
    </>
  ),
}

export default function SuitIcon({ suit, size = 16, color }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color || SUIT_COLORS[suit]}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {PATHS[suit]}
    </svg>
  )
}
