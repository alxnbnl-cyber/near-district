/** The game icon set (placeholders until dedicated host assets arrive). */
export type GameIconName = "explore" | "profile" | "earn" | "host" | "play" | "company" | "decrypt" | "approval";

export function GameIcon({ name, size = 48, className = "" }: { name: GameIconName; size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/assets/ui/icon-${name}.webp`} alt="" width={size} height={size} draggable={false} className={`shrink-0 select-none ${className}`} style={{ width: size, height: size }} />
  );
}
