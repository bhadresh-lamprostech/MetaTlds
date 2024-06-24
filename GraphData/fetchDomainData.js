const axios = require('axios');

async function fetchData() {
  try {
    const response = await axios.post('https://api.studio.thegraph.com/query/76606/metatlds/version/latest', {
      query: `
        {
          domains(first: 1000) {
            id
            name
            labelName
            labelhash
          }
        }
      `
    });

    const domains = response.data.data.domains;

    const tldsSet = new Set();
    const tldDomainMap = {};

    domains.forEach(domain => {
      if (domain.name && !domain.name.includes('undefined') && !domain.name.includes('addr') && !domain.name.includes('reverse') && !domain.name.includes('null')) {
        const nameParts = domain.name.split('.');
        if (nameParts.length === 3) { // Ensure exactly two dots in the name field
          let tld = `.${nameParts[nameParts.length - 2]}`;
          let domainName = nameParts.slice(0, -1).join('.');
          
          if (domainName && domainName !== tld) {
              tldsSet.add(tld);
              
              if (!tldDomainMap[tld]) {
                  tldDomainMap[tld] = [];
                }
                
                // Only add the domain name without the hash suffix
                if (!domainName.match(/^\[\w+\]$/)) {
                    tldDomainMap[tld].push(domainName);
                }
            }
        }
        else if(nameParts.length === 2){
            let tld = `.${nameParts[nameParts.length - 2]}`;
            tldsSet.add(tld);
        }
    }
});

const tldsList = Array.from(tldsSet).filter(tld => tld !== '.null');
    return { tlds: tldsList, tldDomainMap };
  } catch (error) {
    console.error('Error fetching data:', error);
    return null;
  }
}

fetchData().then(data => {
  if (data) {
    console.log('TLDs List:', data.tlds);
    console.log('TLD Domain Map:', data.tldDomainMap);
  }
});
