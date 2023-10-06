const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DTRUST Integration", function() {
    let usdt, dTrustFactory, dTrust, usdc;
    let owner;
    let settlor;
    let trustee;
    let beneficiary;

    beforeEach(async () => {
        // Deploy USDT contract
        [owner, settlor, trustee, beneficiary, bankWallet ] = await ethers.getSigners();
        const USDT = await ethers.getContractFactory("USDT"); 
        usdt = await USDT.deploy();
        await usdt.deployed();

        // Deploy the USDC contract
        const USDC = await ethers.getContractFactory("USDC");
        usdc = await USDC.deploy();
        await usdc.deployed();

        // Deploy DTRUSTFactory contract
        const DTrustFactory = await ethers.getContractFactory("DTRUSTFactory");
        dTrustFactory = await DTrustFactory.deploy(bankWallet.address);
        await dTrustFactory.deployed();

        const _name = "My Trust";
        const _settlor = settlor.address;
        const _trustees = [trustee.address];
        const _beneficiaries = [beneficiary.address];
        const _canRevokeAddresses = [settlor.address];

        // Use the DTRUSTFactory to create a DTRUST contract
        await dTrustFactory.createDTRUST(
            _name,
            _settlor,
            _trustees,
            _beneficiaries,
            _canRevokeAddresses
        );
        
        // Assuming the first contract created is at index 0 (or get the address from an emitted event)
        const dTrustAddress = await dTrustFactory.allDTrusts(0);
        dTrust = await ethers.getContractAt("DTRUST", dTrustAddress);

        accounts = await ethers.getSigners();
        
        // Mint some USDT for testing
        await usdt.mint(owner.address, ethers.utils.parseUnits("1000", 18));
        await usdc.mint(owner.address, ethers.utils.parseUnits("1000", 18));
        // Approve the DTRUST to spend USDT
        await usdt.connect(owner).approve(dTrust.address, ethers.utils.parseUnits("1000", 18));
        await usdc.connect(owner).approve(dTrust.address, ethers.utils.parseUnits("1000", 18));

        // Use the deposit function of the DTRUST contract
        await dTrust.connect(owner).depositToken(usdt.address, ethers.utils.parseUnits("1000", 18));
        await dTrust.connect(owner).depositToken(usdc.address, ethers.utils.parseUnits("1000", 18));
    });

    it("should take the correct annual fee in USDT", async function() {
        // Use the factory to collect the annual fee
        await dTrustFactory.collectAnnualFeeForTrust(dTrust.address); 
    
        // Check balances
        const bankWalletBalance = await usdt.balanceOf(bankWallet.address);
        expect(bankWalletBalance).to.equal(ethers.utils.parseUnits("1", 18)); // 0.10% of 1000 USDT
    });

    it("should only allow DTRUSTFactory to call collectAnnualFeeForTrust", async function() {
        const feePercentage = 10;  // 0.10% as a value (since it represents 0.10%)
    
        // Try to use the function from an unauthorized account (e.g., the settlor)
        await expect(dTrust.connect(settlor).takeAnnualFee(bankWallet.address, feePercentage))
            .to.be.revertedWith("You must be the control wallet");
    
        // Use the factory to collect the annual fee (this should be successful)
        await dTrustFactory.collectAnnualFeeForTrust(dTrust.address);  // Assuming this function also passes the required fee percentage
    
        // Check balances (assuming a successful fee collection for validation)
        const bankWalletBalance = await usdt.balanceOf(bankWallet.address);
        expect(bankWalletBalance).to.equal(ethers.utils.parseUnits("1", 18)); // 0.10% of 1000 USDT
    });

    it("should not allow taking the fee twice in quick succession", async function() {
    
        // First, use the factory to collect the annual fee (this should be successful)
        await dTrustFactory.collectAnnualFeeForTrust(dTrust.address); 
    
        // Check balances after first collection (just for validation)
        let bankWalletBalance = await usdt.balanceOf(bankWallet.address);
        expect(bankWalletBalance).to.equal(ethers.utils.parseUnits("1", 18)); // 0.10% of 1000 USDT
    
        // Attempt to collect the fee again immediately (this should fail)
        await expect(dTrustFactory.collectAnnualFeeForTrust(dTrust.address))
            .to.be.revertedWith("Not yet time to collect fee");
    
        // Check balances again to ensure no additional fee was collected
        bankWalletBalance = await usdt.balanceOf(bankWallet.address);
        expect(bankWalletBalance).to.equal(ethers.utils.parseUnits("1", 18)); // The balance should remain the same
    });

    it("should correctly take the annual fee in ETH", async function() {
        // default ETH balance is 10000000000000000000000
        let initialBankWalletBalance = await ethers.provider.getBalance(bankWallet.address);
    
        // Send 10 ethers to the DTRUST contract from the settlor
        await settlor.sendTransaction({
            to: dTrust.address,
            value: ethers.utils.parseEther("10")
        });
    
        // Verify the DTRUST contract's ETH balance is 10 ethers
        let dTrustBalance = await ethers.provider.getBalance(dTrust.address);
        expect(dTrustBalance).to.equal(ethers.utils.parseEther("10"));
    
        // Use the factory to collect the annual fee
        await dTrustFactory.collectAnnualFeeForTrust(dTrust.address); 

        let expectedBankWalletBalance = initialBankWalletBalance.add(ethers.utils.parseEther("0.01"));
        bankWalletBalance = await ethers.provider.getBalance(bankWallet.address);
        expect(bankWalletBalance).to.equal(expectedBankWalletBalance);
    
        // Verify the DTRUST contract's ETH balance is now reduced by the fee amount
        dTrustBalance = await ethers.provider.getBalance(dTrust.address);
        expect(dTrustBalance).to.equal(ethers.utils.parseEther("9.99")); // 10 - 0.01 = 9.99 ethers
    });

    it("should update the startFeeTime after taking the annual fee", async function() {
    
        // Send 10 ethers to the DTRUST contract from the settlor for testing
        await settlor.sendTransaction({
            to: dTrust.address,
            value: ethers.utils.parseEther("10")
        });
    
        // Get the initial startFeeTime of the DTRUST contract
        let initialStartFeeTime = await dTrust.startFeeTime();
    
        // Use the factory to collect the annual fee
        await dTrustFactory.collectAnnualFeeForTrust(dTrust.address); 
    
        // Verify that the startFeeTime is incremented by 365 days after taking the fee
        let newStartFeeTime = await dTrust.startFeeTime();
        expect(newStartFeeTime).to.equal(initialStartFeeTime.add(365 * 24 * 60 * 60));  // 365 days in seconds
    });

    it("should correctly take the annual fee for both USDT and USDC", async function() {
        // Use the factory to collect the annual fee
        await dTrustFactory.collectAnnualFeeForTrust(dTrust.address);
    
        // Check balances for both tokens
        const bankWalletUSDTBalance = await usdt.balanceOf(bankWallet.address);
        expect(bankWalletUSDTBalance).to.equal(ethers.utils.parseUnits("1", 18));  // 0.10% of 1000 USDT
    
        const bankWalletUSDCBalance = await usdc.balanceOf(bankWallet.address);
        expect(bankWalletUSDCBalance).to.equal(ethers.utils.parseUnits("1", 18));  // 0.10% of 1000 USDC
    });

});
