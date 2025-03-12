const { DOMAIN_ZONE_MAP } = require('../config');

function getZoneIdForDomain(domain) {
  if (DOMAIN_ZONE_MAP[domain]) {
    return DOMAIN_ZONE_MAP[domain];
  }
  
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parentDomain = parts.slice(i).join('.');
    if (DOMAIN_ZONE_MAP[parentDomain]) {
      return DOMAIN_ZONE_MAP[parentDomain];
    }
  }
  return null;
}

function getConfiguredDomains() {
  return Object.keys(DOMAIN_ZONE_MAP);
}

function getIpType(ip) {
  return ip.includes(':') ? 'AAAA' : 'A';
}

module.exports = {
  getZoneIdForDomain,
  getConfiguredDomains,
  getIpType
};
