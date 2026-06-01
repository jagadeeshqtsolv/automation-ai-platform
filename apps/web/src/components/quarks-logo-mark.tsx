import Image from "next/image";
import { BRAND_LOGO_ALT, BRAND_LOGO_MARK_SRC, BRAND_LOGO_SRC } from "@/lib/brand";

const markHeight = { xs: 24, sm: 32, md: 40, lg: 44 } as const;
const fullHeight = { sm: 28, md: 32, lg: 36 } as const;
const LOGO_ASPECT = 185 / 45;

export function QuarksLogoMark({
  size = "md",
  variant = "mark",
  className = "",
}: {
  size?: keyof typeof markHeight;
  variant?: "mark" | "full";
  className?: string;
}) {
  if (variant === "full") {
    const h = fullHeight[size === "xs" ? "sm" : size === "lg" ? "lg" : "md"];
    const w = Math.round(h * LOGO_ASPECT);
    return (
      <span className={`relative inline-flex shrink-0 items-center ${className}`} style={{ height: h, width: w }}>
        <Image
          src={BRAND_LOGO_SRC}
          alt={BRAND_LOGO_ALT}
          width={w}
          height={h}
          className="h-full w-full object-contain object-left"
          priority={size === "lg"}
        />
      </span>
    );
  }

  const px = markHeight[size];
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 p-1 ring-1 ring-white/10 ${className}`}
      style={{ width: px, height: px }}
    >
      <Image
        src={BRAND_LOGO_MARK_SRC}
        alt={BRAND_LOGO_ALT}
        width={px - 8}
        height={px - 8}
        className="h-auto w-auto max-h-full max-w-full object-contain"
        priority={size === "lg"}
      />
    </span>
  );
}
