import { contract, ethers } from "hardhat";
import Deployments from "../scripts/deployments.json";

const privateKey =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// const providerUrl = "https://sepolia.mode.network";
// const providerUrl = "http://127.0.0.1:8545/";

// const provider = new ethers.JsonRpcProvider(providerUrl);
// const wallet = new ethers.Wallet(privateKey, provider);

async function main(){
    const [tldOwner] = await ethers.getSigners();
    const contractABI = require("../artifacts/contracts/admin/TldFactory.sol/TldFactory.json").abi;
    const contractAddr = Deployments.toolkit.tldFactory;
    
    const tldFactory = new ethers.Contract(contractAddr, contractABI, tldOwner);
    const stakeDetails = await tldFactory.getStakeDetails();
    const stakedIdentifier = stakeDetails[1];
    const stakedAmount = stakeDetails[2];
    
    console.log("Staked Amount (Wei):", stakedAmount.toString());
    console.log("Staked Identifier:", stakedIdentifier.toString());
    
    
    
    const unstakeTx = await tldFactory.unStake();
    const receipt = await unstakeTx.wait();
    console.log(receipt);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });