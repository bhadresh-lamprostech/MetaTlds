import Deployments from "../scripts/deployments.json";
const { ethers } = require("ethers");
const web3Utils = require("web3-utils");
const dotenv = require('dotenv').config();


const { toBigInt } = web3Utils;

//registrar controllar address
const contractAddress = Deployments.toolkit.registrar;
const resolverAddress = Deployments.toolkit.resolver;

// for localhost
// const privateKey =
// "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// const providerUrl = "http://127.0.0.1:8545";

const identifier = Deployments.tld.identifier;

console.log(identifier)

const privateKey = process.env.PRIVATE_KEYS? process.env.PRIVATE_KEYS.split(',')[1] : [];
const providerUrl = process.env.BASE_SEPOLIA_API_KEY;

const provider = new ethers.JsonRpcProvider(providerUrl);
const wallet = new ethers.Wallet(privateKey, provider);

const domainToRegister = "bak";
const registrationDuration = 31556952; // 1 year in seconds

const sannAbi = ["function tld(uint256) view returns (string)"];

async function registerDomain() {
  const contractABI = require("../artifacts/contracts/controller/RegistrarController.sol/RegistrarController.json");

  const sannAddress = Deployments.toolkit.sann;

  const sannContract = new ethers.Contract(sannAddress, sannAbi, provider);
  const contract = new ethers.Contract(
    contractAddress,
    contractABI.abi,
    wallet
  );
  const tldName = await sannContract.tld(identifier);
  try {
    console.log(
      "Rent Price For:",
      domainToRegister + "." + tldName,
      registrationDuration
    );
    const estimatedPriceArray = await contract.rentPrice(
      toBigInt(identifier),
      domainToRegister,
      registrationDuration
    );
    console.log("Estimated Price Array:", estimatedPriceArray);

    const base = estimatedPriceArray[0];
    const premium = estimatedPriceArray[1];

    console.log("Base Price (Wei):", base.toString());
    console.log("Premium Price (Wei):", premium.toString());

    const available = await contract.available(
      toBigInt(identifier),
      domainToRegister
    );

    available === true
      ? console.log(`${domainToRegister}.${tldName} is available`, available)
      : console.log(
          `${domainToRegister}.${tldName} is Not available`,
          available
        );

    if (available) {
      console.log(
        `Submitting registration transaction for ${domainToRegister}.${tldName}`
      );


      // const registrationTx = await contract.bulkRegister(
      //   toBigInt(identifier),
      //   [domainToRegister],
      //   wallet.address,
      //   registrationDuration,
      //   resolverAddress,
      //   true,
      //   ["0x"],
      //   {
      //     value: base + premium,
      //     gasLimit: 100000, // Manually set a higher gas limit
      //   }
      // );

    //   const receipt = await registrationTx.wait();
    //   console.log(
    //     `Registration successful. for ${domainToRegister}.${tldName} Transaction hash:`,
    //     receipt.hash
    //   );
    // } else {
    //   console.log(
    //     `${domainToRegister}.${tldName} is not available for registration.`
    //   );
    }
  } catch (error) {
    console.error("Error registering domain:", error);
  }
}

registerDomain();
