// scripts/deploy.ts

import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { toBigInt, sha3, utf8ToBytes } from "web3-utils";
import { Interface, Wallet, keccak256 } from "ethers";
import fs from "fs";
import path from "path";
import Deployments from "../scripts/deployments.json";

const CHAIN_ID = 31337;
const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const DEPLOYMENTS_FILE = path.join(__dirname, "deployments.json");
const privateKey =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const providerUrl = "http://127.0.0.1:8545/";

const provider = new ethers.JsonRpcProvider(providerUrl);
const wallet = new ethers.Wallet(privateKey, provider);

async function main() {
  const [platformAdmin, platformFeeCollector, tldOwner] =
    await ethers.getSigners();

  console.log("Deploying toolkit...");
  const toolkit = await deployToolkit(
    platformAdmin,
    platformFeeCollector,
    toBigInt("1000000000000000000"),
    1000
  ); // Example fee rate and minPlatformFee
  console.log("Toolkit deployed.");

  console.log("Registering TLD...");
  const tldName = "jbw";
  const preRegiDetails = await registerTLD(
    toolkit.sann,
    toolkit.registry,
    toolkit.tldFactory,
    toolkit.ethStaking,
    tldName,
    tldOwner,
    platformAdmin,
    toolkit.registrar
    // toolkit.preRegistrationCreator
  );
  console.log("TLD registered successfully.");
  console.log("Deployment and TLD registration completed successfully.");
  console.log("Toolkit:", toolkit);
  console.log("TLD Registration Details:", preRegiDetails);

  // Save deployment details
  const deployments = {
    toolkit: {
      registry: await toolkit.registry.getAddress(),
      sann: await toolkit.sann.getAddress(),
      registrar: await toolkit.registrar.getAddress(),
      usdOracle: await toolkit.usdOracle.getAddress(),
      platformConfig: await toolkit.platformConfig.getAddress(),
      priceOracle: await toolkit.priceOracle.getAddress(),
      prepaidPlatformFee: await toolkit.prepaidPlatformFee.getAddress(),
      giftCardBase: await toolkit.giftCardBase.getAddress(),
      giftCardVoucher: await toolkit.giftCardVoucher.getAddress(),
      giftCardLedger: await toolkit.giftCardLedger.getAddress(),
      giftCardController: await toolkit.giftCardController.getAddress(),
      referralHub: await toolkit.referralHub.getAddress(),
      baseCreator: await toolkit.baseCreator.getAddress(),
      preRegistrationCreator: await toolkit.preRegistrationCreator.getAddress(),
      tldFactory: await toolkit.tldFactory.getAddress(),
      resolver: await toolkit.resolver.getAddress(),
      reverseRegistrar: await toolkit.reverseRegistrar.getAddress(),
      ethStaking: await toolkit.ethStaking.getAddress()
    },
    tld: {
      identifier: preRegiDetails.identifier.toString(),
      tldBase: await preRegiDetails.tldBase.getAddress(),
      referralComissions: preRegiDetails.referralComissions,
      publicRegistrationStartTime: preRegiDetails.publicRegistrationStartTime,
    },
  };

  saveDeployments(deployments);
}

function saveDeployments(deployments: any) {
  fs.writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(deployments, null, 2));
}

