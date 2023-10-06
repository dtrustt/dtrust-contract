const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("DTRUSTFactory", function() {
    let DTRUSTFactoryContract;
    let owner;
    let settlor;
    let trustee;
    let beneficiary;

    beforeEach(async function() {
        const DTRUSTFactory = await ethers.getContractFactory("DTRUSTFactory");
        [owner, settlor, trustee, beneficiary] = await ethers.getSigners();

        DTRUSTFactoryContract = await DTRUSTFactory.deploy(owner.address);
        await DTRUSTFactoryContract.deployed();
    });

    it("should create a DTRUST correctly", async function() {
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
        
        expect(await DTRUSTFactoryContract.getAllDTrustsCount()).to.equal(initialCount + 1);

        const dtrustsByUser = await DTRUSTFactoryContract.getDTrustsByUser(_settlor);
        expect(dtrustsByUser.length).to.equal(1);

        const newDTRUSTAddress = await DTRUSTFactoryContract.allDTrusts(initialCount);
        expect(dtrustsByUser[0]).to.equal(newDTRUSTAddress);
    });

    it("should correctly return all DTRUSTs for a user", async function() {
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

      const dtrustsByUser = await DTRUSTFactoryContract.getDTrustsByUser(_settlor);
      expect(dtrustsByUser.length).to.equal(2);
      
  });

});
