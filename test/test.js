const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("DTRUSTFactory", function () {
  let DTRUSTFactoryContract;
  let owner;
  let settlor;
  let trustee;
  let beneficiary;
  let dtrust;
  let usdt;

  beforeEach(async function () {
    const DTRUSTFactory = await ethers.getContractFactory("DTRUSTFactory");
    [owner, settlor, trustee, beneficiary] = await ethers.getSigners();

    DTRUSTFactoryContract = await DTRUSTFactory.deploy(owner.address);
    await DTRUSTFactoryContract.deployed();
    const USDT = await ethers.getContractFactory("USDT");
    usdt = await USDT.deploy();
    await usdt.deployed();
  });

  it("should create a DTRUST correctly", async function () {
    const initialCount = await DTRUSTFactoryContract.getAllDTrustsCount();

    const _name = "My Trust";
    const _settlor = settlor.address;
    const _trustees = [trustee.address];
    const _beneficiaries = [beneficiary.address];
    const _canRevokeAddresses = [settlor.address];

    await DTRUSTFactoryContract.createDTRUST(
      _name,
      _settlor,
      _trustees,
      _beneficiaries,
      _canRevokeAddresses
    );

    expect(await DTRUSTFactoryContract.getAllDTrustsCount()).to.equal(
      initialCount + 1
    );

    const dtrustsByUser = await DTRUSTFactoryContract.getDTrustsByUser(
      _settlor
    );
    expect(dtrustsByUser.length).to.equal(1);

    const newDTRUSTAddress = await DTRUSTFactoryContract.allDTrusts(
      initialCount
    );
    expect(dtrustsByUser[0]).to.equal(newDTRUSTAddress);
  });

  it("should correctly return all DTRUSTs for a user", async function () {
    const _name = "My Trust";
    const _settlor = settlor.address;
    const _trustees = [trustee.address];
    const _beneficiaries = [beneficiary.address];
    const _canRevokeAddresses = [settlor.address];

    // Create multiple DTRUSTs with the same settlor
    await DTRUSTFactoryContract.createDTRUST(
      _name,
      _settlor,
      _trustees,
      _beneficiaries,
      _canRevokeAddresses
    );

    await DTRUSTFactoryContract.createDTRUST(
      "Another Trust",
      _settlor,
      _trustees,
      _beneficiaries,
      _canRevokeAddresses
    );

    const dtrustsByUser = await DTRUSTFactoryContract.getDTrustsByUser(
      _settlor
    );
    expect(dtrustsByUser.length).to.equal(2);
  });

  it("should not add a trustee multiple times to a DTrust", async function () {
    // Create a DTRUST with duplicate trustee addresses
    const _name = "My Trust";
    const _settlor = settlor.address;
    const _trustees = [trustee.address, trustee.address]; // Duplicate trustees
    const _beneficiaries = [beneficiary.address];
    const _canRevokeAddresses = [settlor.address];

    await DTRUSTFactoryContract.createDTRUST(
      _name,
      _settlor,
      _trustees,
      _beneficiaries,
      _canRevokeAddresses
    );

    const newDTRUSTAddress = await DTRUSTFactoryContract.allDTrusts(0);

    // Check that the trustee is only added once
    const dtrustsByTrustee = await DTRUSTFactoryContract.getDTrustsByUser(
      trustee.address
    );
    expect(dtrustsByTrustee.length).to.equal(1);
    expect(dtrustsByTrustee[0]).to.equal(newDTRUSTAddress);

    // Check isUserAddedToDTrust mapping for trustee
    expect(
      await DTRUSTFactoryContract.isUserAddedToDTrust(
        trustee.address,
        newDTRUSTAddress
      )
    ).to.be.true;
  });
  it("should trigger the token lookup if statement when the toke is deposited", async function () {
    const _name = "My Trust";
    const _settlor = settlor.address;
    const _trustees = [trustee.address];
    const _beneficiaries = [beneficiary.address];
    const _canRevokeAddresses = [settlor.address];

    await DTRUSTFactoryContract.createDTRUST(
      _name,
      _settlor,
      _trustees,
      _beneficiaries,
      _canRevokeAddresses
    );
    const dTrustAddress = await DTRUSTFactoryContract.allDTrusts(0);
    dTrust = await ethers.getContractAt("DTRUST", dTrustAddress);
    await usdt.mint(owner.address, ethers.utils.parseUnits("1000", 18));
  });
});