async function deployToolkit(
  platformAdmin: any,
  platformFeeCollector: any,
  minPlatformFee: bigint,
  feeRate: number
) {
  console.log("Deploying USD Oracle...");
  const usdOracleFactory = await ethers.getContractFactory("DummyOracle");
  const usdOracle = await usdOracleFactory.deploy(toBigInt("150000000000"));
  await usdOracle.waitForDeployment();
  console.log(`USD Oracle deployed at: ${await usdOracle.getAddress()}`);

  const signer = await ethers.getSigners();

  console.log("Deploying SidRegistry...");
  const registryFactory = await ethers.getContractFactory("SidRegistry");
  const registry = await registryFactory.deploy(signer[0].address);
  await registry.waitForDeployment();
  console.log(`SidRegistry deployed at: ${await registry.getAddress()}`);

  console.log("Deploying SANN implementation...");
  const sannImplFactory = await ethers.getContractFactory("SANN");
  const sannImpl = await sannImplFactory.deploy();
  await sannImpl.waitForDeployment();
  console.log(
    `SANN implementation deployed at: ${await sannImpl.getAddress()}`
  );

  let data = getInitializerData(
    sannImpl.interface,
    [registry.target, platformAdmin.address],
    "initialize"
  );
  console.log("Deploying SANN proxy...");
  const sannProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
  const sannProxy = await sannProxyFactory.deploy(
    platformAdmin.address,
    keccak256(utf8ToBytes("SannProxy"))
  );
  await sannProxy.waitForDeployment();
  console.log(`SANN proxy deployed at: ${await sannProxy.getAddress()}`);
  await sannProxy.connect(platformAdmin).initialize(sannImpl.target, data);

  const sann = await ethers.getContractAt("SANN", await sannProxy.getAddress());

  console.log("Deploying PlatformConfig...");
  const platformConfigFactory =
    await ethers.getContractFactory("PlatformConfig");
  const platformConfig = await platformConfigFactory.deploy(
    await sann.getAddress()
  );
  await platformConfig.waitForDeployment();
  await platformConfig
    .connect(platformAdmin)
    .initialize(minPlatformFee, feeRate, platformFeeCollector.address);
  console.log(
    `PlatformConfig deployed at: ${await platformConfig.getAddress()}`
  );

  console.log("Deploying PriceOracle...");
  const priceOracleFactory = await ethers.getContractFactory("PriceOracle");
  const priceOracle = await priceOracleFactory.deploy(await sann.getAddress());
  await priceOracle.waitForDeployment();
  await priceOracle.connect(platformAdmin).initialize(
    await usdOracle.getAddress(),
    "100000000000000000000000000", // start premium
    21 // total days
  );
  console.log(`PriceOracle deployed at: ${await priceOracle.getAddress()}`);

  console.log("Deploying PrepaidPlatformFee...");
  const prepaidPlatformFeeFactory =
    await ethers.getContractFactory("PrepaidPlatformFee");
  const prepaidPlatformFee = await prepaidPlatformFeeFactory.deploy(
    await sann.getAddress(),
    await platformConfig.getAddress(),
    await priceOracle.getAddress()
  );
  await prepaidPlatformFee.waitForDeployment();
  console.log(
    `PrepaidPlatformFee deployed at: ${await prepaidPlatformFee.getAddress()}`
  );

  console.log("Deploying ReverseRegistrar...");
  const reverseRegistrarFactory =
    await ethers.getContractFactory("ReverseRegistrar");
  const reverseRegistrar = await reverseRegistrarFactory.deploy(
    platformAdmin.address
  );
  await reverseRegistrar.waitForDeployment();
  await reverseRegistrar
    .connect(platformAdmin)
    .initialize(await registry.getAddress());
  console.log(
    `ReverseRegistrar deployed at: ${await reverseRegistrar.getAddress()}`
  );

  console.log("Deploying RegistrarController implementation...");
  const controllerImplFactory = await ethers.getContractFactory(
    "RegistrarController"
  );
  const controllerImpl = await controllerImplFactory.deploy();
  await controllerImpl.waitForDeployment();
  console.log(
    `RegistrarController implementation deployed at: ${await controllerImpl.getAddress()}`
  );

  data = getInitializerData(
    controllerImpl.interface,
    [
      await sann.getAddress(),
      await platformConfig.getAddress(),
      await prepaidPlatformFee.getAddress(),
      await priceOracle.getAddress(),
      await reverseRegistrar.getAddress(),
    ],
    "initialize"
  );

  console.log("Deploying RegistrarController proxy...");
  const controllerProxyFactory =
    await ethers.getContractFactory("ERC1967Proxy");
  const controllerProxy = await controllerProxyFactory.deploy(
    platformAdmin.address,
    keccak256(utf8ToBytes("ControllerProxy"))
  );
  await controllerProxy.waitForDeployment();
  await controllerProxy
    .connect(platformAdmin)
    .initialize(controllerImpl.target, data);
  console.log(
    `RegistrarController proxy deployed at: ${await controllerProxy.getAddress()}`
  );

  const registrar = await ethers.getContractAt(
    "RegistrarController",
    await controllerProxy.getAddress()
  );

  console.log("Deploying GiftCardBase...");
  const giftCardBaseFactory = await ethers.getContractFactory("GiftCardBase");
  const giftCardBase = await giftCardBaseFactory.deploy(
    await sann.getAddress()
  );
  await giftCardBase.waitForDeployment();
  console.log(`GiftCardBase deployed at: ${await giftCardBase.getAddress()}`);

  console.log("Deploying GiftCardVoucher...");
  const giftCardVoucherFactory =
    await ethers.getContractFactory("GiftCardVoucher");
  const giftCardVoucher = await giftCardVoucherFactory.deploy(
    await sann.getAddress()
  );
  await giftCardVoucher.waitForDeployment();
  console.log(
    `GiftCardVoucher deployed at: ${await giftCardVoucher.getAddress()}`
  );

  console.log("Deploying GiftCardLedger...");
  const giftCardLedgerFactory =
    await ethers.getContractFactory("GiftCardLedger");
  const giftCardLedger = await giftCardLedgerFactory.deploy(
    await sann.getAddress()
  );
  await giftCardLedger.waitForDeployment();
  console.log(
    `GiftCardLedger deployed at: ${await giftCardLedger.getAddress()}`
  );

  console.log("Deploying GiftCardController...");
  const giftCardControllerFactory =
    await ethers.getContractFactory("GiftCardController");
  const giftCardController = await giftCardControllerFactory.deploy(
    await sann.getAddress(),
    await giftCardBase.getAddress(),
    await giftCardVoucher.getAddress(),
    await giftCardLedger.getAddress(),
    await priceOracle.getAddress(),
    await platformConfig.getAddress(),
    await prepaidPlatformFee.getAddress()
  );
  await giftCardController.waitForDeployment();
  console.log(
    `GiftCardController deployed at: ${await giftCardController.getAddress()}`
  );

  await giftCardLedger
    .connect(platformAdmin)
    .addController(await giftCardController.getAddress());
  await giftCardBase
    .connect(platformAdmin)
    .addController(await giftCardController.getAddress());

  console.log("Deploying ReferralHub...");
  const referralHubFactory = await ethers.getContractFactory("ReferralHub");
  const referralHub = await referralHubFactory.deploy(await sann.getAddress());
  await referralHub.waitForDeployment();
  await referralHub
    .connect(platformAdmin)
    .initialize(await priceOracle.getAddress());
  console.log(`ReferralHub deployed at: ${await referralHub.getAddress()}`);

  console.log("Deploying BaseCreator...");
  const baseCreatorFactory = await ethers.getContractFactory("BaseCreator");
  const baseCreator = await baseCreatorFactory.deploy(await sann.getAddress());
  await baseCreator.waitForDeployment();
  console.log(`BaseCreator deployed at: ${await baseCreator.getAddress()}`);

  console.log("Deploying PreRegistrationCreator...");
  const preRegistrationCreatorFactory = await ethers.getContractFactory(
    "PreRegistrationCreator"
  );
  const preRegistrationCreator = await preRegistrationCreatorFactory.deploy(
    await sann.getAddress()
  );
  await preRegistrationCreator.waitForDeployment();
  console.log(
    `PreRegistrationCreator deployed at: ${await preRegistrationCreator.getAddress()}`
  );

  console.log("Deploying ETHStaking...");
  const ethStakingFactory = await ethers.getContractFactory(
    "EthStaking"
  );
  const ethStaking = await ethStakingFactory.deploy();
  await ethStaking.waitForDeployment();
  console.log(
    `ETHStaking deployed at: ${await ethStaking.getAddress()}`
  );


  console.log("Deploying PublicResolver...");
  const resolverFactory = await ethers.getContractFactory("PublicResolver");
  const resolver = await resolverFactory.deploy(platformAdmin.address);
  await resolver.waitForDeployment();
  await resolver
    .connect(platformAdmin)
    .initialize(
      await registry.getAddress(),
      await registrar.getAddress(),
      CHAIN_ID
    );
  await resolver
    .connect(platformAdmin)
    .setNewTrustedController(await reverseRegistrar.getAddress());
  console.log(`PublicResolver deployed at: ${await resolver.getAddress()}`);

  console.log("Deploying TldFactory...");
  const tldFactoryFactory = await ethers.getContractFactory("TldFactory");
  const tldFactory = await tldFactoryFactory.deploy(await sann.getAddress());
  await tldFactory.waitForDeployment();
  await tldFactory
    .connect(platformAdmin)
    .initialize(
      await baseCreator.getAddress(),
      await registrar.getAddress(),
      await platformConfig.getAddress(),
      await priceOracle.getAddress(),
      await giftCardVoucher.getAddress(),
      await giftCardLedger.getAddress(),
      await referralHub.getAddress(),
      await preRegistrationCreator.getAddress(),
      await prepaidPlatformFee.getAddress()
    );
  console.log(`TldFactory deployed at: ${await tldFactory.getAddress()}`);

  await sann
    .connect(platformAdmin)
    .setTldFactory(await tldFactory.getAddress());
  await sann
    .connect(platformAdmin)
    .setTldController(await registrar.getAddress());

  await registry.setOwner(ZERO_HASH, platformAdmin.address);
  await registry
    .connect(platformAdmin)
    .setSubnodeOwner(ZERO_HASH, sha3("reverse"), platformAdmin.address);
  await registry
    .connect(platformAdmin)
    .setSubnodeOwner(
      ethers.namehash("reverse"),
      sha3("addr"),
      await reverseRegistrar.getAddress()
    );
  await reverseRegistrar
    .connect(platformAdmin)
    .setDefaultResolver(await resolver.getAddress());
  await registry
    .connect(platformAdmin)
    .setOwner(ethers.namehash("reverse"), await sann.getAddress());
  await registry
    .connect(platformAdmin)
    .setOwner(ZERO_HASH, await sann.getAddress());
  await reverseRegistrar
    .connect(platformAdmin)
    .setController(await registrar.getAddress(), true);

  return {
    registry,
    sann,
    registrar,
    usdOracle,
    platformConfig,
    priceOracle,
    prepaidPlatformFee,
    giftCardBase,
    giftCardVoucher,
    giftCardLedger,
    giftCardController,
    referralHub,
    baseCreator,
    preRegistrationCreator,
    tldFactory,
    resolver,
    reverseRegistrar,
    ethStaking,
  };
}

