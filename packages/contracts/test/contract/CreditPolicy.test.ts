import { decideTransactionCredit } from "../../src/sponsorship/creditPolicy.js";
const request = {
  authenticatedAccountId: "account-1",
  deviceWalletOwnershipVerified: true as const,
  action: "plant" as const,
  largestAvailablePlainUtxoSatoshis: 0,
  grantedTodaySatoshis: 0,
  reservedTodaySatoshis: 0,
  remainingTreasuryBudgetSatoshis: 100000,
  unresolvedGrant: false,
};
describe("limited transaction credit", () => {
  test("funds both planting and subsequent release", () => {
    const result = decideTransactionCredit(request);
    expect(result).toEqual({ state: "eligible", grantSatoshis: 8000 });
    expect(result.grantSatoshis - 3000).toBeGreaterThanOrEqual(4000);
  });
  test("does not grant again while funds or an unresolved grant exist", () => {
    expect(
      decideTransactionCredit({
        ...request,
        largestAvailablePlainUtxoSatoshis: 8000,
      }).state,
    ).toBe("funded");
    expect(
      decideTransactionCredit({ ...request, unresolvedGrant: true }).state,
    ).toBe("pending");
  });
  test("accounts for both confirmed and reserved daily grants", () => {
    expect(
      decideTransactionCredit({
        ...request,
        grantedTodaySatoshis: 8000,
        reservedTodaySatoshis: 8000,
      }).state,
    ).toBe("daily_limit");
  });
  test("cannot exceed treasury budget", () => {
    expect(
      decideTransactionCredit({
        ...request,
        remainingTreasuryBudgetSatoshis: 7999,
      }).state,
    ).toBe("budget_exhausted");
  });
  test("release can receive a smaller fee-only grant", () => {
    expect(decideTransactionCredit({ ...request, action: "claim" })).toEqual({
      state: "eligible",
      grantSatoshis: 4000,
    });
  });
  test("requires an authenticated identity and verified device-wallet ownership", () => {
    expect(() =>
      decideTransactionCredit({ ...request, authenticatedAccountId: "" }),
    ).toThrow();
  });
});
