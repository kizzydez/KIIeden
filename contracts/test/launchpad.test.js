const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MemeLaunchpad", function () {
  let launchpad, owner, creator, buyer1, buyer2, buyer3, feeRecipient;
  const CREATION_FEE = ethers.parseEther("2");

  beforeEach(async function () {
    [owner, creator, buyer1, buyer2, buyer3, feeRecipient] = await ethers.getSigners();
    const MemeLaunchpad = await ethers.getContractFactory("MemeLaunchpad");
    launchpad = await MemeLaunchpad.deploy(feeRecipient.address);

    const TEN_THOUSAND = "0x" + (10000n * 10n ** 18n).toString(16);
    for (const s of [creator, buyer1, buyer2, buyer3]) {
      await ethers.provider.send("hardhat_setBalance", [s.address, TEN_THOUSAND]);
    }
  });

  async function createToken(signer = creator, maxWalletBps = 0) {
    const tx = await launchpad.connect(signer).createToken("Doge Kii", "DOGEKII", "ipfs://meta", maxWalletBps, { value: CREATION_FEE });
    const rc = await tx.wait();
    const ev = rc.logs
      .map((l) => {
        try {
          return launchpad.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e) => e && e.name === "TokenCreated");
    return ev.args.token;
  }

  it("creates a token for the default 2 KII fee and mints the full supply to the curve", async function () {
    const token = await createToken();
    const erc20 = await ethers.getContractAt("MemeToken", token);
    expect(await erc20.totalSupply()).to.equal(ethers.parseEther("1000000000"));
    expect(await erc20.balanceOf(await launchpad.getAddress())).to.equal(ethers.parseEther("1000000000"));
  });

  it("rejects the wrong creation fee", async function () {
    await expect(
      launchpad.connect(creator).createToken("X", "X", "ipfs://x", 0, { value: ethers.parseEther("1") })
    ).to.be.revertedWithCustomError(launchpad, "WrongFee");
  });

  it("lets the owner adjust the creation fee only within 1-20 KII", async function () {
    await launchpad.connect(owner).setCreationFee(ethers.parseEther("5"));
    expect(await launchpad.creationFeeWei()).to.equal(ethers.parseEther("5"));
    await expect(launchpad.connect(owner).setCreationFee(ethers.parseEther("21"))).to.be.revertedWithCustomError(launchpad, "BadCreationFee");
    await expect(launchpad.connect(owner).setCreationFee(ethers.parseEther("0.5"))).to.be.revertedWithCustomError(launchpad, "BadCreationFee");
  });

  it("only the owner can adjust the creation fee", async function () {
    await expect(launchpad.connect(creator).setCreationFee(ethers.parseEther("3"))).to.be.revertedWithCustomError(
      launchpad,
      "OwnableUnauthorizedAccount"
    );
  });

  it("lets anyone buy and sell on the bonding curve, price rising on buys", async function () {
    const token = await createToken();
    const erc20 = await ethers.getContractAt("MemeToken", token);

    const priceBefore = await launchpad.price(token);
    await launchpad.connect(buyer1).buy(token, 0, { value: ethers.parseEther("10") });
    const priceAfter = await launchpad.price(token);
    expect(priceAfter).to.be.gt(priceBefore);
    expect(await erc20.balanceOf(buyer1.address)).to.be.gt(0);

    await erc20.connect(buyer1).approve(await launchpad.getAddress(), await erc20.balanceOf(buyer1.address));
    const bal = await ethers.provider.getBalance(buyer1.address);
    await launchpad.connect(buyer1).sell(token, await erc20.balanceOf(buyer1.address), 0);
    expect(await ethers.provider.getBalance(buyer1.address)).to.be.gt(bal); // net of gas is still up since price rose
  });

  it("allows sniping bots: no cooldown, no per-block limit on repeated buys", async function () {
    const token = await createToken();
    await launchpad.connect(buyer1).buy(token, 0, { value: ethers.parseEther("1") });
    await expect(launchpad.connect(buyer1).buy(token, 0, { value: ethers.parseEther("1") })).to.not.be.reverted;
  });

  it("enforces the creator-configured max wallet while Active", async function () {
    // 0.5% of 1B supply = 5,000,000 tokens max per wallet.
    // Kept well under graduationKiiThreshold (300 KII default) so this buy
    // is purely a cap-violation case, not a graduating trade.
    const token = await createToken(creator, 50);
    await expect(launchpad.connect(buyer1).buy(token, 0, { value: ethers.parseEther("10") })).to.be.revertedWithCustomError(
      launchpad,
      "MaxWalletExceeded"
    );
  });

  it("splits fees between the protocol and the token creator, both pull-payment claimable", async function () {
    const token = await createToken();
    await launchpad.connect(buyer1).buy(token, 0, { value: ethers.parseEther("100") });

    expect(await launchpad.pendingCreatorFees(token)).to.be.gt(0);
    expect(await launchpad.pendingWithdrawals(feeRecipient.address)).to.be.gt(CREATION_FEE); // creation fee + protocol trade fee

    const before = await ethers.provider.getBalance(creator.address);
    await launchpad.connect(creator).claimCreatorFees(token);
    expect(await ethers.provider.getBalance(creator.address)).to.be.gt(before);
    expect(await launchpad.pendingCreatorFees(token)).to.equal(0);
  });

  it("graduates once realKii crosses the threshold, and lifts the max-wallet cap", async function () {
    const token = await createToken(creator, 50); // very tight cap, would block a graduating buy if still enforced
    await launchpad.connect(owner).setGraduationThreshold(ethers.parseEther("50"));
    await launchpad.connect(buyer1).buy(token, 0, { value: ethers.parseEther("60") });
    const launch = await launchpad.launches(token);
    expect(launch.status).to.equal(1); // Graduated
  });

  it("tracks holder count across launchpad trades and plain wallet transfers", async function () {
    const token = await createToken();
    const erc20 = await ethers.getContractAt("MemeToken", token);
    await launchpad.connect(buyer1).buy(token, 0, { value: ethers.parseEther("5") });
    expect((await launchpad.launches(token)).holderCount).to.equal(1);

    await erc20.connect(buyer1).transfer(buyer2.address, await erc20.balanceOf(buyer1.address));
    expect((await launchpad.launches(token)).holderCount).to.equal(1); // moved, not added
    expect(await erc20.balanceOf(buyer1.address)).to.equal(0);
  });

  describe("30-day inactivity, liquidation and deletion", function () {
    it("cannot be triggered before 30 days of silence", async function () {
      const token = await createToken();
      await launchpad.connect(buyer1).buy(token, 0, { value: ethers.parseEther("5") });
      await expect(launchpad.triggerLiquidation(token)).to.be.revertedWithCustomError(launchpad, "StillActive");
    });

    it("liquidates the largest holder first, at a discount, and deletes a small token", async function () {
      const token = await createToken();
      const erc20 = await ethers.getContractAt("MemeToken", token);

      // buyer1 buys a LOT (becomes the biggest holder), buyer2 buys a little
      await launchpad.connect(buyer1).buy(token, 0, { value: ethers.parseEther("20") });
      await launchpad.connect(buyer2).buy(token, 0, { value: ethers.parseEther("1") });

      const bal1 = await erc20.balanceOf(buyer1.address);
      const bal2 = await erc20.balanceOf(buyer2.address);
      expect(bal1).to.be.gt(bal2);

      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);

      expect(await launchpad.isInactive(token)).to.equal(true);
      await launchpad.triggerLiquidation(token);
      expect((await launchpad.launches(token)).status).to.equal(2); // Liquidating
      expect((await launchpad.launches(token)).holderCountAtInactivity).to.equal(2);

      // first pass of size 1 must liquidate buyer1 (the bigger holder) before buyer2
      await launchpad.liquidateBatch(token, 1);
      expect(await erc20.balanceOf(buyer1.address)).to.equal(0);
      expect(await erc20.balanceOf(buyer2.address)).to.equal(bal2); // untouched yet
      expect(await launchpad.pendingWithdrawals(buyer1.address)).to.be.gt(0);

      await launchpad.liquidateBatch(token, 1);
      expect(await erc20.balanceOf(buyer2.address)).to.equal(0);
      expect((await launchpad.launches(token)).status).to.equal(3); // Liquidated

      // <20 holders at inactivity -> can be deleted
      await launchpad.deleteToken(token);
      expect((await launchpad.launches(token)).status).to.equal(4); // Deleted

      const before = await ethers.provider.getBalance(buyer1.address);
      await launchpad.connect(buyer1).withdraw();
      expect(await ethers.provider.getBalance(buyer1.address)).to.be.gt(before);
    });

    it("refuses to delete a token that had >=20 holders when it went inactive", async function () {
      const token = await createToken();
      const signers = await ethers.getSigners();
      const TEN_THOUSAND = "0x" + (10000n * 10n ** 18n).toString(16);
      for (let i = 6; i < 26; i++) {
        await ethers.provider.send("hardhat_setBalance", [signers[i].address, TEN_THOUSAND]);
        await launchpad.connect(signers[i]).buy(token, 0, { value: ethers.parseEther("1") });
      }
      expect((await launchpad.launches(token)).holderCount).to.equal(20);

      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      await launchpad.triggerLiquidation(token);

      // 20 holders / batch of 5 = exactly 4 passes to fully liquidate; stop
      // once the status leaves Liquidating instead of assuming a fixed count.
      while ((await launchpad.launches(token)).status === 2n) {
        await launchpad.liquidateBatch(token, 5);
      }
      expect((await launchpad.launches(token)).status).to.equal(3); // Liquidated

      await expect(launchpad.deleteToken(token)).to.be.revertedWithCustomError(launchpad, "TooManyHolders");
    });

    it("halts trading once liquidation has started", async function () {
      const token = await createToken();
      await launchpad.connect(buyer1).buy(token, 0, { value: ethers.parseEther("1") });
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine", []);
      await launchpad.triggerLiquidation(token);
      await expect(launchpad.connect(buyer2).buy(token, 0, { value: ethers.parseEther("1") })).to.be.revertedWithCustomError(
        launchpad,
        "TradingHalted"
      );
    });
  });
});