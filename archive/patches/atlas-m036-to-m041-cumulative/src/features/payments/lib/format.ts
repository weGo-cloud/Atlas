const formatter = new Intl.NumberFormat("en-KE");
export const formatKes = (amount: number): string => `KSh ${formatter.format(amount)}`;
