const toCents = (dollars) => Math.round(Number(dollars) * 100);
const fromCents = (cents) => Math.round(cents) / 100;

module.exports = { toCents, fromCents };
