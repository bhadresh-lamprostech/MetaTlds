const { ethers } = require("ethers");
const reverseRegistrarABI = require("../artifacts/contracts/registrar/ReverseRegistrar.sol/ReverseRegistrar.json"); // Replace with the path to your ReverseRegistrar ABI file
const resolverABI = require("../artifacts/contracts/resolvers/Resolver.sol/Resolver.json"); // Replace with the path to your Resolver ABI file

async function resolveAddressToENSName(address) {
  // Replace with your Ethereum node provider URL
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545/");

  console.log(address);

  // Replace with the reverse registrar contract address and resolver address for the reverse resolution
  const reverseRegistrarAddress = "0x71d2EBF08bF4FcB82dB5ddE46677263F4c534ef3";
  const resolverAddress = "0xCd9BC6cE45194398d12e27e1333D5e1d783104dD";

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
