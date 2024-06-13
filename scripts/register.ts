import Deployments from "../scripts/deployments.json";
const { ethers } = require("ethers");
const web3Utils = require("web3-utils");

const { toBigInt } = web3Utils;

//registrar controllar address
const contractAddress = Deployments.toolkit.registrar;
const resolverAddress = Deployments.toolkit.resolver;
const privateKey =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const identifier = Deployments.tld.identifier;
const providerUrl = "http://127.0.0.1:8545/";

const provider = new ethers.JsonRpcProvider(providerUrl);
const wallet = new ethers.Wallet(privateKey, provider);

const domainToRegister = "jayambe";
const registrationDuration = 31556952; // 1 year in seconds

async function registerDomain() {
  const contractABI = require("../artifacts/contracts/controller/RegistrarController.sol/RegistrarController.json");
  const contract = new ethers.Contract(
    contractAddress,
    contractABI.abi,
    wallet
  );

  try {
    console.log(
      "Calling rentPrice with:",
      identifier,
      domainToRegister,
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
    console.log("Domain availability:", available);

    if (available) {
      console.log("Submitting registration transaction");
      const registrationTx = await contract.bulkRegister(
        toBigInt(identifier),
        [domainToRegister],
        wallet.address,
        registrationDuration,
        resolverAddress,
        true,
        ["0x"],
        {
          value: base + premium,
          gasLimit: 3000000, // Manually set a higher gas limit
        }
      );

      const receipt = await registrationTx.wait();
      console.log(
        "Registration successful. Transaction hash:",
        receipt.transactionHash
      );
    } else {
      console.log("Domain is not available for registration.");
    }
  } catch (error) {
    console.error("Error registering domain:", error);
  }
}

registerDomain();
