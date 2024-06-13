import {time} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, sha3} from "web3-utils";
import {Interface, keccak256, toUtf8Bytes } from "ethers";
import {ethers} from "hardhat";


const CHAIN_ID = 31337;
const ZERO_HASH =
    "0x0000000000000000000000000000000000000000000000000000000000000000";
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function calIdentifier(chainId: number, owner: string, tld: string) {
    const hash = ethers.solidityPackedKeccak256(
        ["address", "string"],
        [owner, tld]
    );
    return (
        (toBigInt(chainId) << toBigInt(224)) + (toBigInt(hash) >> toBigInt(32))
    );
}
function getInitializerData(
    contractInterface: Interface,
    args: unknown[],
    initializer?: string | false
): string {
    if (initializer === false) {
        return "0x";
    }

    const allowNoInitialization =
        initializer === undefined && args.length === 0;
    initializer = initializer ?? "initialize";

    const fragment = contractInterface.getFunction(initializer);
    if (fragment === null) {
        if (allowNoInitialization) {
            return "0x";
        } else {
            throw new Error();
        }
    } else {
        return contractInterface.encodeFunctionData(fragment, args);
    }
}

function encodeHookExtraData(referrerAddr: string, usdGiftCardPoints: boolean) {
    const abi = ethers.AbiCoder.defaultAbiCoder();
    let rewardHookExtraData = "0x";
    if (referrerAddr != "") {
        const referralInfo = {
            referrerAddress: referrerAddr,
        };
        rewardHookExtraData = abi.encode(
            ["(address referrerAddress)"],
            [Object.values(referralInfo)]
        );
    }
    const pointInfo = {
        useGiftCardPoints: usdGiftCardPoints,
    };
    const pointHookExtraData = abi.encode(
        ["(bool useGiftCardPoints)"],
        [Object.values(pointInfo)]
    );
    const hookExtraData = {
        QualificationHookExtraData: "0x",
        PriceHookExtraData: "0x",
        PointHookExtraData: pointHookExtraData,
        RewardHookExtraData: rewardHookExtraData,
    };
    const extraData = abi.encode(
        [
            "(bytes QualificationHookExtraData, bytes PriceHookExtraData, bytes PointHookExtraData, bytes RewardHookExtraData)",
        ],
        [Object.values(hookExtraData)]
    );
    return extraData;
}

