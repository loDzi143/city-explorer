import type { ReactNode } from "react"

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function Plus({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

export function Minus() {
  return (
    <Icon>
      <path d="M5 12h14" />
    </Icon>
  )
}

export function Send() {
  return (
    <Icon>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Icon>
  )
}

export function Pin({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </Icon>
  )
}

export function Cal() {
  return (
    <Icon>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </Icon>
  )
}

export function Dots() {
  return (
    <Icon>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </Icon>
  )
}

export function SidebarR() {
  return (
    <Icon>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M15 4.5v15" />
    </Icon>
  )
}

export function ChatI() {
  return (
    <Icon>
      <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12z" />
    </Icon>
  )
}

export function MapI() {
  return (
    <Icon>
      <path d="M9 18l-5 2V6l5-2 6 2 5-2v14l-5 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </Icon>
  )
}

export function Sun() {
  return (
    <Icon size={16}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  )
}

export function Moon() {
  return (
    <Icon size={16}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
    </Icon>
  )
}

export function Chev({ d = "l" }: { d?: "l" | "r" | "d" }) {
  const path = d === "l" ? "M15 6l-6 6 6 6" : d === "r" ? "M9 6l6 6-6 6" : "M6 9l6 6 6-6"
  return (
    <Icon size={16}>
      <path d={path} />
    </Icon>
  )
}

export function Edit() {
  return (
    <Icon size={16}>
      <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
    </Icon>
  )
}

export function Trash() {
  return (
    <Icon size={16}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </Icon>
  )
}

export function Cross({ size = 14 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  )
}

export function Compass({ size = 20 }: { size?: number }) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </Icon>
  )
}

export function Settings() {
  return (
    <Icon size={16}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </Icon>
  )
}
