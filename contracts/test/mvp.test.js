const { expect } = require("chai");
const { ethers } = require("hardhat");

const DAY = 24 * 60 * 60;

describe("KiiEden NFT: fees, mint-first launch, trading, offers", function () {
  let feeManager, factory, marketplace;
  let owner, treasury, creator, seller, buyer, feeRecipient, stranger;
  const TESTNET_FEE = ethers.parseEther("2"); // 2 KII on KiiChain testnet
  const MAINNET_FEE = ethers.parseEther("1"); // 1 KII on KiiChain mainnet
  const MAX_FEE = ethers.parseEther("50"); // hard on-chain ceiling

  beforeEach(async function () {
    [owner, treasury, creator, seller, buyer, feeRecipient, stranger] = await ethers.getSigners();

    const FeeManager = await ethers.getContractFactory("FeeManager");
    feeManager = await FeeManager.deploy(treasury.address, TESTNET_FEE);

    const Marketplace = await ethers.getContractFactory("Marketplace");
    marketplace = await Marketplace.deploy(feeRecipient.address);

    const CollectionFactory = await ethers.getContractFactory("CollectionFactory");
    factory = await CollectionFactory.deploy(await feeManager.getAddress(), await marketplace.getAddress());
  });

  // ----------------------------------------------------------------- helpers
  async function now() {
    return (await ethers.provider.getBlock("latest")).timestamp;
  }
  async function increase(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine");
  }
  function collectionFrom(rc) {
    const ev = rc.logs
      .map((l) => {
        try {
          return factory.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e) => e && e.name === "CollectionCreated");
    return ev.args.collection;
  }
  const ZERO_ROOT = ethers.ZeroHash;
  function paramsFor(o, t) {
    return {
      name: o.name ?? "Test",
      symbol: o.symbol ?? "TST",
      baseURI: o.baseURI ?? "ipfs://folder/",
      infoURI: o.infoURI ?? "ipfs://info/collection.json",
      placeholderURI: o.placeholderURI ?? "",
      maxSupply: o.maxSupply ?? 10,
      royaltyBps: o.royalty ?? 500,
      mintPrice: o.price ?? 0n,
      mintStart: o.start ?? 0,
      mintEnd: o.end ?? t + DAY,
      maxPerWallet: o.perWallet ?? 0,
      whitelistRoot: o.wlRoot ?? ZERO_ROOT,
      whitelistStart: o.wlStart ?? 0,
      whitelistEnd: o.wlEnd ?? 0,
      whitelistPrice: o.wlPrice ?? 0n,
      revealTime: o.revealTime ?? 0,
    };
  }
  // Creates a collection as `creator` (default) and returns the NFTCollection contract.
  async function create(o = {}) {
    const t = await now();
    const tx = await factory.connect(o.signer ?? creator).createCollection(paramsFor(o, t), { value: o.value ?? TESTNET_FEE });
    const rc = await tx.wait();
    return ethers.getContractAt("NFTCollection", collectionFrom(rc));
  }

  // ---- Merkle helpers (same algorithm as OpenZeppelin MerkleProof: sorted pairs) ----
  function leafOf(addr) {
    return ethers.solidityPackedKeccak256(["address"], [addr]);
  }
  function hashPair(a, b) {
    const [x, y] = BigInt(a) <= BigInt(b) ? [a, b] : [b, a];
    return ethers.keccak256(ethers.concat([x, y]));
  }
  function merkle(addresses) {
    let layer = addresses.map(leafOf);
    const layers = [layer];
    while (layer.length > 1) {
      const next = [];
      for (let i = 0; i < layer.length; i += 2) next.push(i + 1 < layer.length ? hashPair(layer[i], layer[i + 1]) : layer[i]);
      layer = next;
      layers.push(layer);
    }
    return {
      root: layer[0],
      proof(addr) {
        let idx = layers[0].indexOf(leafOf(addr));
        const p = [];
        for (let l = 0; l < layers.length - 1; l++) {
          const sib = idx ^ 1;
          if (sib < layers[l].length) p.push(layers[l][sib]);
          idx = idx >> 1;
        }
        return p;
      },
    };
  }

  // A collection that already sold out (so it is tradable): `seller` minted all `n` tokens.
  async function tradableCollection(n = 3) {
    const c = await create({ maxSupply: n });
    await c.connect(seller).publicMint(n);
    return c;
  }

  // -------------------------------------------------------------------- fees
  it("charges a flat 2 KII on testnet (no oracle, nothing to go stale)", async function () {
    expect(await feeManager.feeInKii()).to.equal(TESTNET_FEE);
    await increase(3 * DAY);
    expect(await feeManager.feeInKii()).to.equal(TESTNET_FEE);
  });

  it("can be deployed with the 1 KII mainnet fee", async function () {
    const FeeManager = await ethers.getContractFactory("FeeManager");
    const mainnetFm = await FeeManager.deploy(treasury.address, MAINNET_FEE);
    expect(await mainnetFm.feeInKii()).to.equal(MAINNET_FEE);
  });

  it("owner can change the fee up to 50 KII, and no higher", async function () {
    await expect(feeManager.connect(owner).setFee(MAX_FEE)).to.emit(feeManager, "FeeUpdated").withArgs(TESTNET_FEE, MAX_FEE);
    expect(await feeManager.feeInKii()).to.equal(MAX_FEE);
    await expect(feeManager.connect(owner).setFee(MAX_FEE + 1n)).to.be.revertedWithCustomError(feeManager, "FeeAboveMax");
  });

  it("rejects an initial fee above the 50 KII ceiling at deploy time", async function () {
    const FeeManager = await ethers.getContractFactory("FeeManager");
    await expect(FeeManager.deploy(treasury.address, MAX_FEE + 1n)).to.be.revertedWithCustomError(FeeManager, "FeeAboveMax");
  });

  it("only the owner can change the fee or treasury", async function () {
    await expect(feeManager.connect(stranger).setFee(1)).to.be.revertedWithCustomError(feeManager, "OwnableUnauthorizedAccount");
    await expect(feeManager.connect(stranger).setTreasury(stranger.address)).to.be.revertedWithCustomError(
      feeManager,
      "OwnableUnauthorizedAccount"
    );
  });

  it("a fee change applies to the very next creation", async function () {
    await feeManager.connect(owner).setFee(ethers.parseEther("5"));
    await expect(create({ value: TESTNET_FEE })).to.be.revertedWithCustomError(feeManager, "InsufficientFee");
    await expect(create({ value: ethers.parseEther("5") })).to.not.be.reverted;
  });

  it("creating a collection charges exactly the flat fee and refunds overpayment", async function () {
    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    const before = await ethers.provider.getBalance(creator.address);

    const t = await now();
    const tx = await factory.connect(creator).createCollection(paramsFor({ name: "A", symbol: "A" }, t), { value: ethers.parseEther("3") });
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;

    const after = await ethers.provider.getBalance(creator.address);
    expect(before - after).to.equal(TESTNET_FEE + gas); // 1 KII of the 3 was refunded
    expect((await ethers.provider.getBalance(treasury.address)) - treasuryBefore).to.equal(TESTNET_FEE);
    expect(await factory.totalCollections()).to.equal(1n);
    expect(await factory.isCollection(collectionFrom(rc))).to.equal(true);
  });

  it("rejects an underpaid creation fee", async function () {
    await expect(create({ value: TESTNET_FEE - 1n })).to.be.revertedWithCustomError(feeManager, "InsufficientFee");
  });

  it("rejects zero supply and bad mint schedules", async function () {
    await expect(create({ maxSupply: 0 })).to.be.revertedWithCustomError(factory, "ZeroSupply");
    const t = await now();
    await expect(create({ start: t + 2 * DAY, end: t + DAY })).to.be.revertedWithCustomError(factory, "BadSchedule");
    await expect(create({ end: t - 10 })).to.be.revertedWithCustomError(factory, "BadSchedule");
  });

  it("exposes the collection-info file through contractURI (separate from the token folder)", async function () {
    const c = await create({ baseURI: "ipfs://abc/", infoURI: "ipfs://info123" });
    expect(await c.contractURI()).to.equal("ipfs://info123");
  });

  // ------------------------------------------------------------------ minting
  describe("public mint phase", function () {
    it("followers can mint while the mint is open, paying the mint price", async function () {
      const c = await create({ price: ethers.parseEther("1.5"), maxSupply: 10 });
      expect(await c.mintOpen()).to.equal(true);
      expect(await c.tradingOpen()).to.equal(false);

      await c.connect(buyer).publicMint(2, { value: ethers.parseEther("3") });
      expect(await c.balanceOf(buyer.address)).to.equal(2n);
      expect(await c.ownerOf(0)).to.equal(buyer.address);
      expect(await c.ownerOf(1)).to.equal(buyer.address);
      expect(await c.proceeds()).to.equal(ethers.parseEther("3"));
      expect(await ethers.provider.getBalance(await c.getAddress())).to.equal(ethers.parseEther("3"));
    });

    it("refunds overpayment and rejects underpayment", async function () {
      const c = await create({ price: ethers.parseEther("1") });
      await expect(c.connect(buyer).publicMint(1, { value: ethers.parseEther("0.5") })).to.be.revertedWithCustomError(c, "InsufficientPayment");

      const before = await ethers.provider.getBalance(buyer.address);
      const tx = await c.connect(buyer).publicMint(1, { value: ethers.parseEther("4") });
      const rc = await tx.wait();
      const after = await ethers.provider.getBalance(buyer.address);
      expect(before - after).to.equal(ethers.parseEther("1") + rc.gasUsed * rc.gasPrice);
    });

    it("free mints work (price 0)", async function () {
      const c = await create({ price: 0n });
      await c.connect(buyer).publicMint(1);
      expect(await c.balanceOf(buyer.address)).to.equal(1n);
    });

    it("cannot mint before the start time, can after", async function () {
      const t = await now();
      const c = await create({ start: t + 3600, end: t + DAY });
      expect(await c.mintOpen()).to.equal(false);
      await expect(c.connect(buyer).publicMint(1)).to.be.revertedWithCustomError(c, "MintNotOpen");
      await increase(3601);
      await expect(c.connect(buyer).publicMint(1)).to.not.be.reverted;
    });

    it("enforces the per-wallet limit", async function () {
      const c = await create({ perWallet: 2 });
      await c.connect(buyer).publicMint(2);
      await expect(c.connect(buyer).publicMint(1)).to.be.revertedWithCustomError(c, "WalletLimitReached");
      await expect(c.connect(stranger).publicMint(2)).to.not.be.reverted; // limit is per wallet
    });

    it("enforces the supply cap and the per-transaction quantity", async function () {
      const c = await create({ maxSupply: 3 });
      await expect(c.connect(buyer).publicMint(0)).to.be.revertedWithCustomError(c, "BadQuantity");
      await expect(c.connect(buyer).publicMint(51)).to.be.revertedWithCustomError(c, "BadQuantity");
      await c.connect(buyer).publicMint(2);
      await expect(c.connect(stranger).publicMint(2)).to.be.revertedWithCustomError(c, "SupplyCapReached");
    });

    it("cannot mint after the end time", async function () {
      const t = await now();
      const c = await create({ end: t + 3600 });
      await increase(3601);
      await expect(c.connect(buyer).publicMint(1)).to.be.revertedWithCustomError(c, "MintNotOpen");
    });

    it("the creator withdraws mint revenue; nobody else can", async function () {
      const c = await create({ price: ethers.parseEther("2") });
      await c.connect(buyer).publicMint(3, { value: ethers.parseEther("6") });

      await expect(c.connect(stranger).withdrawProceeds()).to.be.revertedWithCustomError(c, "OwnableUnauthorizedAccount");

      const before = await ethers.provider.getBalance(creator.address);
      const tx = await c.connect(creator).withdrawProceeds();
      const rc = await tx.wait();
      const after = await ethers.provider.getBalance(creator.address);
      expect(after - before + rc.gasUsed * rc.gasPrice).to.equal(ethers.parseEther("6"));
      expect(await c.proceeds()).to.equal(0n);
      await expect(c.connect(creator).withdrawProceeds()).to.be.revertedWithCustomError(c, "NothingToWithdraw");
    });

    it("the creator can reserve-mint during the mint, but not after", async function () {
      const c = await create({ maxSupply: 10 });
      await expect(c.connect(stranger).reserveMint(stranger.address, 1)).to.be.revertedWithCustomError(c, "OwnableUnauthorizedAccount");
      await c.connect(creator).reserveMint(creator.address, 2);
      expect(await c.balanceOf(creator.address)).to.equal(2n);
      await c.connect(creator).endMint();
      await expect(c.connect(creator).reserveMint(creator.address, 1)).to.be.revertedWithCustomError(c, "MintEnded");
    });
  });

  // -------------------------------------------------------- mint first, then trade
  describe("mint first, trade after", function () {
    it("trading is closed while minting, and opens when the mint ends by time", async function () {
      const t = await now();
      const c = await create({ maxSupply: 10, end: t + 3600 });
      expect(await c.tradingOpen()).to.equal(false);
      await increase(3601);
      expect(await c.tradingOpen()).to.equal(true);
    });

    it("trading opens the moment the collection sells out", async function () {
      const c = await create({ maxSupply: 2 });
      expect(await c.tradingOpen()).to.equal(false);
      await c.connect(buyer).publicMint(2);
      expect(await c.tradingOpen()).to.equal(true);
    });

    it("the creator can end the mint early, and only the creator", async function () {
      const c = await create();
      await expect(c.connect(stranger).endMint()).to.be.revertedWithCustomError(c, "OwnableUnauthorizedAccount");
      await expect(c.connect(creator).endMint()).to.emit(c, "MintClosed");
      expect(await c.tradingOpen()).to.equal(true);
      await expect(c.connect(creator).endMint()).to.be.revertedWithCustomError(c, "MintEnded");
      await expect(c.connect(buyer).publicMint(1)).to.be.revertedWithCustomError(c, "MintNotOpen");
    });

    it("tokens cannot change hands while the mint is open", async function () {
      const c = await create();
      await c.connect(buyer).publicMint(1);
      await expect(c.connect(buyer).transferFrom(buyer.address, stranger.address, 0)).to.be.revertedWithCustomError(c, "TradingLocked");
      await c.connect(creator).endMint();
      await expect(c.connect(buyer).transferFrom(buyer.address, stranger.address, 0)).to.not.be.reverted;
    });

    it("the marketplace refuses listings and offers until the mint has ended", async function () {
      const c = await create({ maxSupply: 10 });
      const addr = await c.getAddress();
      await c.connect(seller).publicMint(1);
      await expect(marketplace.connect(seller).list(addr, 0, ethers.parseEther("1"))).to.be.revertedWithCustomError(
        marketplace,
        "MintingNotEnded"
      );
      await expect(
        marketplace.connect(buyer).makeOffer(addr, 0, DAY, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(marketplace, "MintingNotEnded");

      await c.connect(creator).endMint();
      await expect(marketplace.connect(seller).list(addr, 0, ethers.parseEther("1"))).to.not.be.reverted;
    });
  });

  // ---------------------------------------------------------------- listings
  describe("listings (no approval needed)", function () {
    let c, addr, mAddr;
    beforeEach(async function () {
      c = await tradableCollection(3);
      addr = await c.getAddress();
      mAddr = await marketplace.getAddress();
    });

    it("holders never need to approve: the marketplace is an automatic operator", async function () {
      expect(await c.isApprovedForAll(seller.address, mAddr)).to.equal(true);
      // ...but nobody else is
      expect(await c.isApprovedForAll(seller.address, stranger.address)).to.equal(false);
    });

    it("full list -> buy flow pays seller, royalty receiver and protocol fee via pull withdrawals", async function () {
      const price = ethers.parseEther("10");
      await marketplace.connect(seller).list(addr, 0, price); // one transaction, no setApprovalForAll
      await marketplace.connect(buyer).buy(1, { value: price });

      expect(await c.ownerOf(0)).to.equal(buyer.address);
      expect(await marketplace.pendingWithdrawals(seller.address)).to.equal(ethers.parseEther("9.25")); // -2.5% -5%
      expect(await marketplace.pendingWithdrawals(creator.address)).to.equal(ethers.parseEther("0.5")); // 5% royalty
      expect(await marketplace.pendingWithdrawals(feeRecipient.address)).to.equal(ethers.parseEther("0.25")); // 2.5%
      expect(await marketplace.collectionVolumeKii(addr)).to.equal(price);

      await expect(marketplace.connect(seller).withdraw()).to.not.be.reverted;
      await expect(marketplace.connect(seller).withdraw()).to.be.revertedWithCustomError(marketplace, "NothingToWithdraw");
    });

    it("refunds a buyer who overpays", async function () {
      const price = ethers.parseEther("1");
      await marketplace.connect(seller).list(addr, 0, price);
      const before = await ethers.provider.getBalance(buyer.address);
      const tx = await marketplace.connect(buyer).buy(1, { value: ethers.parseEther("5") });
      const rc = await tx.wait();
      const after = await ethers.provider.getBalance(buyer.address);
      expect(before - after).to.equal(price + rc.gasUsed * rc.gasPrice);
    });

    it("rejects underpayment and a second purchase of the same listing", async function () {
      await marketplace.connect(seller).list(addr, 0, ethers.parseEther("2"));
      await expect(marketplace.connect(buyer).buy(1, { value: ethers.parseEther("1") })).to.be.revertedWithCustomError(
        marketplace,
        "InsufficientPayment"
      );
      await marketplace.connect(buyer).buy(1, { value: ethers.parseEther("2") });
      await expect(marketplace.connect(stranger).buy(1, { value: ethers.parseEther("2") })).to.be.revertedWithCustomError(
        marketplace,
        "ListingNotActive"
      );
    });

    it("only the owner can list, and zero price is rejected", async function () {
      await expect(marketplace.connect(stranger).list(addr, 0, ethers.parseEther("1"))).to.be.revertedWithCustomError(marketplace, "NotTokenOwner");
      await expect(marketplace.connect(seller).list(addr, 0, 0)).to.be.revertedWithCustomError(marketplace, "ZeroPrice");
    });

    it("re-listing retires the old listing so a stale cheap listing can't be bought", async function () {
      await marketplace.connect(seller).list(addr, 0, ethers.parseEther("1")); // listing 1
      await marketplace.connect(seller).list(addr, 0, ethers.parseEther("5")); // listing 2
      expect((await marketplace.listings(1)).active).to.equal(false);
      expect((await marketplace.listings(2)).active).to.equal(true);
      await expect(marketplace.connect(buyer).buy(1, { value: ethers.parseEther("1") })).to.be.revertedWithCustomError(
        marketplace,
        "ListingNotActive"
      );
      await marketplace.connect(buyer).buy(2, { value: ethers.parseEther("5") });
      expect(await c.ownerOf(0)).to.equal(buyer.address);
    });

    it("a listing whose token left the seller's wallet can't be bought", async function () {
      await marketplace.connect(seller).list(addr, 1, ethers.parseEther("1"));
      await c.connect(seller).transferFrom(seller.address, stranger.address, 1);
      await expect(marketplace.connect(buyer).buy(1, { value: ethers.parseEther("1") })).to.be.revertedWithCustomError(
        marketplace,
        "NotTokenOwner"
      );
    });

    it("seller can update the price or cancel; nobody else can", async function () {
      await marketplace.connect(seller).list(addr, 2, ethers.parseEther("1"));
      await marketplace.connect(seller).updatePrice(1, ethers.parseEther("3"));
      expect((await marketplace.listings(1)).price).to.equal(ethers.parseEther("3"));
      await expect(marketplace.connect(stranger).updatePrice(1, 1)).to.be.revertedWithCustomError(marketplace, "NotSeller");
      await expect(marketplace.connect(stranger).cancel(1)).to.be.revertedWithCustomError(marketplace, "NotSeller");
      await marketplace.connect(seller).cancel(1);
      expect((await marketplace.listings(1)).active).to.equal(false);
    });

    it("the owner can pause the marketplace, blocking new listings", async function () {
      await marketplace.connect(owner).pause();
      await expect(marketplace.connect(seller).list(addr, 0, 1)).to.be.revertedWithCustomError(marketplace, "EnforcedPause");
    });
  });

  // -------------------------------------------------------- offers + escrow + sell now
  describe("offers, escrow and Sell Now", function () {
    let c, addr, mAddr;
    const OFFER = ethers.parseEther("5");
    beforeEach(async function () {
      c = await tradableCollection(3);
      addr = await c.getAddress();
      mAddr = await marketplace.getAddress();
    });

    it("an offer deposits the amount into escrow", async function () {
      const before = await ethers.provider.getBalance(mAddr);
      await expect(marketplace.connect(buyer).makeOffer(addr, 0, DAY, { value: OFFER })).to.emit(marketplace, "OfferMade");
      expect((await ethers.provider.getBalance(mAddr)) - before).to.equal(OFFER);
      const o = await marketplace.offers(1);
      expect(o.bidder).to.equal(buyer.address);
      expect(o.amount).to.equal(OFFER);
      expect(o.active).to.equal(true);
    });

    it("the owner can't offer on their own NFT; durations and amounts are validated", async function () {
      await expect(marketplace.connect(seller).makeOffer(addr, 0, DAY, { value: OFFER })).to.be.revertedWithCustomError(
        marketplace,
        "OwnerCannotOffer"
      );
      await expect(marketplace.connect(buyer).makeOffer(addr, 0, 60, { value: OFFER })).to.be.revertedWithCustomError(marketplace, "BadDuration");
      await expect(marketplace.connect(buyer).makeOffer(addr, 0, 31 * DAY, { value: OFFER })).to.be.revertedWithCustomError(
        marketplace,
        "BadDuration"
      );
      await expect(marketplace.connect(buyer).makeOffer(addr, 0, DAY, { value: 0 })).to.be.revertedWithCustomError(marketplace, "ZeroPrice");
    });

    it("a bidder can cancel and gets the escrow back; nobody else can cancel", async function () {
      await marketplace.connect(buyer).makeOffer(addr, 0, DAY, { value: OFFER });
      await expect(marketplace.connect(stranger).cancelOffer(1)).to.be.revertedWithCustomError(marketplace, "NotBidder");

      const before = await ethers.provider.getBalance(buyer.address);
      const tx = await marketplace.connect(buyer).cancelOffer(1);
      const rc = await tx.wait();
      const after = await ethers.provider.getBalance(buyer.address);
      expect(after - before + rc.gasUsed * rc.gasPrice).to.equal(OFFER);
      expect((await marketplace.offers(1)).active).to.equal(false);
      await expect(marketplace.connect(buyer).cancelOffer(1)).to.be.revertedWithCustomError(marketplace, "OfferNotActive");
    });

    it("Sell Now: the NFT goes to the bidder and the seller is paid from escrow", async function () {
      await marketplace.connect(buyer).makeOffer(addr, 0, DAY, { value: OFFER });

      const before = await ethers.provider.getBalance(seller.address);
      const tx = await marketplace.connect(seller).sellNow(1, OFFER);
      const rc = await tx.wait();
      const after = await ethers.provider.getBalance(seller.address);

      // 5 KII - 2.5% protocol (0.125) - 5% royalty (0.25) = 4.625 KII, paid straight to the seller
      expect(after - before + rc.gasUsed * rc.gasPrice).to.equal(ethers.parseEther("4.625"));
      expect(await c.ownerOf(0)).to.equal(buyer.address);
      expect((await marketplace.offers(1)).active).to.equal(false);
      expect(await marketplace.pendingWithdrawals(creator.address)).to.equal(ethers.parseEther("0.25"));
      expect(await marketplace.pendingWithdrawals(feeRecipient.address)).to.equal(ethers.parseEther("0.125"));
      expect(await marketplace.collectionVolumeKii(addr)).to.equal(OFFER);
      // escrow holds exactly what is still owed (the two pull-payment balances)
      expect(await ethers.provider.getBalance(mAddr)).to.equal(ethers.parseEther("0.375"));
    });

    it("only the owner can Sell Now, and minAmount protects them", async function () {
      await marketplace.connect(buyer).makeOffer(addr, 0, DAY, { value: OFFER });
      await expect(marketplace.connect(stranger).sellNow(1, 0)).to.be.revertedWithCustomError(marketplace, "NotTokenOwner");
      await expect(marketplace.connect(seller).sellNow(1, OFFER + 1n)).to.be.revertedWithCustomError(marketplace, "OfferTooLow");
    });

    it("an expired offer can't be sold into, but the bidder can still cancel it", async function () {
      await marketplace.connect(buyer).makeOffer(addr, 0, DAY, { value: OFFER });
      await increase(DAY + 10);
      await expect(marketplace.connect(seller).sellNow(1, 0)).to.be.revertedWithCustomError(marketplace, "OfferExpired");
      await expect(marketplace.connect(buyer).cancelOffer(1)).to.not.be.reverted;
    });

    it("Sell Now also retires the seller's own listing of that token", async function () {
      await marketplace.connect(seller).list(addr, 0, ethers.parseEther("20"));
      await marketplace.connect(buyer).makeOffer(addr, 0, DAY, { value: OFFER });
      await marketplace.connect(seller).sellNow(1, OFFER);
      expect((await marketplace.listings(1)).active).to.equal(false);
      expect(await marketplace.activeListingId(addr, 0)).to.equal(0n);
    });

    it("an offer stays valid for the next owner if the token changes hands", async function () {
      await marketplace.connect(buyer).makeOffer(addr, 0, DAY, { value: OFFER });
      await c.connect(seller).transferFrom(seller.address, stranger.address, 0);
      await expect(marketplace.connect(seller).sellNow(1, 0)).to.be.revertedWithCustomError(marketplace, "NotTokenOwner");
      await expect(marketplace.connect(stranger).sellNow(1, 0)).to.not.be.reverted;
      expect(await c.ownerOf(0)).to.equal(buyer.address);
    });

    it("the highest of several offers can be taken", async function () {
      await marketplace.connect(buyer).makeOffer(addr, 0, DAY, { value: ethers.parseEther("2") }); // 1
      await marketplace.connect(stranger).makeOffer(addr, 0, DAY, { value: ethers.parseEther("7") }); // 2
      await marketplace.connect(seller).sellNow(2, ethers.parseEther("7"));
      expect(await c.ownerOf(0)).to.equal(stranger.address);
      // the lower offer is untouched and still refundable
      expect((await marketplace.offers(1)).active).to.equal(true);
      await expect(marketplace.connect(buyer).cancelOffer(1)).to.not.be.reverted;
    });
  });
  // ---------------------------------------------------------------- whitelist
  describe("whitelist window", function () {
    async function whitelistedCollection(extra = {}) {
      const t = await now();
      const tree = merkle([buyer.address, seller.address, stranger.address]);
      const c = await create({
        maxSupply: 20,
        price: ethers.parseEther("2"),
        wlPrice: ethers.parseEther("1"),
        wlRoot: tree.root,
        wlStart: t + 100,
        wlEnd: t + 3600,
        start: t + 3600, // public mint opens right when the whitelist closes
        end: t + 2 * DAY,
        ...extra,
      });
      return { c, tree, t };
    }

    it("only whitelisted wallets can mint, and only inside the window", async function () {
      const { c, tree } = await whitelistedCollection();
      const owner2 = owner; // a wallet that is NOT on the list

      await expect(c.connect(buyer).whitelistMint(1, tree.proof(buyer.address), { value: ethers.parseEther("1") })).to.be.revertedWithCustomError(
        c,
        "WhitelistNotOpen"
      );

      await increase(200); // window open
      expect(await c.whitelistOpen()).to.equal(true);
      await c.connect(buyer).whitelistMint(2, tree.proof(buyer.address), { value: ethers.parseEther("2") });
      expect(await c.balanceOf(buyer.address)).to.equal(2n);

      // wrong proof / wallet not on the list
      await expect(c.connect(owner2).whitelistMint(1, tree.proof(buyer.address), { value: ethers.parseEther("1") })).to.be.revertedWithCustomError(
        c,
        "NotWhitelisted"
      );
      await expect(c.connect(owner2).whitelistMint(1, [], { value: ethers.parseEther("1") })).to.be.revertedWithCustomError(c, "NotWhitelisted");
    });

    it("whitelisted wallets pay the whitelist price", async function () {
      const { c, tree } = await whitelistedCollection();
      await increase(200);
      await expect(c.connect(seller).whitelistMint(1, tree.proof(seller.address), { value: ethers.parseEther("0.5") })).to.be.revertedWithCustomError(
        c,
        "InsufficientPayment"
      );
      await c.connect(seller).whitelistMint(1, tree.proof(seller.address), { value: ethers.parseEther("1") });
      expect(await c.proceeds()).to.equal(ethers.parseEther("1"));
    });

    it("public minting is closed during the whitelist window and opens after it", async function () {
      const { c } = await whitelistedCollection();
      await increase(200);
      await expect(c.connect(stranger).publicMint(1, { value: ethers.parseEther("2") })).to.be.revertedWithCustomError(c, "MintNotOpen");
      await increase(3600); // whitelist over, public mint open
      expect(await c.whitelistOpen()).to.equal(false);
      await expect(c.connect(stranger).publicMint(1, { value: ethers.parseEther("2") })).to.not.be.reverted;
    });

    it("the whitelist can no longer be used after its window closes", async function () {
      const { c, tree } = await whitelistedCollection();
      await increase(3700);
      await expect(c.connect(buyer).whitelistMint(1, tree.proof(buyer.address), { value: ethers.parseEther("1") })).to.be.revertedWithCustomError(
        c,
        "WhitelistNotOpen"
      );
    });

    it("the per-wallet limit counts whitelist and public mints together", async function () {
      const { c, tree } = await whitelistedCollection({ perWallet: 2 });
      await increase(200);
      await c.connect(buyer).whitelistMint(2, tree.proof(buyer.address), { value: ethers.parseEther("2") });
      await increase(3600);
      await expect(c.connect(buyer).publicMint(1, { value: ethers.parseEther("2") })).to.be.revertedWithCustomError(c, "WalletLimitReached");
    });

    it("works with a single-address list and a two-address list", async function () {
      const t = await now();
      const one = merkle([buyer.address]);
      const c1 = await create({ wlRoot: one.root, wlStart: t + 50, wlEnd: t + 500, start: t + 500, end: t + DAY });
      await increase(60);
      await expect(c1.connect(buyer).whitelistMint(1, one.proof(buyer.address))).to.not.be.reverted;

      const t2 = await now();
      const two = merkle([buyer.address, seller.address]);
      const c2 = await create({ wlRoot: two.root, wlStart: t2 + 50, wlEnd: t2 + 500, start: t2 + 500, end: t2 + DAY });
      await increase(60);
      await expect(c2.connect(seller).whitelistMint(1, two.proof(seller.address))).to.not.be.reverted;
    });

    it("rejects impossible whitelist schedules", async function () {
      const t = await now();
      const tree = merkle([buyer.address]);
      // whitelist ends after the public mint starts
      await expect(create({ wlRoot: tree.root, wlStart: t + 10, wlEnd: t + 5000, start: t + 1000, end: t + DAY })).to.be.revertedWithCustomError(
        factory,
        "BadSchedule"
      );
      // whitelist with an immediate public start leaves no room for it
      await expect(create({ wlRoot: tree.root, wlStart: 0, wlEnd: t + 5000, start: 0, end: t + DAY })).to.be.revertedWithCustomError(factory, "BadSchedule");
    });
  });

  // ------------------------------------------------------------------- reveal
  describe("reveal", function () {
    it("shows the placeholder until the reveal time, then the real metadata", async function () {
      const t = await now();
      const c = await create({ baseURI: "ipfs://real/", placeholderURI: "ipfs://placeholder.json", revealTime: t + 3600 });
      await c.connect(buyer).publicMint(2);
      expect(await c.revealed()).to.equal(false);
      expect(await c.tokenURI(0)).to.equal("ipfs://placeholder.json");
      expect(await c.tokenURI(1)).to.equal("ipfs://placeholder.json");

      await increase(3601);
      expect(await c.revealed()).to.equal(true);
      expect(await c.tokenURI(0)).to.equal("ipfs://real/0");
      expect(await c.tokenURI(1)).to.equal("ipfs://real/1");
    });

    it("the creator can reveal early, and only the creator", async function () {
      const t = await now();
      const c = await create({ baseURI: "ipfs://real/", placeholderURI: "ipfs://placeholder.json", revealTime: t + DAY });
      await c.connect(buyer).publicMint(1);
      await expect(c.connect(stranger).revealNow()).to.be.revertedWithCustomError(c, "OwnableUnauthorizedAccount");
      await expect(c.connect(creator).revealNow()).to.emit(c, "Revealed");
      expect(await c.tokenURI(0)).to.equal("ipfs://real/0");
      await expect(c.connect(creator).revealNow()).to.be.revertedWithCustomError(c, "AlreadyRevealed");
    });

    it("without a reveal time, metadata is visible immediately", async function () {
      const c = await create({ baseURI: "ipfs://real/" });
      await c.connect(buyer).publicMint(1);
      expect(await c.revealed()).to.equal(true);
      expect(await c.tokenURI(0)).to.equal("ipfs://real/0");
    });

    it("a reveal needs a placeholder, and the reveal time must be in the future", async function () {
      const t = await now();
      await expect(create({ revealTime: t + 3600, placeholderURI: "" })).to.be.revertedWithCustomError(
        await ethers.getContractFactory("NFTCollection"),
        "PlaceholderRequired"
      );
      await expect(create({ revealTime: t - 10, placeholderURI: "ipfs://p.json" })).to.be.revertedWithCustomError(factory, "BadSchedule");
    });

    it("tokenURI of a token that doesn't exist reverts", async function () {
      const c = await create({ placeholderURI: "ipfs://p.json", revealTime: (await now()) + 3600 });
      await expect(c.tokenURI(5)).to.be.reverted;
    });
  });
});
