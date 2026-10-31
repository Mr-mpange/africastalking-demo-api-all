const COUNTRY_RULES = [
  { prefix: '+255', currencyCode: 'TZS', minimum: 500 },
  { prefix: '+254', currencyCode: 'KES', minimum: 10 },
  { prefix: '+256', currencyCode: 'UGX', minimum: 50 },
  { prefix: '+234', currencyCode: 'NGN', minimum: 50 },
];

function getAirtimeRules(phoneNumber, requestedCurrency) {
  const normalizedPhone = String(phoneNumber || '').replace(/[\s()-]/g, '');
  const country = COUNTRY_RULES.find((rule) => normalizedPhone.startsWith(rule.prefix));
  const currencyCode = requestedCurrency || country?.currencyCode || process.env.AT_AIRTIME_CURRENCY || 'TZS';
  const matchingCurrency = COUNTRY_RULES.find((rule) => rule.currencyCode === currencyCode);

  return {
    currencyCode,
    minimum: matchingCurrency?.minimum || 1,
    countryCurrencyMismatch: Boolean(country && country.currencyCode !== currencyCode),
  };
}

module.exports = { getAirtimeRules };
