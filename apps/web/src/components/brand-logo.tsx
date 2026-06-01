import Link from "next/link";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { QuarksLogoMark } from "@/components/quarks-logo-mark";

export function BrandLogo({
  size = "md",
  showTagline = false,
  href = "/",
}: {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  href?: string;
}) {
  const markSize = size === "sm" ? "sm" : size === "lg" ? "lg" : "md";
  const name = size === "sm" ? "text-sm" : size === "lg" ? "text-base" : "text-base";

  const inner = (
    <>
      <QuarksLogoMark size={markSize} variant="full" />
      <span className="min-w-0">
        <span className={`block font-semibold tracking-tight text-slate-900 ${name}`}>{BRAND_NAME}</span>
        {showTagline ? (
          <span className="mt-0.5 block text-[11px] font-medium leading-snug text-green-700/90">{BRAND_TAGLINE}</span>
        ) : null}
      </span>
    </>
  );

  if (href.length === 0) {
    return <span className="inline-flex items-center gap-2.5">{inner}</span>;
  }

  return (
    <Link href={href} className="inline-flex items-center gap-2.5 transition hover:opacity-95">
      {inner}
    </Link>
  );
}
