import Image from "next/image";

type BrandLogoProps = {
  compact?: boolean;
};

export default function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <span className={`nsutNestBrand${compact ? " compact" : ""}`} aria-label="NsutNest">
      <Image
        className="nsutNestMark"
        src="/nsutnest-logo.png"
        alt=""
        width={48}
        height={48}
        priority={!compact}
      />
      <span className="nsutNestWordmark">
        <b>Nsut<span>Nest</span></b>
        {!compact && <small>Campus portal</small>}
      </span>
    </span>
  );
}
