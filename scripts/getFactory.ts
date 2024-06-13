// Import necessary libraries
const { ethers } = require("ethers");

import Deployments from "../scripts/deployments.json";

import { toBigInt } from "web3-utils";

// Define the contract ABI
const abi = [
  "function currentTldFactory() view returns (address)",
  "function platformAdmin() view returns (address)",
  "function tldController() view returns (address)",
  "function tld(uint256) view returns (string)",
  "function tldOwner(uint256) view returns (address)",
  "function tldBase(uint256) view returns (address)",
];

// Define the contract address (replace with your contract's deployed address)
const contractAddress = Deployments.toolkit.sann;

// Define the provider (replace with your provider)
// const provider = new ethers.JsonRpcProvider(
//   "https://eth-holesky.g.alchemy.com/v2/sllQOUylaPM0F9DtUkXe1TxrZ6ueYO1P"
// );

const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545/");
// Define the contract
const contract = new ethers.Contract(contractAddress, abi, provider);

// Function to get current TLD factory, platform admin, and TLD controller
async function getContractInfo() {
  try {
    const currentTldFactory = await contract.currentTldFactory();
    const platformAdmin = await contract.platformAdmin();
    const currentTldController = await contract.tldController();

    console.log("Current TLD Factory:", currentTldFactory);
    console.log("Platform Admin:", platformAdmin);
    console.log("Current TLD Controller:", currentTldController);

    // Get TLD info by identifier (replace identifier with the actual identifier)
    const identifier = toBigInt(Deployments.tld.identifier);
    const tldName = await contract.tld(identifier);
    const tldOwner = await contract.tldOwner(identifier);
    const tldBase = await contract.tldBase(identifier);

    console.log("TLD Name:", tldName);
    console.log("TLD Owner:", tldOwner);
    console.log("TLD Base Contract:", tldBase);
  } catch (error) {
    console.error("Error fetching contract info:", error);
  }
}

// Execute the function
getContractInfo();
