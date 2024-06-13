import {loadFixture, time} from "@nomicfoundation/hardhat-network-helpers";
import {toBigInt, toHex, hexToBytes, sha3} from "web3-utils";
import {calIdentifier, deployToolkit, registerTLD} from "../test-utils/tld";

describe("GiftCardController Contract", function () {
    const CHAIN_ID = 31337;
    const TLD = "ttt";
    const TLD2 = "tt2";
    const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
    let identifier;
    let identifier2;
    let TOKEN_ID_1 = 1;
    let TOKEN_ID_2 = 2;
    let TOKEN_ID_3 = 3;
    let TOKEN_ID_4 = 4;
    const VALUE_1 = toBigInt(1e18);
    const VALUE_2 = toBigInt(2 * 1e18);
    const MIN_PLATFORM_FEE = toBigInt(5 * 1e17); // 0.5 USD
    const PLATFORM_FEE_RATIO = 1500; // 15% = 1500 / 10000

    async function deployGiftCardControllerFixture() {
        const [
            owner,
            platformAdmin,
            platformFeeCollector,
            tldOwner,
            tldOwner2,
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
            giftCardLedger,
            giftCardVoucher,
            giftCardBase,
            giftCardController,
            prepaidPlatformFee,
        } = await deployToolkit(
            platformAdmin,
            platformFeeCollector,
            MIN_PLATFORM_FEE,
            PLATFORM_FEE_RATIO
        );

        let ret = await registerTLD(
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
        const tldBase = ret.tldBase;

        ret = await registerTLD(
            sann,
            registry,
            tldFactory,
            TLD2,
            tldOwner2,
            platformAdmin,
            registrar,
            preRegistrationCreator
        );
        identifier2 = ret.identifier;

        TOKEN_ID_1 = await giftCardVoucher
            .connect(tldOwner)
            .addCustomizedVoucher.staticCall(identifier, VALUE_1);
        TOKEN_ID_2 = await giftCardVoucher
            .connect(tldOwner)
            .addCustomizedVoucher.staticCall(identifier, VALUE_2);

        TOKEN_ID_3 = await giftCardVoucher
            .connect(tldOwner2)
            .addCustomizedVoucher.staticCall(identifier2, VALUE_1);
        TOKEN_ID_4 = await giftCardVoucher
            .connect(tldOwner2)
            .addCustomizedVoucher.staticCall(identifier2, VALUE_2);

        await giftCardVoucher
            .connect(tldOwner)
            .addCustomizedVoucher(identifier, VALUE_1);
        await giftCardVoucher
            .connect(tldOwner)
            .addCustomizedVoucher(identifier, VALUE_2);

        await giftCardVoucher
            .connect(tldOwner2)
            .addCustomizedVoucher(identifier2, VALUE_1);
        await giftCardVoucher
            .connect(tldOwner2)
            .addCustomizedVoucher(identifier2, VALUE_2);

        return {
            owner,
            platformAdmin,
            platformFeeCollector,
            tldBase,
            giftCardBase,
            sann,
            giftCardVoucher,
            giftCardLedger,
            registrar,
            giftCardController,
            preRegistrationCreator,
            prepaidPlatformFee,
            tldOwner,
            tldOwner2,
            addr1,
            addr2,
            addr3,
            addr4,
            addr5,
        };
    }

    it("should return the amount of native token", async function () {
        const {
            platformAdmin,
            giftCardBase,
            giftCardVoucher,
            giftCardLedger,
            giftCardController,
            addr1,
            addr2,
            addr3,
        } = await loadFixture(deployGiftCardControllerFixture);

        const etherAmount =
            (VALUE_1 * toBigInt(1) + VALUE_2 * toBigInt(2)) / toBigInt(1500);
        expect(
            await giftCardController.price([TOKEN_ID_1, TOKEN_ID_2], [1, 2])
        ).to.be.equal(etherAmount);
    });

    it("should allow price oracle update", async function () {
        const {
            platformAdmin,
            giftCardBase,
            giftCardVoucher,
            giftCardLedger,
            giftCardController,
            sann,
            addr1,
            addr2,
            addr3,
        } = await loadFixture(deployGiftCardControllerFixture);

        const etherAmount =
            (VALUE_1 * toBigInt(1) + VALUE_2 * toBigInt(2)) / toBigInt(1500);
        expect(
            await giftCardController.price([TOKEN_ID_1, TOKEN_ID_2], [1, 2])
        ).to.be.equal(etherAmount);

        // new oracle
        const newOracle = await ethers.deployContract("DummyOracle", [
            toBigInt("100000000000"),
        ]); // 1000 usd per ether
        await newOracle.waitForDeployment();
        // priceOracle
        const newPriceOracle = await ethers.deployContract("PriceOracle", [
            sann,
        ]);
        await newPriceOracle.waitForDeployment();
        await newPriceOracle.connect(platformAdmin).initialize(
            newOracle,
            "100000000000000000000000000", // start premium
            21 // total days
        );
        await newPriceOracle.waitForDeployment();

        await expect(
            giftCardController.setPriceOracle(newPriceOracle)
        ).to.be.revertedWith("Accessible: caller is not the platform admin");
        await giftCardController
            .connect(platformAdmin)
            .setPriceOracle(newPriceOracle);
        expect(await giftCardController.priceOracle()).be.equal(
            newPriceOracle.target
        );
    });

    it("should allow batch registeration", async function () {
        const {
            sann,
            platformAdmin,
            platformFeeCollector,
            tldBase,
            giftCardBase,
            giftCardVoucher,
            giftCardLedger,
            giftCardController,
            registrar,
            prepaidPlatformFee,
            addr1,
            addr2,
            addr3,
        } = await loadFixture(deployGiftCardControllerFixture);

        // reverts since invalid voucher id
        await expect(
            giftCardController.batchRegister([TOKEN_ID_1, 99], [1, 1], {
                value: toBigInt(1e18),
            })
        ).to.be.revertedWith("Invalid voucher id");
        // reverts since Insufficient funds
        await expect(
            giftCardController
                .connect(addr1)
                .batchRegister([TOKEN_ID_1, TOKEN_ID_2], [2, 2], {value: 1e10})
        ).to.be.revertedWith("Insufficient funds");

        // remove giftCardController
        await giftCardBase
            .connect(platformAdmin)
            .removeController(giftCardController);
        // reverts since not added as controller
        await expect(
            giftCardController
                .connect(addr1)
                .batchRegister([TOKEN_ID_1, TOKEN_ID_2], [2, 2], {
                    value: toBigInt(1e18),
                })
        ).to.be.revertedWith("Not a authorized controller");

        // add as controller
        await giftCardBase
            .connect(platformAdmin)
            .addController(giftCardController);

        // succeed
        // controller received (1*1 + 2*2) / 1500 * 85%
        const paid =
            ((toBigInt(1) * toBigInt(2) + toBigInt(2) * toBigInt(2)) *
                toBigInt(1e18)) /
            toBigInt(1500);
        const controllerBalanceDelta = (paid * toBigInt(85)) / toBigInt(100); // WEI
        const feeCollectorBalanceDelta = (paid * toBigInt(15)) / toBigInt(100); // WEI
        // check from balance
        await expect(
            giftCardController
                .connect(addr1)
                .batchRegister([TOKEN_ID_1, TOKEN_ID_2], [2, 2], {
                    value: toBigInt(1e18),
                })
        ).to.changeEtherBalance(addr1, -paid);
        // check giftCard controller balance changing
        const tldGiftCardRevenueBefore =
            await giftCardController.tldGiftCardRevenues(identifier);
        const prepaidPlatformFeeCreditBefore =
            await prepaidPlatformFee.feeCredits(identifier);
        await expect(
            giftCardController
                .connect(addr1)
                .batchRegister([TOKEN_ID_1, TOKEN_ID_2], [2, 2], {
                    value: toBigInt(1e18),
                })
        ).to.changeEtherBalance(giftCardController, controllerBalanceDelta);

        // check tld giftCard revenue
        expect(
            await giftCardController.tldGiftCardRevenues(identifier)
        ).to.be.equal(tldGiftCardRevenueBefore + controllerBalanceDelta);

        // check prepaid platfrom fee credit
        expect(await prepaidPlatformFee.feeCredits(identifier)).to.be.equal(
            prepaidPlatformFeeCreditBefore +
                (feeCollectorBalanceDelta + toBigInt(1)) * toBigInt(1500) // converts to USD
        );

        // check platform fee collector balance changing
        await expect(
            giftCardController
                .connect(addr1)
                .batchRegister([TOKEN_ID_1, TOKEN_ID_2], [2, 2], {
                    value: toBigInt(1e18),
                })
        ).to.changeEtherBalance(prepaidPlatformFee, feeCollectorBalanceDelta);
    });

    it("should withdraw own revenue by tldOwner only", async function () {
        const {
            sann,
            platformAdmin,
            platformFeeCollector,
            tldBase,
            giftCardBase,
            giftCardVoucher,
            giftCardLedger,
            giftCardController,
            registrar,
            prepaidPlatformFee,
            tldOwner,
            tldOwner2,
            addr1,
            addr2,
            addr3,
        } = await loadFixture(deployGiftCardControllerFixture);

        // succeed
        // controller received (1*1 + 2*2) / 1500 * 85%
        const paid =
            ((toBigInt(1) * toBigInt(2) + toBigInt(2) * toBigInt(2)) *
                toBigInt(1e18)) /
            toBigInt(1500);
        const controllerBalanceDelta = (paid * toBigInt(85)) / toBigInt(100); // WEI

        // register tld's giftcards
        await giftCardController
            .connect(addr1)
            .batchRegister([TOKEN_ID_1, TOKEN_ID_2], [2, 2], {
                value: toBigInt(1e18),
            });

        // register tld2's giftcards
        await giftCardController
            .connect(addr2)
            .batchRegister([TOKEN_ID_3, TOKEN_ID_4], [2, 2], {
                value: toBigInt(1e18),
            });

        // reverted since withdraw by non-tldOwner
        await expect(
            giftCardController.connect(tldOwner2).withdraw(identifier)
        ).to.be.revertedWith("Ownable: caller is not the tld owner");

        // check balance of tldOwner
        await expect(
            giftCardController.connect(tldOwner).withdraw(identifier)
        ).to.changeEtherBalance(tldOwner, controllerBalanceDelta);
        // check giftCard revenue balance for tld1
        expect(
            await giftCardController.tldGiftCardRevenues(identifier)
        ).to.be.equal(0);
        // check giftCard revenue balance for tld2
        expect(
            await giftCardController.tldGiftCardRevenues(identifier2)
        ).to.be.equal(controllerBalanceDelta);
    });

    it("should redeem identifier matched tokenIds only", async function () {
        const {
            sann,
            platformAdmin,
            platformFeeCollector,
            tldBase,
            giftCardBase,
            giftCardVoucher,
            giftCardLedger,
            giftCardController,
            registrar,
            prepaidPlatformFee,
            tldOwner,
            tldOwner2,
            addr1,
            addr2,
            addr3,
        } = await loadFixture(deployGiftCardControllerFixture);

        // register tld's giftcards
        await giftCardController
            .connect(addr1)
            .batchRegister([TOKEN_ID_1, TOKEN_ID_2], [2, 2], {
                value: toBigInt(1e18),
            });

        // register tld2's giftcards
        await giftCardController
            .connect(addr2)
            .batchRegister([TOKEN_ID_3, TOKEN_ID_4], [2, 2], {
                value: toBigInt(1e18),
            });

        await expect(
            giftCardController.batchRedeem(
                identifier,
                [TOKEN_ID_3, TOKEN_ID_4],
                [1, 1]
            )
        ).to.be.revertedWith("Identifier dosen't match tokenIds");
        await expect(
            giftCardController.batchRedeem(
                identifier,
                [TOKEN_ID_1, TOKEN_ID_3],
                [1, 1]
            )
        ).to.be.revertedWith("Must be same tld");
        await expect(
            giftCardController.batchRedeem(identifier, [], [])
        ).to.be.revertedWith("Empty tokenIds");

        giftCardController.batchRedeem(
            identifier,
            [TOKEN_ID_1, TOKEN_ID_2],
            [1, 1]
        );
        giftCardController.batchRedeem(
            identifier2,
            [TOKEN_ID_3, TOKEN_ID_4],
            [1, 1]
        );
    });
});
