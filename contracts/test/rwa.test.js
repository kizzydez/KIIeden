const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RWA fractional ownership", function () {
  let rwaFactory, rwaMarket, curve, chat;
  let owner, admin, treasury, buyer1, buyer2, feeRecipient;
  const TOTAL_UNITS = ethers.parseEther("1000"); // 1000 whole units
  const PRICE_PER_UNIT = ethers.parseEther("1"); // 1 KII per unit
  const IPO_DURATION = 7 * 24 * 60 * 60;

  beforeEach(async function () {
    [owner, admin, treasury, buyer1, buyer2, feeRecipient] = await ethers.getSigners();

    const RWAFactory = await ethers.getContractFactory("RWAFactory");
    rwaFactory = await RWAFactory.connect(admin).deploy(); // admin is the owner/multisig

    const RWAUnitMarketplace = await ethers.getContractFactory("RWAUnitMarketplace");
    rwaMarket = await RWAUnitMarketplace.deploy(await rwaFactory.getAddress(), feeRecipient.address);

    const RWAChat = await ethers.getContractFactory("RWAChat");
    chat = await RWAChat.connect(admin).deploy(await rwaFactory.getAddress());

    const RWACurveMarket = await ethers.getContractFactory("RWACurveMarket");
    curve = await RWACurveMarket.deploy(await rwaFactory.getAddress(), feeRecipient.address);

    // Hardhat keeps balances between tests, and several tests buy out a whole 1000 KII IPO.
    // Top the buyers back up so a test never fails just because earlier tests spent the funds.
    const TEN_THOUSAND_KII = "0x" + (10000n * 10n ** 18n).toString(16);
    await ethers.provider.send("hardhat_setBalance", [buyer1.address, TEN_THOUSAND_KII]);
    await ethers.provider.send("hardhat_setBalance", [buyer2.address, TEN_THOUSAND_KII]);
  });

  async function createAsset(ipoStart = 0) {
    const tx = await rwaFactory
      .connect(admin)
      .createAsset("123 Main St", "MAIN", TOTAL_UNITS, PRICE_PER_UNIT, ipoStart, IPO_DURATION, treasury.address, "ipfs://legal-docs/");
    const rc = await tx.wait();
    const ev = rc.logs.map((l) => {
      try { return rwaFactory.interface.parseLog(l); } catch { return null; }
    }).find((e) => e && e.name === "AssetCreated");
    return await ethers.getContractAt("RWAAsset", ev.args.asset);
  }

  it("only an admin can create an RWA asset", async function () {
    await expect(
      rwaFactory.connect(buyer1).createAsset("X", "X", TOTAL_UNITS, PRICE_PER_UNIT, 0, IPO_DURATION, treasury.address, "ipfs://x")
    ).to.be.revertedWithCustomError(rwaFactory, "NotAdmin");
  });

  it("the owner can grant and revoke extra admin wallets", async function () {
    await expect(rwaFactory.connect(buyer1).setAdmin(buyer1.address, true)).to.be.revertedWithCustomError(
      rwaFactory,
      "OwnableUnauthorizedAccount"
    );
    await rwaFactory.connect(admin).setAdmin(buyer1.address, true);
    await expect(
      rwaFactory.connect(buyer1).createAsset("X", "X", TOTAL_UNITS, PRICE_PER_UNIT, 0, IPO_DURATION, treasury.address, "ipfs://x")
    ).to.not.be.reverted;
    await rwaFactory.connect(admin).setAdmin(buyer1.address, false);
    await expect(
      rwaFactory.connect(buyer1).createAsset("Y", "Y", TOTAL_UNITS, PRICE_PER_UNIT, 0, IPO_DURATION, treasury.address, "ipfs://y")
    ).to.be.revertedWithCustomError(rwaFactory, "NotAdmin");
  });

  it("an upcoming IPO cannot be bought until it starts", async function () {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const asset = await createAsset(now + 3600);
    expect(await asset.isIpoOpen()).to.equal(false);
    expect(await asset.ipoEnded()).to.equal(false);
    await expect(asset.connect(buyer1).contribute({ value: ethers.parseEther("10") })).to.be.revertedWithCustomError(asset, "IpoNotActive");

    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine");
    expect(await asset.isIpoOpen()).to.equal(true);
    await expect(asset.connect(buyer1).contribute({ value: ethers.parseEther("10") })).to.not.be.reverted;
  });

  it("rejects an IPO start time in the past", async function () {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    await expect(
      rwaFactory.connect(admin).createAsset("X", "X", TOTAL_UNITS, PRICE_PER_UNIT, now - 1000, IPO_DURATION, treasury.address, "ipfs://x")
    ).to.be.revertedWithCustomError(rwaFactory, "BadIpoStart");
  });

  it("mints units proportional to contribution and refunds the remainder", async function () {
    const asset = await createAsset();

    // buyer1 sends 250.5 KII worth -> should get 250 units (fractional remainder refunded)
    const send = ethers.parseEther("250.5");
    const balBefore = await ethers.provider.getBalance(buyer1.address);
    const tx = await asset.connect(buyer1).contribute({ value: send });
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    const balAfter = await ethers.provider.getBalance(buyer1.address);

    expect(await asset.balanceOf(buyer1.address)).to.equal(ethers.parseEther("250"));
    expect(balBefore - balAfter).to.equal(ethers.parseEther("250") + gas); // 0.5 KII refunded
  });

  it("blocks unit transfers while the IPO is still active", async function () {
    const asset = await createAsset();
    await asset.connect(buyer1).contribute({ value: ethers.parseEther("10") });
    await expect(
      asset.connect(buyer1).transfer(buyer2.address, ethers.parseEther("1"))
    ).to.be.revertedWithCustomError(asset, "TransfersLockedDuringIpo");
  });

  it("auto-closes the IPO once fully subscribed and unlocks transfers", async function () {
    const asset = await createAsset();
    // Exact cost to buy every whole unit: (total whole units) * (price per whole unit)
    const wholeUnitCount = TOTAL_UNITS / ethers.parseEther("1"); // 1000
    const totalCost = wholeUnitCount * PRICE_PER_UNIT; // 1000 KII
    await asset.connect(buyer1).contribute({ value: totalCost });
    expect(await asset.ipoActive()).to.equal(false);
    await expect(asset.connect(buyer1).transfer(buyer2.address, ethers.parseEther("1"))).to.not.be.reverted;
  });

  it("lets the treasury withdraw IPO proceeds via pull payment once the IPO is over", async function () {
    const asset = await createAsset();
    await asset.connect(buyer1).contribute({ value: ethers.parseEther("100") });

    // Mid-IPO the treasury must NOT be able to drain the raise.
    await expect(asset.connect(treasury).withdrawProceeds()).to.be.revertedWithCustomError(asset, "IpoStillActive");

    // ...but after the deadline it can, even if nobody ever called closeIpo().
    await ethers.provider.send("evm_increaseTime", [IPO_DURATION + 1]);
    await ethers.provider.send("evm_mine");

    const before = await ethers.provider.getBalance(treasury.address);
    const tx = await asset.connect(treasury).withdrawProceeds();
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    const after = await ethers.provider.getBalance(treasury.address);
    expect(after - before).to.equal(ethers.parseEther("100") - gas);
  });

  it("only the treasury can withdraw proceeds", async function () {
    const asset = await createAsset();
    await asset.connect(buyer1).contribute({ value: ethers.parseEther("10") });
    await ethers.provider.send("evm_increaseTime", [IPO_DURATION + 1]);
    await ethers.provider.send("evm_mine");
    await expect(asset.connect(buyer1).withdrawProceeds()).to.be.revertedWith("not treasury");
  });

  it("units unlock automatically after the IPO deadline, without anyone calling closeIpo()", async function () {
    const asset = await createAsset();
    await asset.connect(buyer1).contribute({ value: ethers.parseEther("10") });
    expect(await asset.isIpoOpen()).to.equal(true);

    await ethers.provider.send("evm_increaseTime", [IPO_DURATION + 1]);
    await ethers.provider.send("evm_mine");

    expect(await asset.isIpoOpen()).to.equal(false);
    // no closeIpo() call needed - transfers work, but new contributions are refused
    await expect(asset.connect(buyer1).transfer(buyer2.address, ethers.parseEther("1"))).to.not.be.reverted;
    await expect(
      asset.connect(buyer2).contribute({ value: ethers.parseEther("1") })
    ).to.be.revertedWithCustomError(asset, "IpoNotActive");
  });

  it("supports secondary trading of units after IPO close, with partial fills", async function () {
    const asset = await createAsset();
    // fully subscribe to close the IPO
    await asset.connect(buyer1).contribute({ value: TOTAL_UNITS }); // PRICE_PER_UNIT is 1 KII, so value in KII == units count
    expect(await asset.ipoActive()).to.equal(false);

    // buyer1 lists 100 units at 1.2 KII each
    const marketAddr = await rwaMarket.getAddress();
    await asset.connect(buyer1).approve(marketAddr, ethers.parseEther("100"));
    await rwaMarket.connect(buyer1).listUnits(await asset.getAddress(), ethers.parseEther("100"), ethers.parseEther("1.2"));

    // buyer2 buys 40 of the 100 units (partial fill)
    const cost = ethers.parseEther("48"); // 40 * 1.2
    await rwaMarket.connect(buyer2).buyUnits(1, ethers.parseEther("40"), { value: cost });

    expect(await asset.balanceOf(buyer2.address)).to.equal(ethers.parseEther("40"));
    const order = await rwaMarket.orders(1);
    expect(order.remainingUnits).to.equal(ethers.parseEther("60"));
    expect(order.active).to.equal(true);

    // protocol fee 1.5% of 48 = 0.72, seller gets 47.28
    const protocolCut = (cost * 150n) / 10000n;
    expect(await rwaMarket.pendingWithdrawals(buyer1.address)).to.equal(cost - protocolCut);
    expect(await rwaMarket.pendingWithdrawals(feeRecipient.address)).to.equal(protocolCut);
  });
  it("rounds the price of tiny purchases up, so units can't be taken for free", async function () {
    const asset = await createAsset();
    await asset.connect(buyer1).contribute({ value: TOTAL_UNITS }); // sells out -> IPO closed

    const marketAddr = await rwaMarket.getAddress();
    await asset.connect(buyer1).approve(marketAddr, ethers.parseEther("10"));
    await rwaMarket.connect(buyer1).listUnits(await asset.getAddress(), ethers.parseEther("10"), ethers.parseEther("1.2"));

    // 1 wei of a unit at 1.2 KII/unit costs ceil(1.2) = 2 wei, never 0.
    await expect(rwaMarket.connect(buyer2).buyUnits(1, 1n, { value: 1n })).to.be.revertedWithCustomError(
      rwaMarket,
      "InsufficientPayment"
    );
    await rwaMarket.connect(buyer2).buyUnits(1, 1n, { value: 2n });
    expect(await asset.balanceOf(buyer2.address)).to.equal(1n);
  });
  // ---------------------------------------------------------------- trade curve
  describe("demand & supply trade curve", function () {
    let asset, assetAddr, curveAddr;
    const ONE = ethers.parseEther("1");

    // sells the whole IPO to buyer1, then buyer1 opens the market with 400 units + 400 KII (price 1.0)
    async function openMarket() {
      asset = await createAsset();
      assetAddr = await asset.getAddress();
      curveAddr = await curve.getAddress();
      await asset.connect(buyer1).contribute({ value: TOTAL_UNITS }); // sells out -> IPO ends
      await asset.connect(buyer1).approve(curveAddr, ethers.parseEther("400"));
      await curve.connect(buyer1).addLiquidity(assetAddr, ethers.parseEther("400"), 0, { value: ethers.parseEther("400") });
    }

    it("is closed while the IPO is still running", async function () {
      const a = await createAsset();
      await expect(
        curve.connect(buyer1).addLiquidity(await a.getAddress(), ONE, 0, { value: ONE })
      ).to.be.revertedWithCustomError(curve, "IpoNotEnded");
    });

    it("only works for real RWA assets", async function () {
      await expect(curve.connect(buyer1).buy(buyer2.address, 0, { value: ONE })).to.be.revertedWithCustomError(curve, "NotRwaAsset");
    });

    it("the first liquidity provider opens the market at the price they set", async function () {
      await openMarket();
      const pool = await curve.pools(assetAddr);
      expect(pool.kiiReserve).to.equal(ethers.parseEther("400"));
      expect(pool.unitReserve).to.equal(ethers.parseEther("400"));
      expect(await curve.price(assetAddr)).to.equal(ONE);
      expect(await curve.shares(assetAddr, buyer1.address)).to.be.gt(0n);
    });

    it("rejects an opening price far from the IPO price", async function () {
      const a = await createAsset();
      const aAddr = await a.getAddress();
      await a.connect(buyer1).contribute({ value: TOTAL_UNITS });
      await a.connect(buyer1).approve(curveAddr || (await curve.getAddress()), ethers.parseEther("100"));
      // 100 units for 1000 KII = 10 KII/unit, 10x the IPO price of 1
      await expect(
        curve.connect(buyer1).addLiquidity(aAddr, ethers.parseEther("100"), 0, { value: ethers.parseEther("1000") })
      ).to.be.revertedWithCustomError(curve, "PriceOutOfBand");
    });

    it("buying pushes the price up (pump), selling pushes it down (dump)", async function () {
      await openMarket();
      const p0 = await curve.price(assetAddr);

      const kiiIn = ethers.parseEther("50");
      const quote = await curve.quoteBuy(assetAddr, kiiIn);
      await expect(curve.connect(buyer2).buy(assetAddr, quote, { value: kiiIn })).to.emit(curve, "Trade");
      expect(await asset.balanceOf(buyer2.address)).to.equal(quote);
      const p1 = await curve.price(assetAddr);
      expect(p1).to.be.gt(p0);

      // buyer2 dumps everything back
      await asset.connect(buyer2).approve(curveAddr, quote);
      await curve.connect(buyer2).sell(assetAddr, quote, 0);
      const p2 = await curve.price(assetAddr);
      expect(p2).to.be.lt(p1);
    });

    it("a bigger buy moves the price more than a small one", async function () {
      await openMarket();
      await curve.connect(buyer2).buy(assetAddr, 0, { value: ethers.parseEther("5") });
      const small = await curve.price(assetAddr);
      await curve.connect(buyer2).buy(assetAddr, 0, { value: ethers.parseEther("100") });
      const big = await curve.price(assetAddr);
      expect(big - small).to.be.gt(small - ONE);
    });

    it("the quote matches what a sale actually pays", async function () {
      await openMarket();
      await curve.connect(buyer2).buy(assetAddr, 0, { value: ethers.parseEther("40") });
      const units = await asset.balanceOf(buyer2.address);
      await asset.connect(buyer2).approve(curveAddr, units);
      const quote = await curve.quoteSell(assetAddr, units);

      const before = await ethers.provider.getBalance(buyer2.address);
      const tx = await curve.connect(buyer2).sell(assetAddr, units, quote);
      const rc = await tx.wait();
      const after = await ethers.provider.getBalance(buyer2.address);
      expect(after - before + rc.gasUsed * rc.gasPrice).to.equal(quote);
    });

    it("enforces slippage limits on both sides", async function () {
      await openMarket();
      const quote = await curve.quoteBuy(assetAddr, ethers.parseEther("10"));
      await expect(
        curve.connect(buyer2).buy(assetAddr, quote + 1n, { value: ethers.parseEther("10") })
      ).to.be.revertedWithCustomError(curve, "SlippageExceeded");

      await curve.connect(buyer2).buy(assetAddr, 0, { value: ethers.parseEther("10") });
      const units = await asset.balanceOf(buyer2.address);
      await asset.connect(buyer2).approve(curveAddr, units);
      const sellQuote = await curve.quoteSell(assetAddr, units);
      await expect(curve.connect(buyer2).sell(assetAddr, units, sellQuote + 1n)).to.be.revertedWithCustomError(
        curve,
        "SlippageExceeded"
      );
    });

    it("the pool product never shrinks from trading (fees stay in the pool)", async function () {
      await openMarket();
      const before = await curve.pools(assetAddr);
      const k0 = before.kiiReserve * before.unitReserve;
      await curve.connect(buyer2).buy(assetAddr, 0, { value: ethers.parseEther("30") });
      const units = await asset.balanceOf(buyer2.address);
      await asset.connect(buyer2).approve(curveAddr, units);
      await curve.connect(buyer2).sell(assetAddr, units, 0);
      const after = await curve.pools(assetAddr);
      expect(after.kiiReserve * after.unitReserve).to.be.gte(k0);
    });

    it("cannot be drained: selling everything leaves the pool with reserves", async function () {
      await openMarket();
      // buyer1 still holds 600 units; dump them all into the pool
      const units = await asset.balanceOf(buyer1.address);
      await asset.connect(buyer1).approve(curveAddr, units);
      await curve.connect(buyer1).sell(assetAddr, units, 0);
      const pool = await curve.pools(assetAddr);
      expect(pool.kiiReserve).to.be.gt(0n);
      expect(pool.unitReserve).to.be.gt(0n);
    });

    it("liquidity providers get their share of both reserves back", async function () {
      await openMarket();
      await curve.connect(buyer2).buy(assetAddr, 0, { value: ethers.parseEther("20") });
      const s = await curve.shares(assetAddr, buyer1.address);
      const unitsBefore = await asset.balanceOf(buyer1.address);
      await curve.connect(buyer1).removeLiquidity(assetAddr, s, 0, 0);
      expect(await asset.balanceOf(buyer1.address)).to.be.gt(unitsBefore);
      expect(await curve.shares(assetAddr, buyer1.address)).to.equal(0n);
    });

    it("a second provider adds liquidity at the current ratio", async function () {
      await openMarket();
      await asset.connect(buyer1).transfer(buyer2.address, ethers.parseEther("100"));
      await asset.connect(buyer2).approve(curveAddr, ethers.parseEther("100"));
      const before = await curve.pools(assetAddr);
      await curve.connect(buyer2).addLiquidity(assetAddr, ethers.parseEther("100"), 0, { value: ethers.parseEther("50") });
      const after = await curve.pools(assetAddr);
      expect(after.kiiReserve - before.kiiReserve).to.equal(ethers.parseEther("50"));
      expect(after.unitReserve).to.be.gt(before.unitReserve);
      expect(await curve.shares(assetAddr, buyer2.address)).to.be.gt(0n);
    });

    it("the platform can withdraw its protocol fee", async function () {
      await openMarket();
      await curve.connect(buyer2).buy(assetAddr, 0, { value: ethers.parseEther("100") });
      const owed = await curve.pendingWithdrawals(feeRecipient.address);
      expect(owed).to.equal((ethers.parseEther("100") * 20n) / 10000n);
      await expect(curve.connect(feeRecipient).withdraw()).to.not.be.reverted;
      await expect(curve.connect(feeRecipient).withdraw()).to.be.revertedWithCustomError(curve, "NothingToWithdraw");
    });
  });
  // --------------------------------------------------------------------- chat
  describe("asset chat (on-chain)", function () {
    let asset, assetAddr;
    beforeEach(async function () {
      asset = await createAsset();
      assetAddr = await asset.getAddress();
      await asset.connect(buyer1).contribute({ value: ethers.parseEther("10") }); // buyer1 now holds units
    });

    it("a unit holder can post a message", async function () {
      await expect(chat.connect(buyer1).post(assetAddr, "Rent roll looks solid")).to.emit(chat, "MessagePosted");
      expect(await chat.nextMessageId()).to.equal(2n);
    });

    it("someone with no units cannot post", async function () {
      await expect(chat.connect(buyer2).post(assetAddr, "hello")).to.be.revertedWithCustomError(chat, "NotAHolder");
    });

    it("rejects empty and over-long messages, and non-RWA addresses", async function () {
      await expect(chat.connect(buyer1).post(assetAddr, "")).to.be.revertedWithCustomError(chat, "EmptyMessage");
      await expect(chat.connect(buyer1).post(assetAddr, "x".repeat(281))).to.be.revertedWithCustomError(chat, "MessageTooLong");
      await expect(chat.connect(buyer1).post(buyer2.address, "hi")).to.be.revertedWithCustomError(chat, "NotRwaAsset");
    });

    it("enforces a short cooldown between posts from one wallet", async function () {
      await chat.connect(buyer1).post(assetAddr, "first");
      await expect(chat.connect(buyer1).post(assetAddr, "second")).to.be.revertedWithCustomError(chat, "TooFast");
      await ethers.provider.send("evm_increaseTime", [25]);
      await ethers.provider.send("evm_mine");
      await expect(chat.connect(buyer1).post(assetAddr, "second")).to.not.be.reverted;
    });

    it("only moderators can hide a message; the owner can add moderators", async function () {
      await chat.connect(buyer1).post(assetAddr, "spam");
      await expect(chat.connect(buyer2).setHidden(1, true)).to.be.revertedWithCustomError(chat, "NotModerator");
      await chat.connect(admin).setHidden(1, true);
      expect(await chat.hidden(1)).to.equal(true);

      await expect(chat.connect(buyer2).setModerator(buyer2.address, true)).to.be.revertedWithCustomError(chat, "OwnableUnauthorizedAccount");
      await chat.connect(admin).setModerator(buyer2.address, true);
      await chat.connect(buyer2).setHidden(1, false);
      expect(await chat.hidden(1)).to.equal(false);
    });
  });
});
