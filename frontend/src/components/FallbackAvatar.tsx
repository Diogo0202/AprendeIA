import type { CSSProperties } from "react";

export type AvatarKey = "orbit" | "spark" | "books" | "prism" | "trail";

type FallbackAvatarProps = {
  name: string;
  avatarKey?: AvatarKey;
  size?: number;
  className?: string;
};

/**
 * Mantém o perfil reconhecível sem pedir foto pessoal. O nome gera as iniciais e
 * a opção escolhida troca somente o desenho de fundo.
 */
export default function FallbackAvatar({
  name,
  avatarKey = "orbit",
  size = 38,
  className = "",
}: FallbackAvatarProps) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase("pt-BR") || "A";
  const style = { "--avatar-size": `${size}px` } as CSSProperties;

  return (
    <span
      className={`fallback-avatar fallback-avatar-${avatarKey} ${className}`.trim()}
      style={style}
      role="img"
      aria-label={`Avatar de ${name}`}
    >
      <span>{initials}</span>
    </span>
  );
}
