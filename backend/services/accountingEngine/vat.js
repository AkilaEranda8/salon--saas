'use strict';

const { money } = require('./balance');

/** Split inclusive gross into net + VAT. */
function splitInclusiveVat(gross, ratePercent) {
  const g = money(gross);
  const rate = parseFloat(ratePercent) || 0;
  if (!(g > 0) || !(rate > 0)) {
    return { gross: g, net: g, vat: 0 };
  }
  const net = money(g / (1 + rate / 100));
  const vat = money(g - net);
  return { gross: g, net, vat };
}

/** Add VAT on top of net. */
function addVat(netAmount, ratePercent) {
  const net = money(netAmount);
  const rate = parseFloat(ratePercent) || 0;
  const vat = money(net * (rate / 100));
  return { net, vat, gross: money(net + vat) };
}

module.exports = { splitInclusiveVat, addVat };
