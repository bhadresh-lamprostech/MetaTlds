import { contract, ethers, utils} from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { calIdentifier } from "./utils";
import fs from "fs";
import path from "path";
// import { getCurrentUnixTime } from "./utils"; // Assuming you have a function to get current time
import Deployments from "./deployments.json";


const dotenv = require('dotenv').config();

const DEPLOYMENTS_FILE = path.join(__dirname, "deployments.json");

const privateKey = process.env.PRIVATE_KEYS? process.env.PRIVATE_KEYS.split(',')[0] : [];
const providerUrl = process.env.BASE_SEPOLIA_API_KEY;
const CHAIN_ID = 84532; 


// for localhost
// const privateKey =
// "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// const providerUrl = "http://127.0.0.1:8545";
// const CHAIN_ID = 31337;

const provider = new ethers.JsonRpcProvider(providerUrl);
const wallet = new ethers.Wallet(privateKey, provider);

function saveDeployments(newDeployment: any) {
  const deployments = fs.existsSync(DEPLOYMENTS_FILE) ? JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, "utf8")) : {};
  fs.writeFileSync(DEPLOYMENTS_FILE, JSON.stringify({ ...deployments, ...newDeployment }, null, 2));
}

async function main() {

    const [tldOwner] = await ethers.getSigners();
    console.log(tldOwner.address);
    console.log(wallet.address);
    const tldName = "coay";
    const identifier = calIdentifier(CHAIN_ID, wallet.address, tldName);

    // STAKE ETH
    console.log("Staking ETH...");
    const ethStaked = await stakeETH(
        tldOwner,
        identifier,
        tldName
    );

    console.log("stake update: ", ethStaked);

    // TLD REGISTRATION
    if(ethStaked){
        console.log("Registering TLD...");
        const preRegiDetails = await registerTLD(
            tldOwner,
            identifier,
            tldName,
            // toolkit.preRegistrationCreator
        );
        console.log("TLD registered successfully.");
        console.log("Deployment and TLD registration completed successfully.");
        // console.log("Toolkit:", toolkit);
        console.log("TLD Registration Details:", preRegiDetails);

        const tldDetails = {
          tld: {
            identifier: preRegiDetails.identifier.toString(),
            tldBase: await preRegiDetails.tldBase.getAddress(),
            referralComissions: preRegiDetails.referralComissions,
            publicRegistrationStartTime: preRegiDetails.publicRegistrationStartTime,
          },
        }
        

        saveDeployments(tldDetails);

    }
    else{
        console.log("Please stake the require amount of ETH for Registering TLD...");
    }
}

async function stakeETH(
    tldOwner: any,
    identifier: any,
    tldName: string,
){
    try{
        const contractABI = require("../artifacts/contracts/admin/TldFactory.sol/TldFactory.json").abi;
        const contractAddr = Deployments.toolkit.tldFactory;
        var tldFactory = new ethers.Contract(contractAddr, contractABI, tldOwner);

        // const setStakeLimit = await tldFactory.setStakeLimit(ethers.parseEther("0.001"));
        // await setStakeLimit.wait();

          const stakeTx = await tldFactory.stake(identifier, tldName, {
          value: ethers.parseEther("0.001"),
          gasLimit: 300000,
          });
          const receipt = await stakeTx.wait();
          // console.log("Staking Tx Receipt", receipt);
        
          // Verify staking details
          const stakeDetails = await tldFactory.getStakeDetails();
          const stakedIdentifier = stakeDetails[1];
          const stakedAmount = stakeDetails[2];
          expect(stakedIdentifier).to.equal(identifier);
      
          console.log("Staked Amount (Wei):", stakedAmount.toString());
          console.log("Staked Identifier:", stakedIdentifier.toString());
          return true;
    }
    catch(error) {
      console.log("error staking eth:", error);
    }
}


async function registerTLD(
    tldOwner: any,
    identifier: any,
    tldName: string,
) { 
    const contractABI = require("../artifacts/contracts/admin/TldFactory.sol/TldFactory.json").abi;
    const contractAddr = Deployments.toolkit.tldFactory;
    const tldFactory = new ethers.Contract(contractAddr, contractABI, tldOwner);

    const sannContractABI = require("../artifacts/contracts/admin/SANN.sol/SANN.json").abi;
    const sannContractAddr = Deployments.toolkit.sann;
    const sann = new ethers.Contract(sannContractAddr, sannContractABI, tldOwner);

    // Get the current time using an alternative method
    const now = await getCurrentUnixTime();

    const referralComissions = [
      {
        minimumReferralCount: 1,
        referrerRate: 10,
        refereeRate: 5,
        isValid: true,
      },
      {
        minimumReferralCount: 3,
        referrerRate: 15,
        refereeRate: 10,
        isValid: true,
      },
    ];
  
    // Set the public registration start time to 2 minutes from now
    const publicRegistrationStartTime = now + 120;
  
    const initData = {
      config: {
        minDomainLength: 3,
        maxDomainLength: 10,
        minRegistrationDuration: 31556952,
        minRenewDuration: 31556952,
        mintCap: 0,
      },
      letters: [3, 4, 5],
      prices: [20597680029427, 5070198161089, 158443692534],

      enableGiftCard: true,
      giftCardTokenIds: [],
      giftCardPrices: [],
      enableReferral: true,
      referralLevels: [1, 2],
      referralComissions: referralComissions,
      enablePreRegistration: false, // Disable pre-registration
      preRegiConfig: {
        enableAuction: false,
        auctionStartTime: 0,
        auctionInitialEndTime: 0,
        auctionExtendDuration: 0,
        auctionRetentionDuration: 0,
        auctionMinRegistrationDuration: 0,
        enableFcfs: false,
        fcfsStartTime: 0,
        fcfsEndTime: 0,
      }, // Empty pre-registration configuration
      preRegiDiscountRateBps: [], // Empty pre-registration discount rates
      publicRegistrationStartTime: publicRegistrationStartTime,
      publicRegistrationPaused: false,
      baseUri: "https://space.id/metadata",
    };
    // try {
    //   const tx = await tldFactory.createDomainService(tldName, tldOwner.address, initData);
    //   var receipt = await tx.wait();
    // } catch (error) {
    //   console.error("Error creating domain service:", error);
    // }

    const tx = await tldFactory.createDomainService(tldName, tldOwner.address, initData);
    var receipt = await tx.wait();

    console.log("TLD created...");

    const tldBaseAddr = await sann.tldBase(identifier);
    const tldBase = await ethers.getContractAt("Base", tldBaseAddr);

    console.log("Tx Receipt: ", receipt);
    return {
      identifier,
      tldBase,
      referralComissions,
      publicRegistrationStartTime,
    };
}

// Utility function to get the current Unix time
async function getCurrentUnixTime(): Promise<number> {
  const block = await ethers.provider.getBlock('latest');
  return block.timestamp;
}


main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});