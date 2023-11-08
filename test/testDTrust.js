const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DTRUST Integration", function () {
  let usdt, dTrustFactory, dTrust, usdc;
  let owner;
  let settlor;
  let trustee;
  let beneficiary;

  beforeEach(async () => {
    // Deploy USDT contract
    [owner, settlor, trustee, beneficiary, bankWallet] =
      await ethers.getSigners();
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
    await usdt
      .connect(owner)
      .approve(dTrust.address, ethers.utils.parseUnits("1000", 18));
    await usdc
      .connect(owner)
      .approve(dTrust.address, ethers.utils.parseUnits("1000", 18));

    // Use the deposit function of the DTRUST contract
    await dTrust
      .connect(owner)
      .depositToken(usdt.address, ethers.utils.parseUnits("1000", 18));
    await dTrust
      .connect(owner)
      .depositToken(usdc.address, ethers.utils.parseUnits("1000", 18));
  });

  it("should take the correct annual fee in USDT", async function () {
    // Use the factory to collect the annual fee
    await dTrustFactory.collectAnnualFeeForTrust(dTrust.address);

    // Check balances
    const bankWalletBalance = await usdt.balanceOf(bankWallet.address);
    expect(bankWalletBalance).to.equal(ethers.utils.parseUnits("1", 18)); // 0.10% of 1000 USDT
  });

  it("should only allow DTRUSTFactory to call collectAnnualFeeForTrust", async function () {
    const feePercentage = 10; // 0.10% as a value (since it represents 0.10%)

    // Try to use the function from an unauthorized account (e.g., the settlor)
    await expect(
      dTrust.connect(settlor).takeAnnualFee(bankWallet.address, feePercentage)
    ).to.be.revertedWith("You must be the control wallet");

    // Use the factory to collect the annual fee (this should be successful)
    await dTrustFactory.collectAnnualFeeForTrust(dTrust.address); // Assuming this function also passes the required fee percentage

    // Check balances (assuming a successful fee collection for validation)
    const bankWalletBalance = await usdt.balanceOf(bankWallet.address);
    expect(bankWalletBalance).to.equal(ethers.utils.parseUnits("1", 18)); // 0.10% of 1000 USDT
  });

  it("should not allow taking the fee twice in quick succession", async function () {
    // First, use the factory to collect the annual fee (this should be successful)
    await dTrustFactory.collectAnnualFeeForTrust(dTrust.address);

    // Check balances after first collection (just for validation)
    let bankWalletBalance = await usdt.balanceOf(bankWallet.address);
    expect(bankWalletBalance).to.equal(ethers.utils.parseUnits("1", 18)); // 0.10% of 1000 USDT

    // Attempt to collect the fee again immediately (this should fail)
    await expect(
      dTrustFactory.collectAnnualFeeForTrust(dTrust.address)
    ).to.be.revertedWith("Not yet time to collect fee");

    // Check balances again to ensure no additional fee was collected
    bankWalletBalance = await usdt.balanceOf(bankWallet.address);
    expect(bankWalletBalance).to.equal(ethers.utils.parseUnits("1", 18)); // The balance should remain the same
  });

  it("should correctly take the annual fee in ETH", async function () {
    // default ETH balance is 10000000000000000000000
    let initialBankWalletBalance = await ethers.provider.getBalance(
      bankWallet.address
    );

    // Send 10 ethers to the DTRUST contract from the settlor
    await settlor.sendTransaction({
      to: dTrust.address,
      value: ethers.utils.parseEther("10"),
    });

    // Verify the DTRUST contract's ETH balance is 10 ethers
    let dTrustBalance = await ethers.provider.getBalance(dTrust.address);
    expect(dTrustBalance).to.equal(ethers.utils.parseEther("10"));

    // Use the factory to collect the annual fee
    await dTrustFactory.collectAnnualFeeForTrust(dTrust.address);

    let expectedBankWalletBalance = initialBankWalletBalance.add(
      ethers.utils.parseEther("0.01")
    );
    bankWalletBalance = await ethers.provider.getBalance(bankWallet.address);
    expect(bankWalletBalance).to.equal(expectedBankWalletBalance);

    // Verify the DTRUST contract's ETH balance is now reduced by the fee amount
    dTrustBalance = await ethers.provider.getBalance(dTrust.address);
    expect(dTrustBalance).to.equal(ethers.utils.parseEther("9.99")); // 10 - 0.01 = 9.99 ethers
  });

  it("should update the startFeeTime after taking the annual fee", async function () {
    // Send 10 ethers to the DTRUST contract from the settlor for testing
    await settlor.sendTransaction({
      to: dTrust.address,
      value: ethers.utils.parseEther("10"),
    });

    // Get the initial startFeeTime of the DTRUST contract
    let initialStartFeeTime = await dTrust.startFeeTime();

    // Use the factory to collect the annual fee
    await dTrustFactory.collectAnnualFeeForTrust(dTrust.address);

    // Verify that the startFeeTime is incremented by 365 days after taking the fee
    let newStartFeeTime = await dTrust.startFeeTime();
    expect(newStartFeeTime).to.equal(
      initialStartFeeTime.add(365 * 24 * 60 * 60)
    ); // 365 days in seconds
  });

  it("should correctly take the annual fee for both USDT and USDC", async function () {
    // Use the factory to collect the annual fee
    await dTrustFactory.collectAnnualFeeForTrust(dTrust.address);

    // Check balances for both tokens
    const bankWalletUSDTBalance = await usdt.balanceOf(bankWallet.address);
    expect(bankWalletUSDTBalance).to.equal(ethers.utils.parseUnits("1", 18)); // 0.10% of 1000 USDT

    const bankWalletUSDCBalance = await usdc.balanceOf(bankWallet.address);
    expect(bankWalletUSDCBalance).to.equal(ethers.utils.parseUnits("1", 18)); // 0.10% of 1000 USDC
  });
  it("should allow the settlor to revoke the trust", async function () {
    await dTrust.connect(settlor).revokeContract();
    const isRevoked = await dTrust.isRevoked();
    expect(isRevoked).to.equal(true);
  });
  it("should remove the revoke power from the settlor and should not be able to revoke the trust", async function () {
    await dTrust.connect(settlor).removeRevokableAddress();
    await expect(dTrust.connect(settlor).revokeContract()).to.be.revertedWith(
      "You do not have permission to revoke"
    );
  });
  it("should not allow trustee to revoke the trust", async function () {
    await expect(dTrust.connect(trustee).revokeContract()).to.be.revertedWith(
      "You do not have permission to revoke"
    );
  });
  it("should payout the beneficiary", async function () {
    await dTrust
      .connect(trustee)
      .payout(
        usdt.address,
        ethers.utils.parseUnits("1000", 18),
        beneficiary.address
      );
    const usdtBalance = await usdt.balanceOf(beneficiary.address);
    expect(usdtBalance).to.equal(ethers.utils.parseEther("1000", 18));
  });
    it("should payout the remaining balance to the settlore after revoking", async function () {
            // Revoke the trust first
    await dTrust.connect(settlor).revokeContract();
    
    // Simulate adding USDC to the contract directly without calling deposit function
    // This can be done by sending USDC to the contract address from another account
    // For the test, we assume the test USDC contract allows free minting to any address
    await usdc.mint(dTrust.address, ethers.utils.parseUnits("500", 18));
    
    // Get the balance of USDC of the settlor before payout
    const settlorUSDCBalanceBefore = await usdc.balanceOf(settlor.address);
    
    // Call payoutRemaining function to payout all remaining balances to the settlor
    await dTrust.connect(trustee).payoutRemaining([usdc.address]);
    
    // Check the balance of USDC of the settlor after payout
    const settlorUSDCBalanceAfter = await usdc.balanceOf(settlor.address);
    
    // Calculate the expected settlor balance by adding the previous balance and the amount minted
    const expectedSettlorUSDCBalance = settlorUSDCBalanceBefore.add(ethers.utils.parseUnits("500", 18));
    
    // Verify the USDC balance of the settlor reflects the payout of the remaining balance
    expect(settlorUSDCBalanceAfter).to.equal(expectedSettlorUSDCBalance);
    
    // Verify the USDC balance of the contract is now 0
    const contractUSDCBalanceAfter = await usdc.balanceOf(dTrust.address);
    expect(contractUSDCBalanceAfter).to.equal(0);

    });
  it("should add eth to the trust", async function () {
    await dTrust
      .connect(settlor)
      .depositEth({ value: ethers.utils.parseEther("1") });
    const ethBalance = await ethers.provider.getBalance(dTrust.address);
    expect(ethBalance).to.equal(ethers.utils.parseEther("1"));
  });
  it("should payout the eth to the beneficiary", async function () {
    const beforeDepositEthBalance = await ethers.provider.getBalance(beneficiary.address);
    await dTrust
      .connect(settlor)
      .depositEth({ value: ethers.utils.parseEther("1") });
    await dTrust
      .connect(trustee)
      .payoutEth(ethers.utils.parseEther("1"), beneficiary.address);
    const afterDepositEthBalance = await ethers.provider.getBalance(beneficiary.address);
    const changeInBalance = afterDepositEthBalance.sub(beforeDepositEthBalance);
    expect(changeInBalance).to.equal(ethers.utils.parseEther("1"));
  });

  it("should payout all ETH balance to the settlor upon revocation", async function () {
    // Deposit some ETH into the trust
    const depositAmount = ethers.utils.parseEther("1"); // 1 ETH for simplicity
    await settlor.sendTransaction({
      to: dTrust.address,
      value: depositAmount,
    });
  
    // Confirm that the trust's balance has increased by the deposit amount
    const dTrustBalanceAfterDeposit = await ethers.provider.getBalance(dTrust.address);
    expect(dTrustBalanceAfterDeposit).to.equal(depositAmount);
  
    // Store the initial ETH balance of the settlor for later comparison
    const initialSettlorBalance = await ethers.provider.getBalance(settlor.address);
  
    // Revoke the trust, which should trigger the payout of all assets including the ETH balance
    const revokeTx = await dTrust.connect(settlor).revokeContract();
  
    // Get the receipt of the revocation transaction to calculate the gas used
    const receipt = await revokeTx.wait();
    const gasUsed = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);
  
    // Calculate the expected balance of the settlor after the payout
    const expectedSettlorBalance = initialSettlorBalance.add(depositAmount).sub(gasUsed);
  
    // Get the actual balance of the settlor after the transaction
    const actualSettlorBalance = await ethers.provider.getBalance(settlor.address);
  
    // Verify that the settlor's balance is now incremented by the deposit amount, accounting for gas costs
    expect(actualSettlorBalance).to.be.closeTo(expectedSettlorBalance, ethers.utils.parseEther("0.01"));
  
    // Verify the contract's ETH balance is now 0
    const dTrustBalanceAfterRevoke = await ethers.provider.getBalance(dTrust.address);
    expect(dTrustBalanceAfterRevoke).to.equal(0);
  });
  

  it("should return the correct trust information", async function () {
    // Call the getTrustInfo function
    const trustInfo = await dTrust.getTrustInfo();
  
    // Destructure the returned data for ease of access
    const [
      returnedName,
      returnedSettlor,
      returnedTrustees,
      returnedBeneficiaries,
      returnedDateCreated,
      returnedStartFeeTime,
      returnedIsRevoked
    ] = trustInfo;
  
    // Compare the returned trust information with expected values
    expect(returnedName).to.equal("My Trust");
    expect(returnedSettlor).to.equal(settlor.address);
    expect(returnedTrustees).to.deep.equal([trustee.address]);
    expect(returnedBeneficiaries).to.deep.equal([beneficiary.address]);
    // For dates, you may want to compare within a range due to block confirmation times
    expect(returnedDateCreated).to.be.closeTo((await ethers.provider.getBlock('latest')).timestamp, 10);
    expect(returnedStartFeeTime).to.be.closeTo((await ethers.provider.getBlock('latest')).timestamp, 10);
    expect(returnedIsRevoked).to.equal(false);
  });
});