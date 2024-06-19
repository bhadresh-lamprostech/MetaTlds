import { contract, ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { calIdentifier } from "./utils";
import Deployments from "../scripts/deployments.json";

const privateKey =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const providerUrl = "http://127.0.0.1:8545/";

const provider = new ethers.JsonRpcProvider(providerUrl);
const wallet = new ethers.Wallet(privateKey, provider);

async function main() {

    const [tldOwner] = await ethers.getSigners();
    const tldName = "eth";
    const identifier = calIdentifier(31337, wallet.address, tldName);

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
        const tldFactory = new ethers.Contract(contractAddr, contractABI, tldOwner);
        const stakeTx = await tldFactory.stake(identifier, tldName, {
        value: ethers.parseEther("1"),
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
    catch (error){
        console.log("Error staking ETH:", error);
        return false;
    }
}

async function registerTLD(
    tldOwner: any,
    identifier: any,
    tldName: string,
) { 

    // tldFactory contract Instance
    const contractABI = require("../artifacts/contracts/admin/TldFactory.sol/TldFactory.json").abi;
    const contractAddr = Deployments.toolkit.tldFactory;
    const tldFactory = new ethers.Contract(contractAddr, contractABI, tldOwner);

    // SANN contract instance
    const sannContractABI = require("../artifacts/contracts/admin/SANN.sol/SANN.json").abi;
    const sannContractAddr = Deployments.toolkit.sann;
    const sann = new ethers.Contract(sannContractAddr, sannContractABI, tldOwner);

    const now = await time.latest();
   
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
        minRegistrationDuration: 2592000,
        minRenewDuration: 2592000,
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


    const tx = await tldFactory.createDomainService(tldName, tldOwner.address, initData);
    const receipt = await tx.wait();

    console.log("TLD created...");

    const tldBaseAddr = await sann.tldBase(identifier);
    var tldBase = await ethers.getContractAt("Base", tldBaseAddr);

    console.log("Tx Receipt: ", receipt);
    return {
    identifier,
    tldBase,
    referralComissions,
    publicRegistrationStartTime,
    };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});