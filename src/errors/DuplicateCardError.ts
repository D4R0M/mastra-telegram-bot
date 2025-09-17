export interface DuplicateCardDetails {
  id: string;
  front: string;
  back: string;
  tags: string[];
  example?: string | null;
}

export class DuplicateCardError extends Error {
  constructor(
    public readonly ownerId: string,
    public readonly contentHash: string,
    public readonly existingCard?: DuplicateCardDetails,
  ) {
    super("Duplicate card");
    this.name = "DuplicateCardError";
  }
}
