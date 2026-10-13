import Image from "next/image";

import { cn } from "@/lib/utils";

import bulbOnDark from "@/assets/brand/bulb-on-dark.png";
import logoOnDark from "@/assets/brand/logo-on-dark.png";
import logoOnLight from "@/assets/brand/logo-on-light.png";

type BrandLogoProps = {
  /** Background the logo sits on: the text color is inverted accordingly. */
  tone: "on-light" | "on-dark";
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ tone, className, priority }: BrandLogoProps) {
  return (
    <Image
      src={tone === "on-dark" ? logoOnDark : logoOnLight}
      alt="Lógica Assessoria Contábil"
      className={cn("h-auto w-36", className)}
      priority={priority}
    />
  );
}

/** The light-bulb mark alone, for compact spaces such as the collapsed sidebar. */
export function BrandMark({ className }: { className?: string }) {
  return <Image src={bulbOnDark} alt="Lógica Assessoria Contábil" className={cn("size-10", className)} />;
}
