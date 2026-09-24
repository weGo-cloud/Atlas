export type CreateCustomerInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string;
};

export type UpdateCustomerInput = Partial<CreateCustomerInput>;
