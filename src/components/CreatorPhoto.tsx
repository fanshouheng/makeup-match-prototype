import type { CreatorProfile } from "../domain/creator";

export function CreatorPhoto({ creator }: { creator: CreatorProfile }) {
  return <img src={creator.referencePhotoUrl} alt={`${creator.name}的参考照`} />;
}
