"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

type RefreshTokenSubmitProps = {
  className?: string;
  cooldownMs?: number;
};

export function RefreshTokenSubmit({
  className,
  cooldownMs = 5000
}: RefreshTokenSubmitProps) {
  const { pending } = useFormStatus();
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const coolingDown = lockedUntil > now;

  useEffect(() => {
    if (!coolingDown) return;
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => window.clearInterval(intervalId);
  }, [coolingDown]);

  const secondsRemaining = useMemo(() => {
    if (!coolingDown) return 0;
    return Math.max(1, Math.ceil((lockedUntil - now) / 1000));
  }, [coolingDown, lockedUntil, now]);

  const disabled = pending || coolingDown;
  const label = pending
    ? "Refreshing..."
    : coolingDown
      ? `Retry in ${secondsRemaining}s`
      : "Refresh token now";

  return (
    <button
      className={className}
      type="submit"
      disabled={disabled}
      onClick={() => {
        if (!pending && !coolingDown) {
          const ts = Date.now();
          setNow(ts);
          setLockedUntil(ts + cooldownMs);
        }
      }}
    >
      {label}
    </button>
  );
}
