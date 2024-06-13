import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, sha3} from "web3-utils";
import {
    calIdentifier,
    deployToolkit,
    registerTLD,
    encodeHookExtraData,
} from "../test-utils/tld";

describe("ReferralHub test", function () {
    const CHAIN_ID = 56;
    const TLD = "ttt";
    const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
    let identifier;
    const MIN_PLATFORM_FEE = toBigInt(5 * 1e17); // 0.5 USD
    const PLATFORM_FEE_RATIO = 1500; // 15% = 1500 / 10000
    const ONE_DAY_DURATION = 86400;
    const ONE_YEAR_DURATION = ONE_DAY_DURATION * 365;
    const ONE_MONTH_DURATION = ONE_DAY_DURATION * 30;
    let referralComissions;

    async function deployFixture() {
        const [
            owner,
            platformAdmin,
            platformFeeCollector,
            factory,
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
            tldFactory,
            preRegistrationCreator,
            referralHub,
            priceOracle,
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
        const base = ret.tldBase;
        referralComissions = ret.referralComissions;

        return {
            sann,
            owner,
            platformAdmin,
            registry,
            referralHub,
            registrar,
            tldOwner,
            base,
            priceOracle,
            addr1,
            addr2,
            addr3,
            addr4,
            addr5,
        };
    }

    it("should allow tldOwner to set commission chart", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            addr1,
            addr2,
        } = await loadFixture(deployFixture);

        // initial config
        /*
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
        */

        let minimumCount = 11;
        let referrerRate = 11;
        let refereeRate = 6;

        // revered since invalid level
        await expect(
            referralHub.connect(tldOwner).setComissionChart(
                identifier,
                0, // invalid level
                minimumCount,
                referrerRate,
                refereeRate
            )
        ).to.be.revertedWith("Invalid level");

        // revered since not tldOwner
        await expect(
            referralHub
                .connect(addr1)
                .setComissionChart(
                    identifier,
                    1,
                    minimumCount,
                    referrerRate,
                    refereeRate
                )
        ).to.be.revertedWith("Ownable: caller is not the tld owner");

        const oldlevelInfo = await referralHub.comissionCharts(identifier, 1);
        expect(oldlevelInfo.minimumReferralCount).to.be.equal(1);
        expect(oldlevelInfo.referrerRate).to.be.equal(10);
        expect(oldlevelInfo.refereeRate).to.be.equal(5);

        await referralHub
            .connect(tldOwner)
            .setComissionChart(
                identifier,
                1,
                minimumCount,
                referrerRate,
                refereeRate
            );

        const newlevelInfo = await referralHub.comissionCharts(identifier, 1);
        expect(newlevelInfo.minimumReferralCount).to.be.equal(minimumCount);
        expect(newlevelInfo.referrerRate).to.be.equal(referrerRate);
        expect(newlevelInfo.refereeRate).to.be.equal(refereeRate);
    });

    it("should reward right", async function () {
        const {
            sann,
            owner,
            platformAdmin,
            referralHub,
            tldOwner,
            base,
            registrar,
            priceOracle,
            addr1,
            addr2,
            addr3,
            addr4,
            addr5,
        } = await loadFixture(deployFixture);

        let ret = await registrar.rentPrice(
            identifier,
            "1234",
            ONE_MONTH_DURATION
        );
        const oneMonthPriceInWEI = ret.base + ret.premium;
        const oneMonthCostInUSD = await priceOracle.weiToAttoUSD(
            oneMonthPriceInWEI
        );

        ret = await registrar.rentPrice(identifier, "1234", ONE_YEAR_DURATION);
        const oneYearPriceInWEI = ret.base + ret.premium;
        const oneYearCostInUSD = await priceOracle.weiToAttoUSD(
            oneYearPriceInWEI
        );

        ret = await registrar.rentPrice(identifier, "1234", ONE_DAY_DURATION);
        const oneDayPriceInWEI = ret.base + ret.premium;
        const oneDayCostInUSD = await priceOracle.weiToAttoUSD(
            oneDayPriceInWEI
        );

        // reverts call from non-controller
        await expect(
            referralHub.connect(addr5).reward(
                identifier,
                "1234",
                addr2,
                ONE_YEAR_DURATION,
                oneYearCostInUSD,
                oneYearCostInUSD, // revenue is equal to the cost since no platform fee will be charged in this case
                0, // platformFee not used
                "0x",
                {
                    value: toBigInt(1e17),
                }
            )
        ).to.be.revertedWith("Accessible: caller is not the tld controller");

        // set addr5 as controller
        await sann.connect(platformAdmin).setTldController(addr5);
        const controller = addr5;

        const referrer = addr1;
        const referee = addr2;
        /*
        const abi = ethers.AbiCoder.defaultAbiCoder();
        const referralInfo = {
            referrerAddress: referrer.address,
        };
        const extraData = abi.encode(
            ["(address referrerAddress)"],
            [Object.values(referralInfo)]
        );
        */
        const extraData = encodeHookExtraData(referrer.address, false);

        let referrerRewardBalance = toBigInt(0);
        let refereeRewardBalance = toBigInt(0);
        let newReferrerReward = toBigInt(0);
        let newRefereeReward = toBigInt(0);
        let balanceChanged = toBigInt(0);

        // 1. registeration
        // level: from 0 to 1
        // referralCount: + 1
        // balance changed: 0
        newReferrerReward = toBigInt(0);
        newRefereeReward = toBigInt(0);
        referrerRewardBalance += newReferrerReward;
        refereeRewardBalance += newRefereeReward;
        balanceChanged = toBigInt(0);

        await expect(
            referralHub
                .connect(controller)
                .reward(
                    identifier,
                    "1231",
                    referee,
                    ONE_YEAR_DURATION,
                    oneYearCostInUSD,
                    oneYearCostInUSD,
                    0,
                    extraData,
                    {value: toBigInt(1e17)}
                )
        ).to.changeEtherBalance(controller, balanceChanged);

        expect(await referralHub.referralBalance(referrer)).to.be.equal(
            referrerRewardBalance
        );
        expect(await referralHub.referralBalance(referee)).to.be.equal(
            refereeRewardBalance
        );

        let referralDetail = await referralHub.getReferralDetails(
            identifier,
            referrer
        );
        // up to level 1
        expect(referralDetail[0]).to.be.equal(1); // referralCount
        expect(referralDetail[1]).to.be.equal(1); // level
        expect(referralDetail[2]).to.be.equal(
            referralComissions[0].referrerRate
        ); // referrerRate
        expect(referralDetail[3]).to.be.equal(
            referralComissions[0].refereeRate
        ); // refereeRate

        // 2. registeration
        // level: 1
        // referralCount: + 1
        newReferrerReward =
            (toBigInt(referralComissions[0].referrerRate) * oneYearPriceInWEI) /
            toBigInt(100);
        newRefereeReward =
            (toBigInt(referralComissions[0].refereeRate) * oneYearPriceInWEI) /
            toBigInt(100);
        referrerRewardBalance += newReferrerReward;
        refereeRewardBalance += newRefereeReward;
        balanceChanged = (newReferrerReward + newRefereeReward) * toBigInt(-1);
        await expect(
            referralHub
                .connect(controller)
                .reward(
                    identifier,
                    "1232",
                    addr2.address,
                    ONE_YEAR_DURATION,
                    oneYearCostInUSD,
                    oneYearCostInUSD,
                    0,
                    extraData,
                    {value: toBigInt(1e17)}
                )
        ).to.changeEtherBalance(controller, balanceChanged);

        // check reward balance change
        expect(await referralHub.referralBalance(referrer)).to.be.equal(
            referrerRewardBalance
        );
        expect(await referralHub.referralBalance(referee)).to.be.equal(
            refereeRewardBalance
        );

        // check referral detail
        referralDetail = await referralHub.getReferralDetails(
            identifier,
            referrer
        );
        // still in level 1
        expect(referralDetail[0]).to.be.equal(2); // referralCount
        expect(referralDetail[1]).to.be.equal(1); // level
        expect(referralDetail[2]).to.be.equal(
            referralComissions[0].referrerRate
        ); // referrerRate
        expect(referralDetail[3]).to.be.equal(
            referralComissions[0].refereeRate
        ); // refereeRate

        // 3. registeration
        // level: from 1 to 2
        // referralCount: + 1
        newReferrerReward =
            (toBigInt(referralComissions[0].referrerRate) * oneYearPriceInWEI) /
            toBigInt(100);
        newRefereeReward =
            (toBigInt(referralComissions[0].refereeRate) * oneYearPriceInWEI) /
            toBigInt(100);
        referrerRewardBalance += newReferrerReward;
        refereeRewardBalance += newRefereeReward;
        balanceChanged = (newReferrerReward + newRefereeReward) * toBigInt(-1);
        await expect(
            referralHub
                .connect(controller)
                .reward(
                    identifier,
                    "1233",
                    referee,
                    ONE_YEAR_DURATION,
                    oneYearCostInUSD,
                    oneYearCostInUSD,
                    0,
                    extraData,
                    {value: toBigInt(1e17)}
                )
        ).to.changeEtherBalance(controller, balanceChanged);

        // check reward balance change
        expect(await referralHub.referralBalance(referrer)).to.be.equal(
            referrerRewardBalance
        );
        expect(await referralHub.referralBalance(referee)).to.be.equal(
            refereeRewardBalance
        );

        // check referral detail
        referralDetail = await referralHub.getReferralDetails(
            identifier,
            referrer
        );
        // level 2
        expect(referralDetail[0]).to.be.equal(3); // referralCount
        expect(referralDetail[1]).to.be.equal(2); // level
        expect(referralDetail[2]).to.be.equal(
            referralComissions[1].referrerRate
        ); // referrerRate
        expect(referralDetail[3]).to.be.equal(
            referralComissions[1].refereeRate
        ); // refereeRate

        // 4. registeration
        // level: 2
        // referralCount: + 1
        newReferrerReward =
            (toBigInt(referralComissions[1].referrerRate) * oneYearPriceInWEI) /
            toBigInt(100);
        newRefereeReward =
            (toBigInt(referralComissions[1].refereeRate) * oneYearPriceInWEI) /
            toBigInt(100);
        referrerRewardBalance += newReferrerReward;
        refereeRewardBalance += newRefereeReward;
        balanceChanged = (newReferrerReward + newRefereeReward) * toBigInt(-1);
        await expect(
            referralHub
                .connect(controller)
                .reward(
                    identifier,
                    "1234",
                    referee,
                    ONE_YEAR_DURATION,
                    oneYearCostInUSD,
                    oneYearCostInUSD,
                    0,
                    extraData,
                    {value: toBigInt(1e17)}
                )
        ).to.changeEtherBalance(controller, balanceChanged);

        // check reward balance change
        expect(await referralHub.referralBalance(referrer)).to.be.equal(
            referrerRewardBalance
        );
        expect(await referralHub.referralBalance(referee)).to.be.equal(
            refereeRewardBalance
        );

        // check referral detail
        referralDetail = await referralHub.getReferralDetails(
            identifier,
            referrer
        );
        // level 2
        expect(referralDetail[0]).to.be.equal(4); // referralCount
        expect(referralDetail[1]).to.be.equal(2); // level
        expect(referralDetail[2]).to.be.equal(
            referralComissions[1].referrerRate
        ); // referrerRate
        expect(referralDetail[3]).to.be.equal(
            referralComissions[1].refereeRate
        ); // refereeRate

        // withdraw
        await expect(
            referralHub.connect(referrer).withdraw()
        ).to.changeEtherBalance(referrer, referrerRewardBalance);
        expect(await referralHub.referralBalance(referrer)).to.be.equal(0);
        await expect(
            referralHub.connect(referee).withdraw()
        ).to.changeEtherBalance(referee, refereeRewardBalance);
        expect(await referralHub.referralBalance(referee)).to.be.equal(0);
    });
});
