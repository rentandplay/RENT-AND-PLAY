export type ItemStatus = "AVAILABLE" | "RENTED" | "UNDER_MAINTENANCE";
export type VerificationStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "EXPIRED";
export type RentalStatus =
  | "PENDING_VERIFICATION"
  | "ACTIVE"
  | "COMPLETED"
  | "REJECTED"
  | "EXPIRED";

export interface Item {
  id: string;
  name: string;
  category: string;
  status: ItemStatus;
  qrCode: string;
}

export interface Rental {
  id: number;
  customerId: number;
  itemId: string;
  status: RentalStatus;
  rentedAt: string;
  dueDate: string;
  rentalFee: number;
  deposit: number;
  latePenalty: number;
}
