const axios = require('axios');
require('dotenv').config();

const GRAPHQL_API = process.env.GRAPHQL_API;
const COINGECKO_API = process.env.COINGECKO_API;
const QUERY = `
query MyQuery {
  domains {
    createdAt
    labelName
    name
    labelhash
    owner {
      id
      registrations {
        cost
        expiryDate
        labelName
        registrationDate
        registrant {
          id
        }
      }
    }
    resolvedAddress {
      id
    }
    resolver {
      address
    }
    ttl
  }
}`;


// COST IS INCLUDED MANUALLY IN THE DOMAIN OBJECT
const LETTER_PRICES = [
  { letters: 3, priceWei: 20597680029427 },
  { letters: 4, priceWei: 5070198161089 },
  { letters: 5, priceWei: 158443692534 } // 5 or more letters
];

async function fetchEthPrice() {
  try {
    const response = await axios.get(COINGECKO_API);
    return response.data.ethereum.usd;
  } catch (error) {
    console.error('Error fetching ETH price:', error);
    return 2000; // Fallback to a default value if the API call fails
  }
}

function convertWeiToDollars(wei, ethPrice) {
  const WEI_TO_ETH_CONVERSION_RATE = 1e18;
  const dollars = (wei / WEI_TO_ETH_CONVERSION_RATE) * ethPrice;
  return `$${dollars.toFixed(4)}`;
}

function getPriceForDomain(domainName, ethPrice) {
  const nameLength = domainName ? domainName.split('.')[0].length : 0;
  let priceWei = LETTER_PRICES.find(({ letters }) => nameLength <= letters)?.priceWei || LETTER_PRICES[2].priceWei;
  return convertWeiToDollars(priceWei, ethPrice);
}

async function fetchData() {
  try {
    const response = await axios.post(GRAPHQL_API, { query: QUERY });
    return response.data.data.domains;
  } catch (error) {
    console.error('Error fetching data:', error);
    return [];
  }
}

function formatDate(timestamp) {
  const date = new Date(parseInt(timestamp) * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

async function processDomains(domains, ethPrice) {
  const tldList = [];
  const tldDomainMap = {};

  domains.forEach(domain => {
    const { createdAt, name, owner, resolvedAddress, resolver, ttl } = domain;
    const ownerID = owner ? owner.id : null;
    const createdAtFormatted = formatDate(createdAt);
    const cost = getPriceForDomain(name, ethPrice);

    if (!name || name.includes('reverse') || name.includes('addr')) return;

    const parts = name.split('.');
    if (parts.length === 2) {
      const tld = `.${parts[0]}`;
      if (!tldList.some(tldObj => tldObj.tld === tld)) {
        tldList.push({
          tld,
          createdAt: createdAtFormatted,
          ownerID
        });
      }
    } else if (parts.length === 3) {
      const tld = `.${parts[1]}`;
      const domainName = `${parts[0]}.${parts[1]}`;
      const domainInfo = {
        createdAt: createdAtFormatted,
        ownerID,
        registrations: owner ? owner.registrations : [],
        resolvedAddress: resolvedAddress ? resolvedAddress.id : null,
        resolver: resolver ? resolver.address : null,
        ttl,
        cost
      };
      
      if (!tldDomainMap[tld]) {
        tldDomainMap[tld] = {};
      }
      tldDomainMap[tld][domainName] = domainInfo;
    }
  });

  return { tldList, tldDomainMap };
}

async function main() {
  const ethPrice = await fetchEthPrice();
  const domains = await fetchData();
  const { tldList, tldDomainMap } = await processDomains(domains, ethPrice);

  console.log('TLDs List:', JSON.stringify(tldList, null, 2));
  console.log('TLD Domain Map:', JSON.stringify(tldDomainMap, null, 2));
}

main();
