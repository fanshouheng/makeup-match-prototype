import { useEffect, useState } from "react";
import type { CreatorProfile } from "../domain/creator";

export function CreatorPhoto({ creator }: { creator: CreatorProfile }) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    const objectUrl = URL.createObjectURL(creator.referencePhoto);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [creator.referencePhoto]);

  return url ? <img src={url} alt={`${creator.name}的参考照`} /> : null;
}
