import type { ReactNode, SVGProps } from "react";

/**
 * Studio icon set. 24px grid, 1.5px stroke, square caps, mitered joins,
 * `currentColor`. Decorative by default (aria-hidden); pass `title` to name one.
 * Separate from the frozen `components/icons.tsx` used by the Arcade.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { title?: string };

function Icon({ title, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function ArrowRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </Icon>
  );
}

/** External-link arrow. */
export function ArrowUpRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 17 17 7M8 7h9v9" />
    </Icon>
  );
}

export function ArrowDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v15M6 13l6 6 6-6" />
    </Icon>
  );
}

export function Play(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5v14l11-7z" />
    </Icon>
  );
}

export function Pause(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5v14M16 5v14" />
    </Icon>
  );
}

/** The studio monogram: a body, a tilted orbit, and a dot at aphelion. */
export function OrbitMark(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3.5" />
      <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-25 12 12)" />
      <circle cx="21.06" cy="7.77" r="1.4" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function Close(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function Player(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6" />
    </Icon>
  );
}

export function Sound(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </Icon>
  );
}

/** Motion / animation glyph: a path with a moving point. */
export function Motion(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 17c4 0 4-10 9-10s5 10 9 10" />
      <circle cx="12" cy="7" r="1.4" fill="currentColor" stroke="none" />
    </Icon>
  );
}
