import React from "react";

interface SGReportLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "full";
  variant?: "full" | "icon" | "light" | "dark" | "image";
}

export const SGReportLogo: React.FC<SGReportLogoProps> = ({
  className = "",
  size = "md",
  variant = "image",
}) => {
  const logoHeight = {
    sm: "h-8",
    md: "h-11",
    lg: "h-14",
    full: "h-14 w-full",
  }[size];

  if (variant === "icon") {
    const iconDimensions = {
      sm: "h-7 w-7",
      md: "h-9 w-9",
      lg: "h-12 w-12",
      full: "h-12 w-12",
    }[size];

    return (
      <div className={`flex items-center select-none ${className}`}>
        <img
          src="/favicon.svg?v=7"
          alt="SG Report Emblem"
          className={`${iconDimensions} object-contain`}
        />
      </div>
    );
  }

  const logoSrc = variant === "light" ? "/logo_light.png?v=6" : "/logo.png?v=6";

  return (
    <div className={`flex items-center select-none ${className}`}>
      <img
        src={logoSrc}
        alt="SG Report Logo"
        className={`${logoHeight} max-w-full object-contain transition-transform hover:scale-[1.01]`}
      />
    </div>
  );
};
