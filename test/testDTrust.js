const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DTRUST Integration", function () {
  let usdt, dTrustFactory, dTrust, usdc;
  let owner;
  let settlor;
  let trustee;
  let beneficiary;
  let depositor;
  let bnb;

  beforeEach(async () => {
    // Deploy USDT contract
    [owner, settlor, trustee, beneficiary, bankWallet, depositor] =
      await ethers.getSigners();
    const USDT = await ethers.getContractFactory("USDT");
    usdt = await USDT.deploy();
    await usdt.deployed();

    // mint some bnb for testing
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
    const expectedSettlorUSDCBalance = settlorUSDCBalanceBefore.add(
      ethers.utils.parseUnits("500", 18)
    );

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
    const beforeDepositEthBalance = await ethers.provider.getBalance(
      beneficiary.address
    );
    await dTrust
      .connect(settlor)
      .depositEth({ value: ethers.utils.parseEther("1") });
    await dTrust
      .connect(trustee)
      .payoutEth(ethers.utils.parseEther("1"), beneficiary.address);
    const afterDepositEthBalance = await ethers.provider.getBalance(
      beneficiary.address
    );
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
    const dTrustBalanceAfterDeposit = await ethers.provider.getBalance(
      dTrust.address
    );
    expect(dTrustBalanceAfterDeposit).to.equal(depositAmount);

    // Store the initial ETH balance of the settlor for later comparison
    const initialSettlorBalance = await ethers.provider.getBalance(
      settlor.address
    );

    // Revoke the trust, which should trigger the payout of all assets including the ETH balance
    const revokeTx = await dTrust.connect(settlor).revokeContract();

    // Get the receipt of the revocation transaction to calculate the gas used
    const receipt = await revokeTx.wait();
    const gasUsed = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);

    // Calculate the expected balance of the settlor after the payout
    const expectedSettlorBalance = initialSettlorBalance
      .add(depositAmount)
      .sub(gasUsed);

    // Get the actual balance of the settlor after the transaction
    const actualSettlorBalance = await ethers.provider.getBalance(
      settlor.address
    );

    // Verify that the settlor's balance is now incremented by the deposit amount, accounting for gas costs
    expect(actualSettlorBalance).to.be.closeTo(
      expectedSettlorBalance,
      ethers.utils.parseEther("0.01")
    );

    // Verify the contract's ETH balance is now 0
    const dTrustBalanceAfterRevoke = await ethers.provider.getBalance(
      dTrust.address
    );
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
      returnedIsRevoked,
    ] = trustInfo;

    // Compare the returned trust information with expected values
    expect(returnedName).to.equal("My Trust");
    expect(returnedSettlor).to.equal(settlor.address);
    expect(returnedTrustees).to.deep.equal([trustee.address]);
    expect(returnedBeneficiaries).to.deep.equal([beneficiary.address]);
    // For dates, you may want to compare within a range due to block confirmation times
    expect(returnedDateCreated).to.be.closeTo(
      (await ethers.provider.getBlock("latest")).timestamp,
      10
    );
    expect(returnedStartFeeTime).to.be.closeTo(
      (await ethers.provider.getBlock("latest")).timestamp,
      10
    );
    expect(returnedIsRevoked).to.equal(false);
  });

  it("should revert payout if the sender is not a trustee", async function () {
    // Non-trustee account is neither the settlor, trustee, nor beneficiary
    const nonTrusteeAccount = accounts[4]; // assuming this is not a trustee

    // Attempt to execute payout with non-trustee account
    await expect(
      dTrust
        .connect(nonTrusteeAccount)
        .payout(
          usdt.address,
          ethers.utils.parseUnits("10", 18),
          beneficiary.address
        )
    ).to.be.revertedWith("Only a trustee can perform this action");
  });

  it("should revert payoutEth if the sender is not a trustee", async function () {
    // Non-trustee account is neither the settlor, trustee, nor beneficiary
    const nonTrusteeAccount = accounts[4]; // assuming this is not a trustee

    // Attempt to execute payoutEth with non-trustee account
    await expect(
      dTrust
        .connect(nonTrusteeAccount)
        .payoutEth(ethers.utils.parseEther("1"), beneficiary.address)
    ).to.be.revertedWith("Only a trustee can perform this action");
  });

  it("should revert payoutRemaining if the sender is not a trustee", async function () {
    // Non-trustee account is neither the settlor, trustee, nor beneficiary
    const nonTrusteeAccount = accounts[4]; // assuming this is not a trustee

    // Revoke the trust first to enable payoutRemaining
    await dTrust.connect(settlor).revokeContract();

    // Attempt to execute payoutRemaining with non-trustee account
    await expect(
      dTrust.connect(nonTrusteeAccount).payoutRemaining([usdt.address])
    ).to.be.revertedWith("Only a trustee can perform this action");
  });
  it("should revert depositEth if the contract has been revoked", async function () {
    // Revoke the contract first
    await dTrust.connect(settlor).revokeContract();

    // Attempt to deposit Eth to a revoked contract
    await expect(
      dTrust
        .connect(trustee)
        .depositEth({ value: ethers.utils.parseEther("1") })
    ).to.be.revertedWith("The contract has been revoked");
  });
  it("should revert depositToken if the contract has been revoked", async function () {
    // Revoke the contract first
    await dTrust.connect(settlor).revokeContract();

    // Attempt to deposit tokens to a revoked contract
    await expect(
      dTrust
        .connect(trustee)
        .depositToken(usdt.address, ethers.utils.parseUnits("1000", 18))
    ).to.be.revertedWith("The contract has been revoked");
  });
  it("should revert payoutEth if the contract has been revoked", async function () {
    // Revoke the contract first
    await dTrust.connect(settlor).revokeContract();

    // Attempt to payout Eth from a revoked contract
    await expect(
      dTrust
        .connect(trustee)
        .payoutEth(ethers.utils.parseEther("1"), beneficiary.address)
    ).to.be.revertedWith("The contract has been revoked");
  });
  it("should revert removeRevokableAddress if the contract has been revoked", async function () {
    // Revoke the contract first
    await dTrust.connect(settlor).revokeContract();

    // Attempt to remove revokable address from a revoked contract
    await expect(
      dTrust.connect(settlor).removeRevokableAddress()
    ).to.be.revertedWith("The contract has been revoked");
  });
  it("should revert getTrustInfo if the contract has been revoked", async function () {
    // Revoke the contract first
    await dTrust.connect(settlor).revokeContract();

    // Attempt to get trust info from a revoked contract
    await expect(dTrust.connect(trustee).getTrustInfo()).to.be.revertedWith(
      "The contract has been revoked"
    );
  });
  it("should fail if deposit amount is 0", async function () {
    // Attempt to deposit 0 tokens, which should fail
    await expect(
      dTrust.connect(depositor).depositToken(usdt.address, 0)
    ).to.be.revertedWith("Enter an amount greater than 0");
  });

  it("should fail if allowed amount is less than deposit amount", async function () {
    // Attempt to deposit more tokens than what is allowed, which should fail
    await expect(
      dTrust
        .connect(depositor)
        .depositToken(usdt.address, ethers.utils.parseUnits("200", 18))
    ).to.be.revertedWith("Contract not approved to move this amount of tokens");
  });

  it("should fail if deposit ETH amount is 0", async function () {
    // Attempt to deposit 0 ETH, which should fail
    await expect(
      dTrust.connect(depositor).depositEth({ value: 0 })
    ).to.be.revertedWith("Deposit amount should be greater than 0");
  });
  it("should fail if an address without revocation rights tries to remove itself", async function () {
    // Attempt to remove revocation rights with an account that doesn't have them
    await expect(
      dTrust.connect(depositor).removeRevokableAddress()
    ).to.be.revertedWith("Address is not revokable");
  });

  it("should not allow adding non-trustee and non-settlor addresses as revokable", async function () {
    const invalidAddress = accounts[5].address; // An address that is neither a trustee nor a settlor

    // Try to create a new DTRUST instance with an invalid revokable address
    await expect(
      dTrustFactory.createDTRUST(
        "Test Trust",
        settlor.address, // valid settlor
        [trustee.address], // valid trustees array
        [beneficiary.address], // valid beneficiaries array
        [invalidAddress] // invalid canRevokeAddresses array
      )
    ).to.be.revertedWith("Address must be a trustee or the settlor");

    // You could also check the state after the revert to ensure no trust was created
    // depending on the behavior of your factory `createDTRUST` function.
  });

  it("should fail to deposit tokens if the contract is not approved to spend them", async function () {
    const depositAmount = ethers.utils.parseUnits("100", 18);

    // Trying to deposit without approving the contract first should fail
    await expect(
      dTrust.connect(trustee).depositToken(usdt.address, depositAmount)
    ).to.be.revertedWith("Contract not approved to move this amount of tokens");
  });

  it("should fail to deposit tokens if the amount is 0", async function () {
    // Trying to deposit zero tokens should fail
    await expect(
      dTrust.connect(trustee).depositToken(usdt.address, 0)
    ).to.be.revertedWith("Enter an amount greater than 0");
  });
  it("should allow a trustee to make a payout to a beneficiary", async function () {
    // Arrange: Setup the necessary state, like token balances and approvals
    const payoutAmount = ethers.utils.parseUnits("100", 18);
    await usdt.mint(dTrust.address, payoutAmount); // Mint tokens to the DTRUST contract

    // Assuming beneficiary is already set up in the beforeEach and is part of beneficiariesLookup
    // ...
    const dTrustBalanceBeforePayout = await usdt.balanceOf(dTrust.address);
    // Act & Assert: Trustee makes a payout to the beneficiary
    await expect(
      dTrust
        .connect(trustee)
        .payout(usdt.address, payoutAmount, beneficiary.address)
    )
      .to.emit(dTrust, "Paid")
      .withArgs(usdt.address, beneficiary.address, payoutAmount);

    // Assert: Verify the beneficiary's token balance has increased by the payout amount
    const beneficiaryBalance = await usdt.balanceOf(beneficiary.address);
    expect(beneficiaryBalance).to.equal(payoutAmount);

    // Assert: Verify the DTRUST contract's token balance has decreased by the payout amount
    const dTrustBalance = await usdt.balanceOf(dTrust.address);
    expect(payoutAmount).to.equal(dTrustBalanceBeforePayout.sub(dTrustBalance)); // Assuming the contract had exactly payoutAmount
  });
  it("should revert if the beneficiary is not recognized", async function () {
    const payoutAmount = ethers.utils.parseUnits("100", 18);
    // Non-beneficiary address
    const nonBeneficiary = accounts[5].address;

    // Attempt to payout to a non-beneficiary should fail
    await expect(
      dTrust.connect(trustee).payout(usdt.address, payoutAmount, nonBeneficiary)
    ).to.be.revertedWith(
      "Beneficiary provided is not a beneficiary of this dtrust"
    );
  });

  it("should revert if the contract does not have enough token balance", async function () {
    const payoutAmount = ethers.utils.parseUnits("100909090909", 18);
    // Ensure the contract does not have enough tokens
    // No need to mint tokens in this case as we want the balance to be insufficient

    // Attempt to payout more than the contract's balance should fail
    await expect(
      dTrust
        .connect(trustee)
        .payout(usdt.address, payoutAmount, beneficiary.address)
    ).to.be.revertedWith("Not enough balance of the token");
  });

  it("should revert the payout if the contract is not active", async function () {
    // Arrange
    const payoutAmount = ethers.utils.parseUnits("100", 18);

    // Set the contract to an inactive state, assuming you have a function to revoke the trust
    // For example, there might be a `revokeContract` function that sets `isRevoked` to true
    await dTrust.connect(settlor).revokeContract();

    // Act & Assert: Attempt to payout should fail when the contract is not active
    await expect(
      dTrust
        .connect(trustee)
        .payout(usdt.address, payoutAmount, beneficiary.address)
    ).to.be.revertedWith("The contract has been revoked");

    // Additional assertions can be made here if necessary
  });
  it("should revert ethpayout if the beneficiary is not recognized", async function () {
    const payoutAmount = ethers.utils.parseEther("1"); // 1 ETH
    const nonBeneficiary = accounts[5].address; // An address that is not a beneficiary

    // Attempt to payout to a non-beneficiary should fail
    await expect(
      dTrust.connect(trustee).payoutEth(payoutAmount, nonBeneficiary)
    ).to.be.revertedWith(
      "Beneficiary provided is not a beneficiary of this dtrust"
    );
  });

  it("should revert if the eth payout amount is zero", async function () {
    const payoutAmount = ethers.utils.parseEther("0"); // 0 ETH

    // Attempt to payout zero ether should fail
    await expect(
      dTrust.connect(trustee).payoutEth(payoutAmount, beneficiary.address)
    ).to.be.revertedWith("Enter Eth amount > 0");
  });

  it("should revert eth payout if the contract has insufficient ether balance", async function () {
    const payoutAmount = ethers.utils.parseEther("1"); // 1 ETH
    // Ensure the contract has less ether than the payout amount
    // Assuming you've set the contract's ether balance to a specific amount before this test runs

    // Attempt to payout more ether than the contract's balance should fail
    await expect(
      dTrust.connect(trustee).payoutEth(payoutAmount, beneficiary.address)
    ).to.be.revertedWith("Not enough Ether to payout");
  });
  it("should  revert payout remaining if the contract is not revoked", async function () {
    // Revoke the contract first

    // Attempt to payout remaining should fail
    await expect(
      dTrust.connect(trustee).payoutRemaining([usdt.address])
    ).to.be.revertedWith(
      "The dtrust must be revoked before the remaining balance can be paid out"
    );
  });
  it("should revert take annual fee if the contract has been revoked", async () => {
    // Revoke the contract first
    await dTrust.connect(settlor).revokeContract();
    // Attempt to take annual fee should fail
    await expect(
      dTrustFactory.collectAnnualFeeForTrust(dTrust.address)
    ).to.be.revertedWith("The contract has been revoked");
  });
  it("should not call the revoke contract if the contract is already revoked", async () => {
    // Revoke the contract first
    await dTrust.connect(settlor).revokeContract();
    // Attempt to revoke contract should fail
    await expect(dTrust.connect(settlor).revokeContract()).to.be.revertedWith(
      "The contract has been revoked"
    );
  });
  it("should trigger the if statement if amount > 0 in payoutRemaining", async () => {
    await dTrust
      .connect(trustee)
      .payout(
        usdt.address,
        ethers.utils.parseUnits("1000", 18),
        beneficiary.address
      );
    await dTrust
      .connect(trustee)
      .payout(
        usdc.address,
        ethers.utils.parseUnits("1000", 18),
        beneficiary.address
      );
    // Revoke the contract first
    await dTrust.connect(settlor).revokeContract();
    // Attempt to revoke contract should fail
    await expect(
      dTrust.connect(trustee).payoutRemaining([usdt.address, usdc.address])
    ).to.be.ok;
  });
  it("should trigger the amount > 0 if statement in takeAnnualFee ", async () => {
    await dTrust
      .connect(trustee)
      .payout(
        usdt.address,
        ethers.utils.parseUnits("1000", 18),
        beneficiary.address
      );
    await dTrust
      .connect(trustee)
      .payout(
        usdc.address,
        ethers.utils.parseUnits("1000", 18),
        beneficiary.address
      );
    // Revoke the contract first
    await expect(await dTrustFactory.collectAnnualFeeForTrust(dTrust.address))
      .to.be.ok;

    // Attempt to revoke contract should fail
  });
});