function getInitializerData(
  contractInterface: Interface,
  args: unknown[],
  initializer: string | false = "initialize"
): string {
  if (initializer === false) {
    return "0x";
  }

  const fragment = contractInterface.getFunction(initializer);
  if (!fragment) {
    return "0x";
  }

  return contractInterface.encodeFunctionData(fragment, args);
}

async function registerTLD(
  sann: any,
  registry: any,
  tldFactory: any,
  ethStaking: any,
  tld: string,
  tldOwner: any,
  platformAdmin: any,
  registrar: any,
) {

  const identifier = calIdentifier(CHAIN_ID, tldOwner.address, tld);
  const now = await time.latest();

  const stakeTx = await ethStaking.connect(wallet).stake(identifier, {
    value: ethers.parseEther("1"),
    gasLimit: 300000,
  });

  await stakeTx.wait();
  await stakeTx.wait();

  // Verify staking details
  const stakeDetails = await ethStaking.getStakeDetails();
  const stakedIdentifier = stakeDetails[1];
  const stakedAmount = stakeDetails[2];

  console.log("Staked Amount (Wei):", stakedAmount.toString());
  console.log("Staked Identifier:", stakedIdentifier.toString());

 
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

  if (stakedAmount >= ethers.parseEther("1") && stakedIdentifier == identifier) {
    console.log("Staking successful and verified.");
    const tx = await tldFactory
      .connect(wallet.address)
      .createDomainService(tld, tldOwner.address, initData);
    const receipt = await tx.wait();
  
    const tldBaseAddr = await sann.tldBase(identifier);
    var tldBase = await ethers.getContractAt("Base", tldBaseAddr);
  
    console.log(identifier);
    return {
      identifier,
      tldBase,
      referralComissions,
      publicRegistrationStartTime,
    };
  } else {
    console.log("Staking verification failed.");
  }

}


function calIdentifier(chainId: number, owner: string, tld: string): bigint {
  const hash = ethers.solidityPackedKeccak256(
    ["address", "string"],
    [owner, tld]
  );
  return (
    (toBigInt(chainId) << toBigInt(224)) + (toBigInt(hash) >> toBigInt(32))
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