async function deployToolkit(
    platformAdmin: any,
    platformFeeCollector: any,
    minPlatformFee: any,
    feeRate: any
) {
    // usd oracle
    const usdOracle = await ethers.deployContract("DummyOracle", [
        toBigInt("150000000000"),
    ]); // 1500 usd per ether
    await usdOracle.waitForDeployment();
    let signer = await ethers.getSigners();
    // registry
    const registry = await ethers.deployContract("SidRegistry", [signer[0].address]);
    await registry.waitForDeployment();

    const sannImpl = await ethers.deployContract("SANN", []);
    await sannImpl.waitForDeployment();
    let data = getInitializerData(
        sannImpl.interface,
        [registry.target, platformAdmin.address],
        "initialize"
    );
    const sannProxy = await ethers.deployContract("ERC1967Proxy", [
        platformAdmin,
        keccak256(toUtf8Bytes("SannProxy")),
    ]);
    await sannProxy.waitForDeployment();
    await sannProxy.connect(platformAdmin).initialize(sannImpl.target, data);
    let sann = await ethers.getContractAt("SANN", sannProxy.target);

    // platformConfig
    const platformConfig = await ethers.deployContract("PlatformConfig", [
        sann,
    ]);
    await platformConfig.waitForDeployment();
    await platformConfig
        .connect(platformAdmin)
        .initialize(minPlatformFee, feeRate, platformFeeCollector);

    // priceOracle
    const priceOracle = await ethers.deployContract("PriceOracle", [sann]);
    await priceOracle.waitForDeployment();
    await priceOracle.connect(platformAdmin).initialize(
        usdOracle,
        "100000000000000000000000000", // start premium
        21 // total days
    );
    //console.log("priceOracle: ", priceOracle.target);

    // prepaidPlatformFee
    const prepaidPlatformFee = await ethers.deployContract(
        "PrepaidPlatformFee",
        [sann, platformConfig, priceOracle]
    );
    await prepaidPlatformFee.waitForDeployment();

    // Reverse Registrar
    const reverseRegistrar = await ethers.deployContract("ReverseRegistrar", [
        platformAdmin.address,
    ]);
    await reverseRegistrar.waitForDeployment();
    await reverseRegistrar.connect(platformAdmin).initialize(registry.target);

    const controllerImpl = await ethers.deployContract(
        "RegistrarController",
        []
    );
    await controllerImpl.waitForDeployment();

    data = getInitializerData(
        controllerImpl.interface,
        [
            sann.target,
            platformConfig.target,
            prepaidPlatformFee.target,
            priceOracle.target,
            reverseRegistrar.target,
        ],
        "initialize"
    );

    const controllerProxy = await ethers.deployContract("ERC1967Proxy", [platformAdmin, keccak256(toUtf8Bytes("ControllerProxy"))]);
    await controllerProxy.waitForDeployment();
    await controllerProxy
        .connect(platformAdmin)
        .initialize(controllerImpl.target, data);
    let registrar = await ethers.getContractAt(
        "RegistrarController",
        controllerProxy.target
    );

    // GiftCardBase
    const giftCardBase = await ethers.deployContract("GiftCardBase", [sann]);
    await giftCardBase.waitForDeployment();

    // GiftCardVoucher
    const giftCardVoucher = await ethers.deployContract("GiftCardVoucher", [
        sann,
    ]);
    await giftCardVoucher.waitForDeployment();

    // GiftCardLedger
    const giftCardLedger = await ethers.deployContract("GiftCardLedger", [
        sann,
    ]);
    await giftCardLedger.waitForDeployment();

    // GiftCardController
    const giftCardController = await ethers.deployContract(
        "GiftCardController",
        [
            sann,
            giftCardBase,
            giftCardVoucher,
            giftCardLedger,
            priceOracle,
            platformConfig,
            prepaidPlatformFee,
        ]
    );
    await giftCardController.waitForDeployment();

    // add GiftCardController as GiftCardLedger's controller
    await giftCardLedger
        .connect(platformAdmin)
        .addController(giftCardController);
    // add GiftCardController as GiftCardBase's controller
    await giftCardBase.connect(platformAdmin).addController(giftCardController);
    // add GiftCardLedger as GiftCardBase's controller
    //await giftCardBase.connect(platformAdmin).addController(giftCardLedger);

    // ReferralHub
    const referralHub = await ethers.deployContract("ReferralHub", [sann]);
    await referralHub.waitForDeployment();
    await referralHub.connect(platformAdmin).initialize(priceOracle);

    // BaseCreator
    const baseCreator = await ethers.deployContract("BaseCreator", [sann]);
    await baseCreator.waitForDeployment();

    // PreRegistrationCreator
    const preRegistrationCreator = await ethers.deployContract(
        "PreRegistrationCreator",
        [sann]
    );
    await preRegistrationCreator.waitForDeployment();

    // Resolver
    const resolver = await ethers.deployContract("PublicResolver", [
        platformAdmin.address,
    ]);
    await resolver.waitForDeployment();
    await resolver
        .connect(platformAdmin)
        .initialize(registry, registrar, CHAIN_ID);
    await resolver
        .connect(platformAdmin)
        .setNewTrustedController(reverseRegistrar);

    // TldFactory
    const tldFactory = await ethers.deployContract("TldFactory", [sann]);
    await tldFactory.waitForDeployment();
    await tldFactory
        .connect(platformAdmin)
        .initialize(
            baseCreator,
            registrar,
            platformConfig,
            priceOracle,
            giftCardVoucher,
            giftCardLedger,
            referralHub,
            preRegistrationCreator,
            prepaidPlatformFee
        );

    // set tld factory
    await sann.connect(platformAdmin).setTldFactory(tldFactory);
    // set controller
    await sann.connect(platformAdmin).setTldController(registrar);

    // set up reverse registrar
    // tranfer ownership of ZERO_HASH from deployer to platformAdmin
    await registry.setOwner(ZERO_HASH, platformAdmin);
    await registry
        .connect(platformAdmin)
        .setSubnodeOwner(ZERO_HASH, sha3("reverse"), platformAdmin);
    await registry
        .connect(platformAdmin)
        .setSubnodeOwner(
            ethers.namehash("reverse"),
            sha3("addr"),
            reverseRegistrar
        );
    await reverseRegistrar.connect(platformAdmin).setDefaultResolver(resolver);
    await registry
        .connect(platformAdmin)
        .setOwner(ethers.namehash("reverse"), sann);
    await registry.connect(platformAdmin).setOwner(ZERO_HASH, sann);

    // add registrar as reverseRegistrar's controller
    // so we can claim reverse node in registartion
    await reverseRegistrar
        .connect(platformAdmin)
        .setController(registrar, true);

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
    };
}

