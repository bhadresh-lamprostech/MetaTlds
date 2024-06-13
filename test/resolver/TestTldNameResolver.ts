import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, bytesToHex, sha3} from "web3-utils";
import {
    calIdentifier,
    deployToolkit,
    registerTLD,
    registerTLDWithoutPreRegi,
} from "../test-utils/tld";

describe("TldNameResolver test", function () {
    const CHAIN_ID = 56;
    const TLD = "ttt";
    const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
    const ZERO_HASH =
        "0x0000000000000000000000000000000000000000000000000000000000000000";
    const E16STR = "0000000000000000";
    let identifier;
    const MIN_PLATFORM_FEE = toBigInt(5 * 1e18); // 5 USD
    const PLATFORM_FEE_RATIO = 1500; // 15% = 1500 / 10000
    const MIN_REGISTRATION_DURATION = 86400 * 30;
    const ONE_YEAR_DURATION = 86400 * 365;
    let publicRegistrationStartTime;
    let preRegiConfig;
    let preRegiDiscountRateBps;

    async function deployFixture() {
        const [
            owner,
            platformAdmin,
            platformFeeCollector,
            tldOwner,
            addr1,
            addr2,
            addr3,
            addr4,
            addr5,
        ] = await ethers.getSigners();

        const {
            registry,
            sann,
            registrar,
            platformConfig,
            usdOracle,
            tldFactory,
            resolver,
            preRegistrationCreator,
            prepaidPlatformFee,
            priceOracle,
            reverseRegistrar,
        } = await deployToolkit(
            platformAdmin,
            platformFeeCollector,
            MIN_PLATFORM_FEE,
            PLATFORM_FEE_RATIO
        );

        const ret = await registerTLD(
            sann,
            registry,
            tldFactory,
            TLD,
            tldOwner,
            platformAdmin,
            registrar,
            preRegistrationCreator
        );
        identifier = ret.identifier;
        preRegiConfig = ret.preRegiConfig;
        preRegiConfig.auctionHardEndTime =
            preRegiConfig.auctionInitialEndTime + 86400;
        const auction = ret.auction;
        const preRegiState = ret.preRegistrationState;
        const tldBase = ret.tldBase;
        preRegiDiscountRateBps = ret.preRegiDiscountRateBps;

        return {
            sann,
            owner,
            platformAdmin,
            registry,
            registrar,
            tldOwner,
            resolver,
            registry,
            auction,
            preRegiState,
            prepaidPlatformFee,
            platformConfig,
            tldBase,
            priceOracle,
            platformFeeCollector,
            reverseRegistrar,
            addr1,
            addr2,
            addr3,
            addr4,
            addr5,
        };
    }

    it("should allow reverse node's owner to set tld name", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            registrar,
            prepaidPlatformFee,
            resolver,
            reverseRegistrar,
            registry,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        const node = ethers.namehash(addr1.address.slice(2) + ".addr.reverse");
        const name = "test.abc";

        // reverts since addr1 is not the reverde node's owner
        //
        //await expect(
        //    resolver
        //        .connect(addr1)
        //        ["setName(bytes32,uint256,string)"](node, identifier, name, {})
        //).to.be.reverted;
        await expect(resolver.connect(addr1).setTldName(node, identifier, name))
            .to.be.reverted;

        // make addr1 be the node's owner
        await reverseRegistrar
            .connect(addr1)
            .claimForAddr(addr1, addr1, resolver);
        //await resolver
        //    .connect(addr1)
        //    ["setName(bytes32,uint256,string)"](node, identifier, name);
        await resolver.connect(addr1).setTldName(node, identifier, name);

        expect(await resolver.tldName(node, identifier)).to.be.equal(name);
    });
});
