const { ethers } = require("ethers");
import Deployments from "../scripts/deployments.json";
const reverseRegistrarABI = require("../artifacts/contracts/registrar/ReverseRegistrar.sol/ReverseRegistrar.json"); // Replace with the path to your ReverseRegistrar ABI file
const resolverABI = require("../artifacts/contracts/resolvers/Resolver.sol/Resolver.json"); // Replace with the path to your Resolver ABI file

async function resolveAddressToENSName(address) {
  // Replace with your Ethereum node provider URL
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545/");

  console.log(address);

  // Replace with the reverse registrar contract address and resolver address for the reverse resolution
  const reverseRegistrarAddress = Deployments.toolkit.reverseRegistrar;
  const resolverAddress = Deployments.toolkit.resolver;

  // Connect to the reverse registrar contract
  const reverseRegistrar = new ethers.Contract(
    reverseRegistrarAddress,
    reverseRegistrarABI.abi,
    provider
  );

  // Perform reverse resolution to get the reverse node for the address
  const reverseNode = await reverseRegistrar.node(address);

  if (reverseNode === ethers.HashZero) {
    throw new Error(`No reverse resolution found for ${address}`);
  }

  // Connect to the resolver contract
  const resolverContract = new ethers.Contract(
    resolverAddress,
    resolverABI.abi,
    provider
  );

  // Get the ENS name associated with the reverse node
  const ensName = await resolverContract.name(reverseNode);

  return ensName;
}

// Usage example
const address = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"; // Replace with the Ethereum address you want to resolve

resolveAddressToENSName(address)
  .then((ensName) => console.log(`ENS name for ${address}: ${ensName}`))
  .catch((error) => console.error(error));
