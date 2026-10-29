// Donation settings. Edit these to change who receives the payment and the amounts.
// The QR code follows the NBS IPS standard used by Serbian banking apps.
window.DONATE_CONFIG = {
  name: 'Milan',                    // Recipient name shown in the bank app (N:)
  account: '170-10375144000-85',     // Bank account: bank-account-control
  paymentCode: '289',               // Šifra plaćanja (SF:)
  purpose: 'Tura za autora igre',   // Svrha plaćanja sent in the QR (S:), max 35 characters
  eurRate: 117.2,                   // RSD per 1 EUR, only for the "≈ €" hint
  tiers: [100, 200, 500],           // A coffee, a beer, two beers (RSD)
  customPlaceholder: 1500,          // Suggested amount in the "A case" field
  maxAmount: 1000000
};