async function registerTLD(
    sann: any,
    registry: any,
    tldFactory: any,
    tld: string,
    tldOwner: any,
    platformAdmin: any,
    registrar: any,
    preRegistrationCreator: any
) {
    const identifier = calIdentifier(CHAIN_ID, tldOwner.address, tld);

    const now = await time.latest();
    const preRegiConfig = {
        enableAuction: true,
        auctionStartTime: now + 600,
        auctionInitialEndTime: now + 1200, // auctionHardEndTime = auctionInitialEndTime + 86400
        auctionExtendDuration: 86400,
        auctionRetentionDuration: 86400 * 7,
        auctionMinRegistrationDuration: 86400 * 60,
        enableFcfs: true,
        fcfsStartTime: now + 86400 + 1200 + 600, // must be greater than auctionHardEndTime
        fcfsEndTime: now + 86400 + 1200 + 1200,
    };
    const referralComissions = [
        {
            minimumReferralCount: 1,
            referrerRate: 10, // 10%
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
    const publicRegistrationStartTime = now + 86400 + 3000;
    const preRegiDiscountRateBps = [0, 0, 0, 2000, 2000, 2000]; // 20% off
    const initData = {
        config: {
            minDomainLength: 3,
            maxDomainLength: 10,
            minRegistrationDuration: 2592000,
            minRenewDuration: 2592000,
            mintCap: 0,
        },
        letters: [3, 4, 5],
        prices: [
            20597680029427, // 650 USD per year
            5070198161089, // 160 USD per year
            158443692534, // 5 USD per year
        ],
        enableGiftCard: true,
        //giftCardTokenIds: [10, 11],
        giftCardTokenIds: [],
        //giftCardPrices: [toBigInt(1e18), toBigInt(5 * 1e18)],
        giftCardPrices: [],
        enableReferral: true,
        referralLevels: [1, 2],
        referralComissions: referralComissions,
        enablePreRegistration: true,
        preRegiConfig: preRegiConfig,
        preRegiDiscountRateBps: preRegiDiscountRateBps,
        publicRegistrationStartTime: publicRegistrationStartTime,
        publicRegistrationPaused: false,
        baseUri: "https://space.id/metadata",
    };
    const tx: ContractTransaction = await tldFactory
        .connect(platformAdmin)
        .createDomainService(tld, tldOwner, initData);
    const receipt: ContractReceipt = await tx.wait();

    let log1 = receipt?.logs.find(
        (log) =>
            preRegistrationCreator.interface.parseLog(log as any)?.name ===
            "PreRegistrationStateCreated"
    );
    const event1 = preRegistrationCreator.interface.parseLog(log1);
    const preRegistrationStateAddr = event1.args[0];
    let log2 = receipt?.logs.find(
        (log) =>
            preRegistrationCreator.interface.parseLog(log as any)?.name ===
            "AuctionCreated"
    );
    const event2 = preRegistrationCreator.interface.parseLog(log2);
    const auctionAddr = event2.args[0];

    const preRegistrationState = await ethers.getContractAt(
        "PreRegistrationState",
        preRegistrationStateAddr
    );
    const auction = await ethers.getContractAt("Auction", auctionAddr);

    const tldBaseAddr = await sann.tldBase(identifier);
    const tldBase = await ethers.getContractAt("Base", tldBaseAddr);

    return {
        identifier,
        tldBase,
        preRegiConfig,
        publicRegistrationStartTime,
        preRegiDiscountRateBps,
        preRegistrationState,
        referralComissions,
        auction,
    };
}

async function registerTLDWithoutPreRegi(
    sann: any,
    registry: any,
    tldFactory: any,
    tld: string,
    tldOwner: any,
    platformAdmin: any,
    registrar: any,
    preRegistrationCreator: any
) {
    const identifier = calIdentifier(CHAIN_ID, tldOwner.address, tld);

    // register TLD
    const now = await time.latest();
    const preRegiConfig = {
        enableAuction: true,
        auctionStartTime: now + 600,
        auctionInitialEndTime: now + 1200, // auctionHardEndTime = auctionInitialEndTime + 86400
        auctionExtendDuration: 86400,
        auctionRetentionDuration: 86400 * 7,
        auctionMinRegistrationDuration: 86400 * 60,
        enableFcfs: true,
        fcfsStartTime: now + 86400 + 1200 + 600, // must be greater than auctionHardEndTime
        fcfsEndTime: now + 86400 + 1200 + 1200,
    };
    const publicRegistrationStartTime = now + 3600;
    const initData = {
        config: {
            minDomainLength: 3,
            maxDomainLength: 10,
            minRegistrationDuration: 2592000,
            minRenewDuration: 2592000,
            hasMintCap: false,
            mintCap: 0,
        },
        letters: [3, 4, 5],
        prices: [
            20597680029427, // 650 USD per year
            5070198161089, // 160 USD per year
            158443692534, // 5 USD per year
        ],
        enableGiftCard: true,
        giftCardTokenIds: [],
        //giftCardPrices: [toBigInt(1e18), toBigInt(5 * 1e18)],
        giftCardPrices: [],
        enableReferral: true,
        referralLevels: [1, 2],
        referralComissions: [
            {
                minimumReferralCount: 1,
                referrerRate: 5, // 5%
                refereeRate: 5,
                isValid: true,
            },
            {
                minimumReferralCount: 2,
                referrerRate: 10,
                refereeRate: 10,
                isValid: true,
            },
        ],
        enablePreRegistration: false,
        preRegiConfig: preRegiConfig,
        preRegiDiscountRateBps: [0, 0, 2000, 2000, 2000], // 20% off
        publicRegistrationStartTime: publicRegistrationStartTime,
        publicRegistrationPaused: false,
        baseUri: "https://space.id/metadata",
    };
    await tldFactory
        .connect(platformAdmin)
        .createDomainService(tld, tldOwner, initData);

    const tldBaseAddr = await sann.tldBase(identifier);
    const tldBase = await ethers.getContractAt("Base", tldBaseAddr);

    return {
        identifier,
        tldBase,
        publicRegistrationStartTime,
    };
}

export {
    calIdentifier,
    deployToolkit,
    registerTLD,
    registerTLDWithoutPreRegi,
    encodeHookExtraData,
};
